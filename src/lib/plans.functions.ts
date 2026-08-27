import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  PLAN_SYSTEM_PROMPT,
  READ_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  buildReadPrompt,
  buildUserPrompt,
  planJsonSchema,
  reviewJsonSchema,
  summarizeGeometry,
} from "./plan-prompt";
import { normalizePlanModel } from "./plan-model";

const Input = z.object({
  projectId: z.string().uuid(),
  /** Extra corrections from the user or a previous review, fed into the measure pass. */
  refineNotes: z.string().max(4000).optional(),
});

const MODEL = "google/gemini-3.1-pro-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function callGateway(
  key: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 402) {
      throw new Error("This workspace is out of AI credits. Add credits to keep generating plans.");
    }
    if (response.status === 429) {
      throw new Error("The AI service is busy right now. Try again in a moment.");
    }
    console.error("AI gateway error", response.status, text);
    throw new Error(`Plan generation failed (${response.status}). ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI returned an empty response. Try again.");
  return content;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI returned an unreadable plan. Try again.");
    return JSON.parse(match[0]);
  }
}

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI is not configured for this app.");
    const { supabase, userId } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (projectError || !project) throw new Error("Project not found.");

    const { data: images } = await supabase
      .from("project_images")
      .select("storage_path")
      .eq("project_id", data.projectId)
      .order("sort_order", { ascending: true });

    const paths = (images ?? []).map((i) => i.storage_path).slice(0, 8);
    if (!paths.length) throw new Error("Upload at least one photo before generating a plan.");

    // Inline the photos as base64 data URLs: the model provider cannot always
    // fetch signed storage links, and inlining removes that dependency.
    const imageUrls: string[] = [];
    for (const path of paths) {
      const { data: blob } = await supabase.storage.from("project-media").download(path);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      imageUrls.push(`data:${mime};base64,${btoa(binary)}`);
    }
    if (!imageUrls.length) throw new Error("Could not read the uploaded photos.");

    // Label each photo so the model can cross-reference the views it is combining.
    const photoBlocks: ContentBlock[] = imageUrls.flatMap((url, i) => [
      {
        type: "text" as const,
        text: `Reference photo ${i + 1} of ${imageUrls.length} (same subject, different view):`,
      },
      { type: "image_url" as const, image_url: { url } },
    ]);

    /* ---- Pass 1: read the structure (massing, tops, opening shapes) ---- */
    const structureNotes = await callGateway(key, {
      messages: [
        { role: "system", content: READ_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildReadPrompt(imageUrls.length) },
            ...photoBlocks,
          ],
        },
      ],
    });

    /* ---- Pass 2: measure and write the plan against that reading ---- */
    const measure = async (refineNotes?: string) => {
      const content = await callGateway(key, {
        messages: [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildUserPrompt({
                  subjectNotes: project.subject_notes ?? "",
                  referenceNote: project.reference_note ?? "",
                  photoCount: imageUrls.length,
                  structureNotes,
                  refineNotes,
                }),
              },
              ...photoBlocks,
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "woodworking_plan", strict: true, schema: planJsonSchema },
        },
      });
      return normalizePlanModel(parseJson(content));
    };

    let model = await measure(data.refineNotes);

    /* ---- Pass 3: review the geometry against the photos, then redraft once ---- */
    let review: { verdict?: string; corrections?: string[]; knownDifferences?: string[] } = {};
    try {
      const reviewContent = await callGateway(key, {
        messages: [
          { role: "system", content: REVIEW_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Plan geometry to review:\n${summarizeGeometry(model)}`,
              },
              ...photoBlocks,
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "plan_review", strict: true, schema: reviewJsonSchema },
        },
      });
      review = parseJson(reviewContent) as typeof review;
    } catch (e) {
      console.error("Plan review pass failed", e);
    }

    const corrections = (review.corrections ?? []).filter(Boolean);
    if (review.verdict === "needs-work" && corrections.length) {
      try {
        model = await measure(
          [data.refineNotes, corrections.map((c) => `- ${c}`).join("\n")]
            .filter(Boolean)
            .join("\n"),
        );
      } catch (e) {
        console.error("Corrective redraft failed, keeping first draft", e);
      }
    }

    model.structureNotes = structureNotes;
    const disclosed = new Set([...model.knownDifferences, ...(review.knownDifferences ?? [])]);
    model.knownDifferences = [...disclosed].filter(Boolean);

    const { data: existing } = await supabase
      .from("plans")
      .select("version")
      .eq("project_id", data.projectId)
      .order("version", { ascending: false })
      .limit(1);
    const version = (existing?.[0]?.version ?? 0) + 1;

    const { data: inserted, error: insertError } = await supabase
      .from("plans")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        version,
        model: model as never,
        ai_notes: structureNotes.slice(0, 4000),
      })
      .select("id, model, version")
      .single();
    if (insertError) throw new Error(insertError.message);

    await supabase.from("projects").update({ status: "ready" }).eq("id", data.projectId);

    return { planId: inserted.id, version: inserted.version, model: inserted.model };
  });

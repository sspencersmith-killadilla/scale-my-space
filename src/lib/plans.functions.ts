import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PLAN_SYSTEM_PROMPT, planJsonSchema, buildUserPrompt } from "./plan-prompt";

const Input = z.object({ projectId: z.string().uuid() });

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

    const paths = (images ?? []).map((i) => i.storage_path).slice(0, 4);
    if (!paths.length) throw new Error("Upload at least one photo before generating a plan.");

    const imageUrls: string[] = [];
    for (const path of paths) {
      const { data: signed } = await supabase.storage
        .from("project-media")
        .createSignedUrl(path, 60 * 30);
      if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
    }
    if (!imageUrls.length) throw new Error("Could not read the uploaded photos.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
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
                }),
              },
              ...imageUrls.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "woodworking_plan", strict: true, schema: planJsonSchema },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 402) {
        throw new Error("This workspace is out of AI credits. Add credits to keep generating plans.");
      }
      if (response.status === 429) {
        throw new Error("The AI service is busy right now. Try again in a moment.");
      }
      console.error("AI gateway error", response.status, body);
      throw new Error(`Plan generation failed (${response.status}). ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The AI returned an empty plan. Try again.");

    let model: unknown;
    try {
      model = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("The AI returned an unreadable plan. Try again.");
      model = JSON.parse(match[0]);
    }

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
        ai_notes: "",
      })
      .select("id, model, version")
      .single();
    if (insertError) throw new Error(insertError.message);

    await supabase.from("projects").update({ status: "ready" }).eq("id", data.projectId);

    return { planId: inserted.id, version: inserted.version, model: inserted.model };
  });

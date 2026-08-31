/**
 * The individual AI passes of plan generation.
 *
 * Each pass is short enough to finish inside one HTTP request. The staged
 * server functions in `plans.functions.ts` call these one at a time and save
 * the result after every pass, so a dropped connection never loses the work
 * and never leaves a project stuck mid-generation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DETAIL_BUDGET,
  DETAIL_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  READ_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  buildDetailPrompt,
  buildReadPrompt,
  buildUserPrompt,
  detailJsonSchema,
  planJsonSchema,
  reviewJsonSchema,
  summarizeGeometry,
  summarizeMass,
  type DetailLevel,
} from "./plan-prompt";
import {
  ensureMasses,
  massBounds,
  massTotalHeight,
  massWidth,
  normalizePlanModel,
  type PlanMass,
  type PlanModel,
} from "./plan-model";
import { callGateway, parseJson, type ContentBlock } from "./plan-gateway";

export type Db = SupabaseClient<Database>;
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

/** Photos are inlined as base64 data URLs: providers cannot always fetch signed links. */
export async function loadPhotoBlocks(
  supabase: Db,
  projectId: string,
  limit = 8,
): Promise<ContentBlock[]> {
  const { data: images } = await supabase
    .from("project_images")
    .select("storage_path")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  const paths = (images ?? []).map((i) => i.storage_path).slice(0, limit);
  if (!paths.length) throw new Error("Upload at least one photo before generating a plan.");

  const urls: string[] = [];
  for (const path of paths) {
    const { data: blob } = await supabase.storage.from("project-media").download(path);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    urls.push(`data:${mime};base64,${btoa(binary)}`);
  }
  if (!urls.length) throw new Error("Could not read the uploaded photos.");

  return urls.flatMap((url, i) => [
    {
      type: "text" as const,
      text: `Reference photo ${i + 1} of ${urls.length} (same subject, different view):`,
    },
    { type: "image_url" as const, image_url: { url } },
  ]);
}

function photoCount(blocks: ContentBlock[]) {
  return blocks.filter((b) => b.type === "image_url").length;
}

/** Pass 1 — plain-language structural reading. Optional: a failure is survivable. */
export async function runReadPass(key: string, photos: ContentBlock[]): Promise<string> {
  try {
    return await callGateway(
      key,
      {
        messages: [
          { role: "system", content: READ_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: buildReadPrompt(photoCount(photos)) },
              ...photos,
            ],
          },
        ],
      },
      "read",
    );
  } catch (e) {
    console.error("[plan] read pass failed, continuing without it", e);
    return "";
  }
}

/** Pass 2 — measure and write the plan. Retries once with plain JSON output. */
export async function runMeasurePass(input: {
  key: string;
  photos: ContentBlock[];
  project: ProjectRow;
  structureNotes: string;
  refineNotes?: string;
}): Promise<PlanModel> {
  const attempt = async (relaxed: boolean) => {
    const content = await callGateway(
      input.key,
      {
        messages: [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildUserPrompt({
                  subjectNotes: input.project.subject_notes ?? "",
                  referenceNote: input.project.reference_note ?? "",
                  photoCount: photoCount(input.photos),
                  structureNotes: input.structureNotes,
                  ...(input.refineNotes ? { refineNotes: input.refineNotes } : {}),
                }),
              },
              ...input.photos,
            ],
          },
        ],
        ...(relaxed
          ? { response_format: { type: "json_object" } }
          : {
              response_format: {
                type: "json_schema",
                json_schema: { name: "woodworking_plan", strict: true, schema: planJsonSchema },
              },
            }),
      },
      "measure",
    );
    return normalizePlanModel(parseJson(content));
  };

  try {
    return await attempt(false);
  } catch (e) {
    console.error("[plan] measure pass failed, retrying without structured output", e);
    return attempt(true);
  }
}

export interface ReviewResult {
  verdict?: string;
  corrections?: string[];
  knownDifferences?: string[];
}

/** Pass 3 — review the massing against the photos. */
export async function runReviewPass(
  key: string,
  photos: ContentBlock[],
  model: PlanModel,
): Promise<ReviewResult> {
  try {
    const content = await callGateway(
      key,
      {
        messages: [
          { role: "system", content: REVIEW_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Plan geometry to review:\n${summarizeGeometry(model)}` },
              ...photos,
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "plan_review", strict: true, schema: reviewJsonSchema },
        },
      },
      "review",
    );
    return parseJson(content) as ReviewResult;
  } catch (e) {
    console.error("[plan] review pass failed", e);
    return {};
  }
}

/** Which masses deserve a detail pass, biggest first. */
export function detailTargets(model: PlanModel, level: DetailLevel): string[] {
  const budget = DETAIL_BUDGET[level];
  if (budget.massPasses <= 0) return [];
  return [...model.masses]
    .sort((a, b) => massWidth(b) * massTotalHeight(b) - massWidth(a) * massTotalHeight(a))
    .slice(0, budget.massPasses)
    .map((m) => m.id);
}

/** Pass 4 — refine one mass into faithful sub-shapes and merge it into the model. */
export async function runDetailPass(input: {
  key: string;
  photos: ContentBlock[];
  model: PlanModel;
  massId: string;
  level: DetailLevel;
  structureNotes: string;
}): Promise<PlanModel> {
  const parent = input.model.masses.find((m) => m.id === input.massId);
  if (!parent) return input.model;

  const content = await callGateway(
    input.key,
    {
      messages: [
        { role: "system", content: DETAIL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildDetailPrompt({
                massSummary: summarizeMass(parent),
                geometrySummary: summarizeGeometry(input.model),
                structureNotes: input.structureNotes,
                level: input.level,
              }),
            },
            // Detail passes only need a couple of views: smaller request, faster pass.
            ...input.photos.slice(0, 6),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "mass_detail", strict: true, schema: detailJsonSchema },
      },
    },
    "detail",
  );

  return mergeDetail(input.model, parent, parseJson(content));
}

/** Fold a detail pass result into the plan, guarding against runaway geometry. */
export function mergeDetail(model: PlanModel, parent: PlanMass, raw: unknown): PlanModel {
  const bounds = massBounds(ensureMasses(model));
  const maxSpan = Math.max(bounds.widthIn, bounds.depthIn, bounds.maxY, 1) * 1.2;
  const sub = normalizePlanModel({
    ...(raw as Record<string, unknown>),
    overall: model.overall,
  });
  const existingIds = new Set(model.masses.map((m) => m.id));

  for (const m of sub.masses) {
    const w = massWidth(m);
    const h = massTotalHeight(m);
    if (w <= 0 || h <= 0 || w > maxSpan || h > maxSpan) continue;
    let id = m.id || `${parent.id}-detail`;
    while (existingIds.has(id)) id = `${id}x`;
    existingIds.add(id);
    model.masses.push({ ...m, id, parentId: m.parentId || parent.id });
  }
  for (const o of sub.openings) {
    if (o.widthIn <= 0 || o.heightIn <= 0) continue;
    model.openings.push({ ...o, massId: o.massId || parent.id });
  }
  for (const f of sub.features) {
    model.features.push({ ...f, massId: f.massId || parent.id });
  }

  const rawNote = (raw as { notes?: unknown }).notes;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  const detailState = model.detailState;
  const next = normalizePlanModel(model);
  if (detailState) next.detailState = detailState;
  if (note) {
    next.structureNotes = [next.structureNotes, `${parent.name}: ${note}`]
      .filter(Boolean)
      .join("\n");
  }
  return next;
}

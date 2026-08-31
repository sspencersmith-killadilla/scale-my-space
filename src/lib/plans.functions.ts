import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  detailTargets,
  insertPlanVersion,
  loadPhotoBlocks,
  loadPlanRow,
  loadProject,
  runDetailPass,
  runMeasurePass,
  runReadPass,
  runReviewPass,
  savePlanModel,
  setProjectStatus,
} from "./plan-passes";

const DraftInput = z.object({
  projectId: z.string().uuid(),
  refineNotes: z.string().max(4000).optional(),
  detailLevel: z.enum(["simple", "standard", "museum"]).optional(),
});

const PlanStageInput = z.object({
  projectId: z.string().uuid(),
  planId: z.string().uuid(),
});

const DetailInput = PlanStageInput.extend({
  massId: z.string().min(1),
  refineNotes: z.string().max(4000).optional(),
});

/**
 * Stage 1 — read the photos and draft the plan.
 *
 * Generation is split into short server calls (draft, review, one call per
 * detailed mass) because a single request that ran every AI pass exceeded the
 * platform request timeout and surfaced as "Failed to fetch".
 */
export const draftPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI is not configured for this app.");
    const { supabase, userId } = context;
    const level = data.detailLevel ?? "standard";

    try {
      const [project, photos] = await Promise.all([
        loadProject(supabase, data.projectId),
        loadPhotoBlocks(supabase, data.projectId),
      ]);
      const structureNotes = await runReadPass(key, photos);
      const model = await runMeasurePass({
        key,
        photos,
        project,
        structureNotes,
        ...(data.refineNotes ? { refineNotes: data.refineNotes } : {}),
      });
      model.structureNotes = structureNotes || model.structureNotes;
      const targets = detailTargets(model, level);
      model.detailState = { level, targets, done: [] };

      const inserted = await insertPlanVersion({
        supabase,
        projectId: data.projectId,
        userId,
        model,
        aiNotes: structureNotes,
      });
      // The draft is already usable, so the project is viewable from here on.
      await setProjectStatus(supabase, data.projectId, "ready");
      return { planId: inserted.id, version: inserted.version, targets, level };
    } catch (e) {
      await setProjectStatus(supabase, data.projectId, "failed");
      throw e;
    }
  });

/** Stage 2 — check the massing against the photos and redraft once if needed. */
export const reviewPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanStageInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI is not configured for this app.");
    const { supabase } = context;

    const [project, photos, row] = await Promise.all([
      loadProject(supabase, data.projectId),
      loadPhotoBlocks(supabase, data.projectId),
      loadPlanRow(supabase, data.planId),
    ]);

    const review = await runReviewPass(key, photos, row.plan);
    const corrections = (review.corrections ?? []).filter(Boolean);
    let model = row.plan;
    let redrafted = false;

    if (review.verdict === "needs-work" && corrections.length) {
      try {
        const next = await runMeasurePass({
          key,
          photos,
          project,
          structureNotes: row.ai_notes ?? "",
          refineNotes: corrections.map((c) => `- ${c}`).join("\n"),
        });
        next.structureNotes = model.structureNotes;
        next.detailState = {
          level: model.detailState?.level ?? "standard",
          targets: detailTargets(next, (model.detailState?.level ?? "standard") as never),
          done: [],
        };
        model = next;
        redrafted = true;
      } catch (e) {
        console.error("[plan] corrective redraft failed, keeping the first draft", e);
      }
    }

    model.knownDifferences = [
      ...new Set([...model.knownDifferences, ...(review.knownDifferences ?? [])]),
    ].filter(Boolean);

    await savePlanModel(supabase, data.planId, model);
    return { redrafted, targets: model.detailState?.targets ?? [] };
  });

/** Stage 3 — refine one mass. Called once per target so each request stays short. */
export const detailMass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetailInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("AI is not configured for this app.");
    const { supabase } = context;

    const [photos, row] = await Promise.all([
      loadPhotoBlocks(supabase, data.projectId),
      loadPlanRow(supabase, data.planId),
    ]);
    const level = (row.plan.detailState?.level ?? "standard") as
      | "simple"
      | "standard"
      | "museum";

    const model = await runDetailPass({
      key,
      photos,
      model: row.plan,
      massId: data.massId,
      level,
      structureNotes: row.ai_notes ?? "",
    });

    const state = model.detailState ?? { level, targets: [], done: [] };
    model.detailState = {
      ...state,
      done: [...new Set([...state.done, data.massId])],
    };
    await savePlanModel(supabase, data.planId, model);
    const remaining = model.detailState.targets.filter(
      (t) => !model.detailState!.done.includes(t),
    );
    return { remaining };
  });

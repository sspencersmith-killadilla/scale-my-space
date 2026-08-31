import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { detailMass, draftPlan, redraftPlan, reviewPlan } from "@/lib/plans.functions";
import type { DetailLevel } from "@/lib/plan-prompt";

/**
 * Runs plan generation as a sequence of short server calls.
 *
 * Each stage is its own request and saves its result, so a long museum-detail
 * run cannot blow the platform request timeout and the user keeps whatever the
 * pipeline finished if a later stage fails.
 */
export function usePlanGeneration() {
  const runDraft = useServerFn(draftPlan);
  const runReview = useServerFn(reviewPlan);
  const runDetail = useServerFn(detailMass);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = useCallback(
    async (input: { projectId: string; detailLevel: DetailLevel; refineNotes?: string }) => {
      setBusy(true);
      try {
        setStage("Reading your photos…");
        const draft = await runDraft({
          data: {
            projectId: input.projectId,
            detailLevel: input.detailLevel,
            ...(input.refineNotes ? { refineNotes: input.refineNotes } : {}),
          },
        });

        setStage("Checking the draft against your photos…");
        let targets = draft.targets;
        try {
          const review = await runReview({
            data: { projectId: input.projectId, planId: draft.planId },
          });
          targets = review.targets;
        } catch (e) {
          console.error("[plan] review stage failed, keeping the draft", e);
        }

        for (let i = 0; i < targets.length; i++) {
          setStage(`Adding shape detail (${i + 1} of ${targets.length})…`);
          try {
            await runDetail({
              data: {
                projectId: input.projectId,
                planId: draft.planId,
                massId: targets[i]!,
              },
            });
          } catch (e) {
            console.error("[plan] detail stage failed for", targets[i], e);
          }
        }

        setStage("");
        return draft;
      } finally {
        setBusy(false);
      }
    },
    [runDraft, runReview, runDetail],
  );

  return { generate, stage, busy };
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { complexPlanFixture } from "@/lib/__fixtures__/complex-plan";
import {
  buildCutList,
  normalizePlanModel,
  formatInches,
  type ScaleSettings,
} from "@/lib/plan-model";
import { Elevation } from "@/components/Elevation";
import { PanelLayout } from "@/components/PanelLayout";
import { PlanPreview3D } from "@/components/PlanPreview3D";
import { buildPlanPdf } from "@/lib/plan-pdf";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dev/harness")({
  component: HarnessPage,
  head: () => ({
    meta: [
      { title: "Geometry harness — Shrinkify Plan Works" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Internal verification page: renders a deliberately complex fortress plan through every drawing, cut list and PDF path.",
      },
      { property: "og:title", content: "Geometry harness — Shrinkify Plan Works" },
      {
        property: "og:description",
        content: "Internal verification page for complex multi-mass plan geometry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SCALE: ScaleSettings = {
  mode: "ratio",
  denominator: 24,
  targetHeightIn: null,
  stockThicknessIn: 0.25,
  material: "baltic birch plywood",
};

function HarnessPage() {
  const model = useMemo(() => normalizePlanModel(complexPlanFixture()), []);
  const rows = useMemo(() => buildCutList(model, SCALE), [model]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Complex-geometry harness</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {model.masses.length} masses · {model.openings.length} openings · {rows.length} cut parts ·
        envelope {formatInches(model.overall.widthIn)} × {formatInches(model.overall.depthIn)} ×{" "}
        {formatInches(model.overall.heightIn)}
      </p>

      <section data-testid="harness-3d" className="mt-8 rounded-lg border-2 border-foreground p-4">
        <PlanPreview3D model={model} scale={SCALE} thicknessIn={SCALE.stockThicknessIn} />
      </section>

      <section data-testid="harness-elevations" className="mt-8 grid gap-6 md:grid-cols-2">
        {(["front", "left", "back", "right"] as const).map((face) => (
          <Elevation key={face} model={model} scale={SCALE} face={face} />
        ))}
      </section>

      <section data-testid="harness-layout" className="mt-8">
        <PanelLayout rows={rows} sheetWidthIn={24} />
      </section>

      <Button
        className="mt-8"
        onClick={() =>
          buildPlanPdf(model, SCALE, { projectTitle: "Harness", sheetWidthIn: 24 }).save(
            "harness-plans.pdf",
          )
        }
      >
        Download harness PDF
      </Button>
    </main>
  );
}

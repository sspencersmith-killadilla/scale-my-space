import { createFileRoute } from "@tanstack/react-router";
import { PlanPreview3D } from "@/components/PlanPreview3D";
import { emptyPlanModel } from "@/lib/plan-model";

export const Route = createFileRoute("/dev-3d")({ ssr: false, component: Dev });

function Dev() {
  const m = emptyPlanModel();
  m.stories = 2;
  m.overall = { widthIn: 240, depthIn: 180, heightIn: 300, wallHeightIn: 216 };
  m.roof = { type: "gable", pitchNote: "8:12", overhangIn: 12, buildNotes: "" };
  m.openings = [
    { face: "front", kind: "door", xIn: 100, yIn: 0, widthIn: 36, heightIn: 80, paneCols: 1, paneRows: 1 },
    { face: "front", kind: "window", xIn: 24, yIn: 40, widthIn: 36, heightIn: 60, paneCols: 2, paneRows: 3 },
    { face: "left", kind: "window", xIn: 40, yIn: 150, widthIn: 30, heightIn: 50, paneCols: 2, paneRows: 2 },
  ];
  return <div className="p-8"><PlanPreview3D model={m} scale={{ mode: "ratio", denominator: 24, targetHeightIn: 12, stockThicknessIn: 0.25, material: "plywood" } as never} thicknessIn={0.25} /></div>;
}

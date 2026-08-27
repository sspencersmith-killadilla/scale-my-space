import { complexPlanFixture } from "@/lib/__fixtures__/complex-plan";
import {
  normalizePlanModel, buildCutList, derivedGeometryParts, ensureMasses, massBounds,
  expandOpenings, massWidth, massTotalHeight, modelOverall, sheetAreaSqIn,
  type ScaleSettings,
} from "@/lib/plan-model";
import { buildPlanPdf } from "@/lib/plan-pdf";
import { nestParts } from "@/components/PanelLayout";

const raw = complexPlanFixture();
const model = normalizePlanModel(raw);
const scale: ScaleSettings = { mode: "ratio", denominator: 24, targetHeightIn: null, stockThicknessIn: 0.25, material: "baltic birch plywood" };

console.log("masses in:", raw.masses.length, "out:", model.masses.length);
console.log("kinds:", model.masses.map((m) => `${m.id}:${m.kind}`).join(", "));
console.log("overall:", model.overall);
console.log("bounds:", massBounds(ensureMasses(model)));
console.log("model overall (scaled):", modelOverall(model, scale));

for (const m of model.masses) {
  const w = massWidth(m), h = massTotalHeight(m);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) console.log("BAD MASS SIZE", m.id, w, h);
  if (m.parentId) {
    const p = model.masses.find((x) => x.id === m.parentId);
    if (!p) console.log("ORPHAN CHILD", m.id, m.parentId);
    else {
      const dx = Math.abs(m.xIn - p.xIn), dz = Math.abs(m.zIn - p.zIn);
      const inside = dx <= massWidth(p) && dz <= massWidth(p) && m.baseYIn <= p.baseYIn + massTotalHeight(p) + 1;
      if (!inside) console.log("CHILD OUTSIDE PARENT", m.id, { dx, dz, baseY: m.baseYIn, parentTop: p.baseYIn + massTotalHeight(p) });
    }
  }
}

const derived = derivedGeometryParts(model);
console.log("derived parts:", derived.length, derived.map((p) => p.id).join(", "));
const rows = buildCutList(model, scale);
console.log("cut rows:", rows.length);
for (const r of rows) {
  if (![r.lengthIn, r.widthIn, r.thicknessIn].every((v) => Number.isFinite(v) && v > 0)) console.log("BAD ROW", r.id, r.lengthIn, r.widthIn, r.thicknessIn);
  for (const o of r.openings) {
    if (o.widthIn > r.lengthIn + 0.01 || o.heightIn > r.widthIn + 0.01) console.log("OPENING OVERFLOWS PANEL", r.id, o.label, o.widthIn, o.heightIn, "panel", r.lengthIn, r.widthIn);
    if (o.fromLeftIn < -0.01 || o.fromBottomIn < -0.01) console.log("OPENING NEGATIVE POS", r.id, o.label);
  }
}
console.log("sheet area sqin:", sheetAreaSqIn(rows).toFixed(1));
console.log("expanded openings:", expandOpenings(model.openings).length);
const nested = nestParts(rows, 24);
console.log("nest:", JSON.stringify(nested).length > 0 ? "ok" : "empty", Array.isArray(nested) ? "" : Object.keys(nested));
const doc = buildPlanPdf(model, scale, { projectTitle: "Harness", sheetWidthIn: 24 });
const out = doc.output("arraybuffer") as ArrayBuffer;
console.log("pdf bytes:", out.byteLength, "pages:", doc.getNumberOfPages());

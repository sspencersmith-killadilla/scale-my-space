import { jsPDF } from "jspdf";
import { nestParts } from "@/components/PanelLayout";
import {
  buildCutList,
  ensureMasses,
  expandOpenings,
  massBounds,
  type PlanMass,

  formatFeetInches,
  formatInches,
  modelOverall,
  resolveDenominator,
  sheetAreaSqIn,
  type FaceKey,
  type PlanModel,
  type ScaleSettings,
} from "./plan-model";

const INK = [20, 32, 43] as const;
const BLUE = [31, 95, 139] as const;
const ORANGE = [201, 98, 43] as const;
const GREY = [120, 128, 136] as const;

const MARGIN = 54;

function header(doc: jsPDF, title: string, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 58, w - MARGIN, 58);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), MARGIN, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(subtitle, w - MARGIN, 50, { align: "right" });
}

function footer(doc: jsPDF, page: number) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text("Generated from photographs — dimensions are estimates. Verify before cutting.", MARGIN, h - 30);
  doc.text(`Page ${page}`, w - MARGIN, h - 30, { align: "right" });
}

function wrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 12) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function drawElevation(
  doc: jsPDF,
  model: PlanModel,
  scale: ScaleSettings,
  face: FaceKey,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
) {
  const d = resolveDenominator(model, scale);
  const masses = ensureMasses(model);
  const bounds = massBounds(masses);
  const horizontal = face === "front" || face === "back";
  const flip = face === "back" || face === "right";
  const w = (horizontal ? bounds.widthIn : bounds.depthIn) / d;
  const h = bounds.maxY / d;
  const px = Math.min(boxW / Math.max(w, 0.01), boxH / Math.max(h, 0.01));
  const dw = w * px;
  const dh = h * px;
  const ox = x + (boxW - dw) / 2;
  const oy = y + (boxH - dh) / 2;
  const label = `${face} elevation`;

  const center = (m: PlanMass) => (horizontal ? m.xIn : m.zIn);
  const span = (m: PlanMass) =>
    m.kind === "cylinder" ? m.diameterIn : horizontal ? m.widthIn : m.depthIn;
  const sx = (inches: number) => {
    const from = horizontal ? bounds.minX : bounds.minZ;
    const local = inches - from;
    const posIn = flip ? (horizontal ? bounds.widthIn : bounds.depthIn) - local : local;
    return ox + (posIn / d) * px;
  };
  const sy = (inches: number) => oy + dh - (inches / d) * px;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(label.toUpperCase(), x, y - 8);

  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  const ordered = [...masses].sort(
    (a: PlanMass, b: PlanMass) => b.heightIn + b.top.riseIn - (a.heightIn + a.top.riseIn),
  );
  for (const m of ordered) {
    const s = span(m);
    const xa = Math.min(sx(center(m) - s / 2), sx(center(m) + s / 2));
    const xb = Math.max(sx(center(m) - s / 2), sx(center(m) + s / 2));
    const wallTop = sy(m.baseYIn + m.heightIn);
    const bottom = sy(m.baseYIn);
    doc.rect(xa, wallTop, xb - xa, bottom - wallTop, "S");
    const risePx = (m.top.riseIn / d) * px;
    const top = m.top.type;
    if ((top === "gable" || top === "hip" || top === "cone" || top === "dome") && risePx > 1) {
      doc.lines(
        [
          [(xb - xa) / 2, -risePx],
          [(xb - xa) / 2, risePx],
        ],
        xa,
        wallTop,
        [1, 1],
        "S",
        false,
      );
    } else if (top === "shed" && risePx > 1) {
      doc.lines([[xb - xa, risePx]], xa, wallTop - risePx, [1, 1], "S", false);
    } else if (top === "crenellated" || top === "parapet") {
      const th = Math.max(((m.top.merlonHeightIn || m.top.riseIn || 10) / d) * px, 3);
      if (top === "parapet") {
        doc.rect(xa, wallTop - th, xb - xa, th, "S");
      } else {
        const tooth = Math.max(((m.top.merlonWidthIn || 8) / d) * px, 2.5);
        const gap = Math.max(((m.top.merlonGapIn || 6) / d) * px, 2);
        const pitch = tooth + gap;
        const count = Math.max(2, Math.floor((xb - xa) / pitch));
        const start = xa + ((xb - xa) - (count * pitch - gap)) / 2;
        for (let i = 0; i < count; i++) doc.rect(start + i * pitch, wallTop - th, tooth, th, "S");
      }
    }
  }

  const mainMass = masses.reduce(
    (a: PlanMass, b: PlanMass) => (b.widthIn * b.heightIn > a.widthIn * a.heightIn ? b : a),
    masses[0]!,
  );
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  for (const o of expandOpenings(model.openings.filter((op) => op.face === face))) {
    const mass = masses.find((m: PlanMass) => m.id === o.massId) ?? mainMass;
    const leftIn = center(mass) - span(mass) / 2 + o.xIn;
    const ow = (o.widthIn / d) * px;
    const oh = (o.heightIn / d) * px;
    const raw = sx(leftIn);
    const opx = flip ? raw - ow : raw;
    const opy = sy(mass.baseYIn + o.yIn + o.heightIn);
    doc.rect(opx, opy, ow, oh, "S");
    if ((o.shape ?? "rectangle") !== "rectangle") {
      // Mark the arch head so the builder cuts a curve, not a square top.
      const rise = Math.min(((o.archRiseIn ?? 0) / d) * px, oh * 0.9);
      if (rise > 1) {
        doc.setDrawColor(...BLUE);
        doc.lines(
          [
            [ow / 2, -rise],
            [ow / 2, rise],
          ],
          opx,
          opy + rise,
          [1, 1],
          "S",
          false,
        );
        doc.setDrawColor(...INK);
      }
    } else if (o.kind === "window") {
      const cols = Math.max(1, o.paneCols ?? 1);
      const rws = Math.max(1, o.paneRows ?? 1);
      doc.setDrawColor(...BLUE);
      for (let c = 1; c < cols; c++)
        doc.line(opx + (ow * c) / cols, opy, opx + (ow * c) / cols, opy + oh);
      for (let rr = 1; rr < rws; rr++)
        doc.line(opx, opy + (oh * rr) / rws, opx + ow, opy + (oh * rr) / rws);
      doc.setDrawColor(...INK);
    }
  }

  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.6);
  doc.line(ox, oy + dh + 12, ox + dw, oy + dh + 12);
  doc.line(ox, oy + dh + 8, ox, oy + dh + 16);
  doc.line(ox + dw, oy + dh + 8, ox + dw, oy + dh + 16);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text(formatInches(w), ox + dw / 2, oy + dh + 24, { align: "center" });
  doc.setDrawColor(...ORANGE);
  doc.line(ox - 12, oy, ox - 12, oy + dh);
  doc.line(ox - 16, oy, ox - 8, oy);
  doc.line(ox - 16, oy + dh, ox - 8, oy + dh);
  doc.text(formatInches(h), ox - 18, oy + dh / 2, { align: "right" });
}


export interface PdfOptions {
  projectTitle: string;
  photoDataUrl?: string | null;
  sheetWidthIn?: number;
}

export function buildPlanPdf(
  model: PlanModel,
  scale: ScaleSettings,
  options: PdfOptions,
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - MARGIN * 2;
  const rows = buildCutList(model, scale);
  const o = modelOverall(model, scale);
  const denomLabel = `1:${o.denominator.toFixed(o.denominator % 1 === 0 ? 0 : 1)}`;
  const subtitle = `${options.projectTitle} · ${denomLabel}`;
  let page = 1;

  /* ---------- Cover ---------- */
  doc.setFillColor(244, 239, 230);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  const titleEnd = wrapped(doc, options.projectTitle, MARGIN, 130, contentW, 34);
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text(`MINIATURE WOODWORKING PLAN · SCALE ${denomLabel}`, MARGIN, titleEnd + 10);

  let cy = titleEnd + 40;
  if (options.photoDataUrl) {
    try {
      doc.addImage(options.photoDataUrl, MARGIN, cy, contentW, 250, undefined, "FAST");
      doc.setDrawColor(...INK);
      doc.setLineWidth(1);
      doc.rect(MARGIN, cy, contentW, 250, "S");
      cy += 270;
    } catch {
      /* image type not supported by jsPDF — skip it */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("FINISHED MODEL", MARGIN, cy + 16);
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  const summary = [
    `Subject         ${model.subject}${model.style ? ` (${model.style})` : ""}`,
    `Real-world est. ${formatFeetInches(model.overall.widthIn)} W × ${formatFeetInches(model.overall.depthIn)} D × ${formatFeetInches(model.overall.heightIn)} H`,
    `Model size      ${formatInches(o.widthIn)} W × ${formatInches(o.depthIn)} D × ${formatInches(o.heightIn)} H`,
    `Material        ${scale.material}, ${formatInches(scale.stockThicknessIn)} stock`,
    `Parts           ${rows.reduce((s, r) => s + r.quantity, 0)} pieces / ${rows.length} unique`,
    `Stock needed    ~${Math.ceil(sheetAreaSqIn(rows))} sq in (incl. 20% waste)`,
  ];
  summary.forEach((line, i) => doc.text(line, MARGIN, cy + 36 + i * 14));
  footer(doc, page);

  /* ---------- Overview / tools ---------- */
  const bulletSection = (
    heading: string,
    items: string[],
    startY: number,
  ): number => {
    let yy = startY;
    if (!items.length) return yy;
    if (yy > H - 120) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      header(doc, heading, subtitle);
      yy = 92;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(heading.toUpperCase(), MARGIN, yy);
    yy += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const item of items) {
      if (yy > H - 70) {
        footer(doc, page);
        doc.addPage();
        page += 1;
        header(doc, `${heading} (cont.)`, subtitle);
        yy = 92;
      }
      doc.setTextColor(...BLUE);
      doc.text("•", MARGIN, yy);
      doc.setTextColor(...INK);
      yy = wrapped(doc, item, MARGIN + 14, yy, contentW - 14, 12) + 6;
    }
    return yy + 12;
  };

  doc.addPage();
  page += 1;
  header(doc, "Before you start", subtitle);
  let y = 92;
  if (model.overview) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    y = wrapped(doc, model.overview, MARGIN, y, contentW, 14) + 10;
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(
      `${model.difficulty} build${model.estimatedHours ? ` · about ${model.estimatedHours} hours` : ""}`,
      MARGIN,
      y,
    );
    y += 24;
  }
  const massSummary = ensureMasses(model).map((m) => {
    const foot =
      m.kind === "cylinder"
        ? `round, ${formatInches(m.diameterIn / o.denominator)} across`
        : `${formatInches(m.widthIn / o.denominator)} × ${formatInches(m.depthIn / o.denominator)}`;
    const top =
      m.top.riseIn > 0
        ? `${m.top.type} top rising ${formatInches(m.top.riseIn / o.denominator)}`
        : `${m.top.type} top`;
    return `${m.name}: ${foot}, walls ${formatInches(m.heightIn / o.denominator)} high, ${top}.`;
  });
  y = bulletSection("The model is built from these volumes", massSummary, y);
  y = bulletSection(
    "Architectural features",
    model.features.map(
      (f) =>
        `${f.name} (${f.type.replace("-", " ")}${f.count > 1 ? ` ×${f.count}` : ""})${
          f.description ? `: ${f.description}` : ""
        }`,
    ),
    y,
  );
  y = bulletSection("Where this model simplifies the real subject", model.knownDifferences, y);
  y = bulletSection("Tools you need", model.toolsNeeded, y);
  y = bulletSection("Supplies", [...model.suppliesNeeded, ...model.extraMaterials], y);
  y = bulletSection("Safety", model.safetyNotes, y);

  footer(doc, page);

  /* ---------- Cut list ---------- */
  doc.addPage();
  page += 1;
  header(doc, "Cut list", subtitle);
  y = 90;
  const cols = [MARGIN, MARGIN + 150, MARGIN + 185, MARGIN + 275, MARGIN + 345];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  ["PART", "QTY", "LENGTH × WIDTH", "THICK", "WHERE IT GOES / HOW TO CUT"].forEach((h, i) =>
    doc.text(h, cols[i]!, y),
  );
  y += 6;
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 14;

  const noteW = W - MARGIN - cols[4]!;
  for (const r of rows) {
    const noteText = [r.location, r.cutNotes, r.notes].filter(Boolean).join(" — ") || "—";
    const openingText = r.openings.map(
      (o) =>
        `Cut out ${o.label}: ${formatInches(o.widthIn)} × ${formatInches(o.heightIn)}, ${formatInches(o.fromLeftIn)} from left edge, ${formatInches(o.fromBottomIn)} up from bottom`,
    );
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(r.name, 140) as string[];
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(noteText, noteW) as string[];
    const openLines = openingText.flatMap(
      (t) => doc.splitTextToSize(t, noteW) as string[],
    );
    const rowH = Math.max(nameLines.length * 11, (noteLines.length + openLines.length) * 10) + 10;
    if (y + rowH > H - 60) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      header(doc, "Cut list (cont.)", subtitle);
      y = 90;
    }
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    nameLines.forEach((l, i) => doc.text(l, cols[0]!, y + i * 11));
    doc.text(String(r.quantity), cols[1]!, y);
    doc.text(`${formatInches(r.lengthIn)} × ${formatInches(r.widthIn)}`, cols[2]!, y);
    doc.text(formatInches(r.thicknessIn), cols[3]!, y);
    doc.setFontSize(8);
    let ny = y;
    noteLines.forEach((l) => {
      doc.setTextColor(...INK);
      doc.text(l, cols[4]!, ny);
      ny += 10;
    });
    openLines.forEach((l) => {
      doc.setTextColor(...BLUE);
      doc.text(l, cols[4]!, ny);
      ny += 10;
    });
    doc.setTextColor(...INK);
    y += rowH;
    doc.setDrawColor(230, 226, 218);
    doc.line(MARGIN, y - 5, W - MARGIN, y - 5);
  }
  footer(doc, page);


  /* ---------- Elevations ---------- */
  doc.addPage();
  page += 1;
  header(doc, "Elevations", subtitle);
  const faces: FaceKey[] = ["front", "right", "back", "left"];
  const cellW = (contentW - 30) / 2;
  const cellH = (H - 200) / 2;
  faces.forEach((face, i) => {
    const cx = MARGIN + (i % 2) * (cellW + 30);
    const cyy = 120 + Math.floor(i / 2) * (cellH + 50);
    drawElevation(doc, model, scale, face, cx, cyy, cellW, cellH - 40);
  });
  footer(doc, page);

  /* ---------- Panel layout ---------- */
  doc.addPage();
  page += 1;
  header(doc, "Cutting layout", subtitle);
  const sheetWidthIn = options.sheetWidthIn ?? 24;
  const { placed, totalHeightIn } = nestParts(rows, sheetWidthIn);
  const layoutPx = Math.min(contentW / sheetWidthIn, (H - 190) / Math.max(totalHeightIn, 1));
  const lx = MARGIN;
  const ly = 100;
  doc.setFillColor(226, 213, 190);
  doc.rect(lx, ly, sheetWidthIn * layoutPx, totalHeightIn * layoutPx, "F");
  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  doc.rect(lx, ly, sheetWidthIn * layoutPx, totalHeightIn * layoutPx, "S");
  doc.setLineWidth(0.6);
  for (const p of placed) {
    doc.setDrawColor(...BLUE);
    doc.setFillColor(252, 250, 246);
    doc.rect(lx + p.x * layoutPx, ly + p.y * layoutPx, p.w * layoutPx, p.h * layoutPx, "FD");
    if (p.w * layoutPx > 54 && p.h * layoutPx > 18) {
      doc.setFont("courier", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...INK);
      doc.text(p.row.name.slice(0, 20), lx + p.x * layoutPx + 3, ly + p.y * layoutPx + 9);
      doc.text(
        `${formatInches(p.w)}x${formatInches(p.h)}`,
        lx + p.x * layoutPx + 3,
        ly + p.y * layoutPx + 18,
      );
    }
  }
  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(
    `Stock sheet ${sheetWidthIn}" wide · ${formatInches(totalHeightIn)} of length used · layout not to print scale`,
    MARGIN,
    ly + totalHeightIn * layoutPx + 20,
  );
  footer(doc, page);

  /* ---------- Window & door schedule ---------- */
  if (model.openings.length) {
    doc.addPage();
    page += 1;
    header(doc, "Window & door schedule", subtitle);
    y = 92;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    y = wrapped(
      doc,
      "All positions are model inches, measured on the flat panel before assembly: from that panel's left edge and up from its bottom edge.",
      MARGIN,
      y,
      contentW,
      12,
    ) + 14;
    const d = resolveDenominator(model, scale);
    for (const o of model.openings) {
      if (y > H - 90) {
        footer(doc, page);
        doc.addPage();
        page += 1;
        header(doc, "Window & door schedule (cont.)", subtitle);
        y = 92;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(`${o.label || o.kind} — ${o.face} face`, MARGIN, y);
      y += 13;
      doc.setFont("courier", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLUE);
      doc.text(
        `${formatInches(o.widthIn / d)} × ${formatInches(o.heightIn / d)}  ·  ${formatInches(o.xIn / d)} from left  ·  ${formatInches(o.yIn / d)} up from bottom  ·  ${o.paneCols ?? 1}×${o.paneRows ?? 1} panes`,
        MARGIN,
        y,
      );
      y += 13;
      if (o.trimNote) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        y = wrapped(doc, o.trimNote, MARGIN, y, contentW, 12) + 6;
      }
      y += 8;
    }
    footer(doc, page);
  }

  /* ---------- Step-by-step assembly ---------- */
  doc.addPage();
  page += 1;
  header(doc, "Step-by-step assembly", subtitle);
  y = 92;

  const ensure = (need: number, heading: string) => {
    if (y + need > H - 60) {
      footer(doc, page);
      doc.addPage();
      page += 1;
      header(doc, heading, subtitle);
      y = 92;
    }
  };

  if (model.assemblyStages.length) {
    model.assemblyStages.forEach((stage, si) => {
      ensure(70, "Step-by-step assembly (cont.)");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...ORANGE);
      doc.text(`STAGE ${si + 1}`, MARGIN, y);
      doc.setTextColor(...INK);
      y = wrapped(doc, stage.title, MARGIN + 62, y, contentW - 62, 14) + 4;
      if (stage.goal) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...GREY);
        y = wrapped(doc, stage.goal, MARGIN, y + 6, contentW, 12) + 4;
      }
      if (stage.tools.length || stage.parts.length) {
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BLUE);
        if (stage.tools.length)
          y = wrapped(doc, `TOOLS: ${stage.tools.join(", ")}`, MARGIN, y + 6, contentW, 10) + 2;
        if (stage.parts.length)
          y = wrapped(doc, `PARTS: ${stage.parts.join(", ")}`, MARGIN, y + 4, contentW, 10) + 2;
      }
      y += 10;

      stage.steps.forEach((step, i) => {
        ensure(60, "Step-by-step assembly (cont.)");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...ORANGE);
        doc.text(`${si + 1}.${i + 1}`, MARGIN, y);
        doc.setTextColor(...INK);
        y = wrapped(doc, step.instruction, MARGIN + 30, y, contentW - 30, 12);
        if (step.detail) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...INK);
          y = wrapped(doc, step.detail, MARGIN + 30, y + 12, contentW - 30, 12);
        }
        if (step.tip) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8.5);
          doc.setTextColor(...BLUE);
          y = wrapped(doc, `Tip: ${step.tip}`, MARGIN + 30, y + 12, contentW - 30, 11);
        }
        y += 16;
      });

      if (stage.check) {
        ensure(50, "Step-by-step assembly (cont.)");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...ORANGE);
        doc.text("CHECK", MARGIN, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        y = wrapped(doc, stage.check, MARGIN + 44, y, contentW - 44, 12) + 18;
      }
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y - 8, W - MARGIN, y - 8);
      y += 8;
    });
  } else {
    model.assemblySteps.forEach((step, i) => {
      ensure(40, "Step-by-step assembly (cont.)");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ORANGE);
      doc.text(String(i + 1).padStart(2, "0"), MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      y = wrapped(doc, step, MARGIN + 26, y, contentW - 26, 13) + 10;
    });
  }
  footer(doc, page);

  /* ---------- Detail pieces ---------- */
  if (model.detailElements.length) {
    doc.addPage();
    page += 1;
    header(doc, "Detail pieces", subtitle);
    y = 92;
    for (const el of model.detailElements) {
      ensure(70, "Detail pieces (cont.)");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      y = wrapped(doc, el.name, MARGIN, y, contentW, 14) + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      if (el.description) y = wrapped(doc, el.description, MARGIN, y + 8, contentW, 12);
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BLUE);
      if (el.location) y = wrapped(doc, `WHERE: ${el.location}`, MARGIN, y + 12, contentW, 10);
      if (el.materials) y = wrapped(doc, `MATERIALS: ${el.materials}`, MARGIN, y + 10, contentW, 10);
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      el.howToMake.forEach((s, i) => {
        ensure(34, "Detail pieces (cont.)");
        doc.setTextColor(...ORANGE);
        doc.text(`${i + 1}.`, MARGIN, y);
        doc.setTextColor(...INK);
        y = wrapped(doc, s, MARGIN + 20, y, contentW - 20, 12) + 6;
      });
      y += 14;
    }
    footer(doc, page);
  }

  /* ---------- Paint & finish ---------- */
  if (model.paintPlan.length || model.finishingSteps.length) {
    doc.addPage();
    page += 1;
    header(doc, "Paint & finish", subtitle);
    y = 92;
    for (const p of model.paintPlan) {
      ensure(60, "Paint & finish (cont.)");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(p.area, MARGIN, y);
      y += 13;
      doc.setFont("courier", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLUE);
      y = wrapped(doc, `${p.color} — match: ${p.colorMatch}`, MARGIN, y, contentW, 11) + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      if (p.technique) y = wrapped(doc, p.technique, MARGIN, y + 6, contentW, 12);
      y += 16;
    }
    y = bulletSection("Finishing steps", model.finishingSteps, y);
    footer(doc, page);
  }

  /* ---------- Glossary & assumptions ---------- */
  doc.addPage();
  page += 1;
  header(doc, "Terms & assumptions", subtitle);
  y = 92;
  if (model.glossary.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("PLAIN-ENGLISH GLOSSARY", MARGIN, y);
    y += 20;
    for (const g of model.glossary) {
      ensure(40, "Terms & assumptions (cont.)");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(g.term, MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      y = wrapped(doc, g.definition, MARGIN, y + 12, contentW, 12) + 12;
    }
    y += 6;
  }
  y = bulletSection("Assumptions & estimates", model.assumptions, y);
  footer(doc, page);


  return doc;
}

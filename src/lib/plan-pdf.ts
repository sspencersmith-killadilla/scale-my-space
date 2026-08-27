import { jsPDF } from "jspdf";
import { nestParts } from "@/components/PanelLayout";
import {
  buildCutList,
  faceDimensions,
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
  const f = faceDimensions(model)[face];
  const w = f.widthIn / d;
  const h = f.heightIn / d;
  const wallH = Math.min(model.overall.wallHeightIn / d, h);
  const gable = h - wallH > 0.02;
  const px = Math.min(boxW / w, boxH / h);
  const dw = w * px;
  const dh = h * px;
  const ox = x + (boxW - dw) / 2;
  const oy = y + (boxH - dh) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(f.label.toUpperCase(), x, y - 8);

  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  if (gable) {
    const shoulderY = oy + (h - wallH) * px;
    doc.lines(
      [
        [0, -(dh - (shoulderY - oy))],
        [dw / 2, -(shoulderY - oy)],
        [dw / 2, shoulderY - oy],
        [0, dh - (shoulderY - oy)],
        [-dw, 0],
      ],
      ox,
      oy + dh,
      [1, 1],
      "S",
      true,
    );
    doc.setDrawColor(...BLUE);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(ox, shoulderY, ox + dw, shoulderY);
    doc.setLineDashPattern([], 0);
  } else {
    doc.rect(ox, oy, dw, dh, "S");
  }

  const flip = face === "back" || face === "right";
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  for (const o of model.openings.filter((op) => op.face === face)) {
    const ow = (o.widthIn / d) * px;
    const oh = (o.heightIn / d) * px;
    const rawX = (o.xIn / d) * px;
    const opx = flip ? ox + dw - rawX - ow : ox + rawX;
    const opy = oy + dh - (o.yIn / d) * px - oh;
    doc.rect(opx, opy, ow, oh, "S");
    if (o.kind === "window") {
      doc.setDrawColor(...BLUE);
      doc.line(opx + ow / 2, opy, opx + ow / 2, opy + oh);
      doc.line(opx, opy + oh / 2, opx + ow, opy + oh / 2);
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

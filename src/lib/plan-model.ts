/**
 * Shared plan model + deterministic scaling math.
 * All AI output is in real-world inches. Every model dimension in the app is
 * derived here (never by the model) so edits recompute instantly and consistently.
 */

export type PartRole =
  | "front-wall"
  | "back-wall"
  | "side-wall"
  | "interior-wall"
  | "floor"
  | "roof-panel"
  | "base"
  | "trim"
  | "detail";

export interface PlanPart {
  id: string;
  name: string;
  role: PartRole;
  quantity: number;
  /** Real-world panel width in inches (the long dimension of the flat panel). */
  widthIn: number;
  /** Real-world panel height in inches. */
  heightIn: number;
  notes?: string;
}

export type FaceKey = "front" | "back" | "left" | "right";

export interface PlanOpening {
  face: FaceKey;
  kind: "window" | "door";
  /** Real-world inches from the left edge of that face to the opening's left edge. */
  xIn: number;
  /** Real-world inches from the bottom of that face to the opening's bottom edge. */
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export interface PlanModel {
  subject: string;
  style: string;
  stories: number;
  overall: { widthIn: number; depthIn: number; heightIn: number };
  roof: { type: string; pitchNote: string; overhangIn: number };
  parts: PlanPart[];
  openings: PlanOpening[];
  assemblySteps: string[];
  finishingSteps: string[];
  assumptions: string[];
  extraMaterials: string[];
}

export type ScaleMode = "ratio" | "target";

export interface ScaleSettings {
  mode: ScaleMode;
  denominator: number;
  targetHeightIn: number | null;
  stockThicknessIn: number;
  material: string;
}

export const SCALE_PRESETS = [
  { denominator: 12, label: '1:12 — 1 in = 1 ft', hint: "Standard dollhouse scale" },
  { denominator: 24, label: '1:24 — 1/2 in = 1 ft', hint: "Half scale, compact" },
  { denominator: 48, label: '1:48 — 1/4 in = 1 ft', hint: "Quarter scale, tiny" },
] as const;

export const THICKNESS_OPTIONS = [
  { value: 0.125, label: '1/8"' },
  { value: 0.1875, label: '3/16"' },
  { value: 0.25, label: '1/4"' },
  { value: 0.375, label: '3/8"' },
  { value: 0.5, label: '1/2"' },
] as const;

export const MATERIAL_OPTIONS = [
  "baltic birch plywood",
  "basswood sheet",
  "MDF panel",
  "poplar board",
] as const;

/** Resolve the effective scale denominator for either scale mode. */
export function resolveDenominator(model: PlanModel, scale: ScaleSettings): number {
  if (scale.mode === "target" && scale.targetHeightIn && scale.targetHeightIn > 0) {
    const d = model.overall.heightIn / scale.targetHeightIn;
    return d > 0 ? d : 12;
  }
  return scale.denominator > 0 ? scale.denominator : 12;
}

export function modelOverall(model: PlanModel, scale: ScaleSettings) {
  const d = resolveDenominator(model, scale);
  return {
    denominator: d,
    widthIn: model.overall.widthIn / d,
    depthIn: model.overall.depthIn / d,
    heightIn: model.overall.heightIn / d,
  };
}

export interface CutListRow {
  id: string;
  name: string;
  role: PartRole;
  quantity: number;
  /** Scaled, joinery-adjusted, snapped model dimensions in inches. */
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
  material: string;
  notes: string;
}

const SNAP = 32; // snap to nearest 1/32"

export function snapInches(value: number): number {
  return Math.max(1 / SNAP, Math.round(value * SNAP) / SNAP);
}

/**
 * Butt-joint compensation: front/back panels overlap the side panels, so the
 * side panels lose one stock thickness at each end. Roof panels gain the overhang.
 */
export function buildCutList(model: PlanModel, scale: ScaleSettings): CutListRow[] {
  const d = resolveDenominator(model, scale);
  const t = scale.stockThicknessIn;

  return model.parts.map((part) => {
    let length = part.widthIn / d;
    const height = part.heightIn / d;
    const notes: string[] = [];
    if (part.notes) notes.push(part.notes);

    if (part.role === "side-wall") {
      length = Math.max(length - 2 * t, length * 0.25);
      notes.push("Trimmed 2× stock thickness for butt joints");
    }
    if (part.role === "floor" || part.role === "base") {
      notes.push("Fits inside the wall box");
    }

    return {
      id: part.id,
      name: part.name,
      role: part.role,
      quantity: Math.max(1, Math.round(part.quantity)),
      lengthIn: snapInches(length),
      widthIn: snapInches(height),
      thicknessIn: t,
      material: scale.material,
      notes: notes.join(". "),
    };
  });
}

/** Total board feet-ish estimate: square inches of stock needed, plus 20% waste. */
export function sheetAreaSqIn(rows: CutListRow[]): number {
  const area = rows.reduce((sum, r) => sum + r.lengthIn * r.widthIn * r.quantity, 0);
  return area * 1.2;
}

const FRACTIONS: Array<[number, string]> = [
  [0, ""],
  [1 / 32, "1/32"],
  [1 / 16, "1/16"],
  [3 / 32, "3/32"],
  [1 / 8, "1/8"],
  [5 / 32, "5/32"],
  [3 / 16, "3/16"],
  [7 / 32, "7/32"],
  [1 / 4, "1/4"],
  [9 / 32, "9/32"],
  [5 / 16, "5/16"],
  [11 / 32, "11/32"],
  [3 / 8, "3/8"],
  [13 / 32, "13/32"],
  [7 / 16, "7/16"],
  [15 / 32, "15/32"],
  [1 / 2, "1/2"],
  [17 / 32, "17/32"],
  [9 / 16, "9/16"],
  [19 / 32, "19/32"],
  [5 / 8, "5/8"],
  [21 / 32, "21/32"],
  [11 / 16, "11/16"],
  [23 / 32, "23/32"],
  [3 / 4, "3/4"],
  [25 / 32, "25/32"],
  [13 / 16, "13/16"],
  [27 / 32, "27/32"],
  [7 / 8, "7/8"],
  [29 / 32, "29/32"],
  [15 / 16, "15/16"],
  [31 / 32, "31/32"],
];

/** Format inches as a woodworker-friendly fraction, e.g. 7 5/16". */
export function formatInches(value: number): string {
  const rounded = Math.round(value * SNAP) / SNAP;
  const whole = Math.floor(rounded + 1e-9);
  const rem = rounded - whole;
  let best: [number, string] = [0, ""];
  for (const f of FRACTIONS) {
    if (Math.abs(f[0] - rem) < Math.abs(best[0] - rem)) best = f;
  }
  const frac = best[1];
  if (!frac) return `${whole}"`;
  if (whole === 0) return `${frac}"`;
  return `${whole} ${frac}"`;
}

export function formatFeetInches(value: number): string {
  const feet = Math.floor(value / 12);
  const inches = value - feet * 12;
  if (feet === 0) return formatInches(inches);
  return `${feet}' ${formatInches(inches)}`;
}

/** Faces of the model with their real-world elevation dimensions. */
export function faceDimensions(model: PlanModel) {
  const { widthIn, depthIn, heightIn } = model.overall;
  return {
    front: { widthIn, heightIn, label: "Front elevation" },
    back: { widthIn, heightIn, label: "Back elevation" },
    left: { widthIn: depthIn, heightIn, label: "Left elevation" },
    right: { widthIn: depthIn, heightIn, label: "Right elevation" },
  } satisfies Record<FaceKey, { widthIn: number; heightIn: number; label: string }>;
}

export function emptyPlanModel(): PlanModel {
  return {
    subject: "",
    style: "",
    stories: 1,
    overall: { widthIn: 0, depthIn: 0, heightIn: 0 },
    roof: { type: "gable", pitchNote: "", overhangIn: 0 },
    parts: [],
    openings: [],
    assemblySteps: [],
    finishingSteps: [],
    assumptions: [],
    extraMaterials: [],
  };
}

/** Defensive normalizer for AI/db JSON so the UI never crashes on a bad field. */
export function normalizePlanModel(raw: unknown): PlanModel {
  const base = emptyPlanModel();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const overall = (r['overall'] ?? {}) as Record<string, unknown>;
  const roof = (r['roof'] ?? {}) as Record<string, unknown>;

  return {
    subject: str(r['subject'], "Photographed subject"),
    style: str(r['style']),
    stories: Math.max(1, Math.round(num(r['stories'], 1))),
    overall: {
      widthIn: num(overall['widthIn'], 120),
      depthIn: num(overall['depthIn'], 96),
      heightIn: num(overall['heightIn'], 120),
    },
    roof: {
      type: str(roof['type'], "gable"),
      pitchNote: str(roof['pitchNote']),
      overhangIn: num(roof['overhangIn'], 0),
    },
    parts: arr(r['parts']).map((p, i) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        id: str(o['id'], `part-${i + 1}`),
        name: str(o['name'], `Part ${i + 1}`),
        role: (str(o['role'], "detail") as PartRole) ?? "detail",
        quantity: Math.max(1, Math.round(num(o['quantity'], 1))),
        widthIn: num(o['widthIn'], 12),
        heightIn: num(o['heightIn'], 12),
        notes: str(o['notes']),
      };
    }),
    openings: arr(r['openings']).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const face = str(o['face'], "front") as FaceKey;
      return {
        face: (["front", "back", "left", "right"] as string[]).includes(face) ? face : "front",
        kind: str(o['kind'], "window") === "door" ? ("door" as const) : ("window" as const),
        xIn: num(o['xIn']),
        yIn: num(o['yIn']),
        widthIn: num(o['widthIn'], 30),
        heightIn: num(o['heightIn'], 48),
      };
    }),
    assemblySteps: arr(r['assemblySteps']).map((s) => String(s)),
    finishingSteps: arr(r['finishingSteps']).map((s) => String(s)),
    assumptions: arr(r['assumptions']).map((s) => String(s)),
    extraMaterials: arr(r['extraMaterials']).map((s) => String(s)),
  };
}

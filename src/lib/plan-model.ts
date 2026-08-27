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
  /** Plain-language description of where the part sits on the finished model. */
  location?: string;
  /** How to cut it: grain, bevels, which openings come out of it. */
  cutNotes?: string;
  /** Which mass (volume) of the subject this part belongs to. */
  massId?: string;
}

export type FaceKey = "front" | "back" | "left" | "right";

export type MassKind =
  | "block"
  | "cylinder"
  /** Battered wall, plinth, spire base: footprint shrinks (or grows) towards the top. */
  | "tapered"
  /** Polygonal tower or bay, `sides` faces. */
  | "prism"
  /** An arcade wall: a block pierced by `bayCount` repeated arched bays. */
  | "arch-block"
  /** Revolved silhouette: dome, turret cap, baluster, column, urn. */
  | "swept"
  /** A drawn cross-section pushed along a length: cornice, moulding, sill, ridge cap. */
  | "extruded";

/** A point on a drawn profile, in real-world inches. */
export interface ProfilePoint {
  /** Half-width (radius) for swept shapes, or cross-section width for extrusions. */
  xIn: number;
  /** Height above the profile's base. */
  yIn: number;
}


export type TopTreatment =
  | "flat"
  | "gable"
  | "hip"
  | "shed"
  | "dome"
  | "cone"
  | "crenellated"
  | "parapet";

export interface PlanMassTop {
  type: TopTreatment;
  /** Extra height above the mass's wall height (roof rise / parapet height). */
  riseIn: number;
  /** For gable/shed roofs: which axis the ridge runs along. */
  ridgeAxis: "x" | "z";
  overhangIn: number;
  /** Crenellation: merlon (tooth) width, gap between teeth, tooth height. */
  merlonWidthIn: number;
  merlonGapIn: number;
  merlonHeightIn: number;
  notes: string;
}

/**
 * A single volume of the subject. Real subjects are several masses (a long wall
 * block, round towers, a recessed gate) — never one box.
 */
export interface PlanMass {
  id: string;
  name: string;
  kind: MassKind;
  /** Block footprint. For a cylinder these mirror diameterIn. */
  widthIn: number;
  depthIn: number;
  /** Cylinder footprint diameter. */
  diameterIn: number;
  /** Height to the top of the walls, before the top treatment. */
  heightIn: number;
  /** Footprint centre, in inches, relative to the whole subject's centre. */
  xIn: number;
  zIn: number;
  /** Height of the mass's base above the ground plane (0 for most). */
  baseYIn: number;
  rotationDeg: number;
  top: PlanMassTop;
  /** Number of faces for a prism mass (6 = hexagonal tower). 0 otherwise. */
  sides?: number;
  /**
   * Footprint size at the top for a tapered mass (diameter for round, width for
   * a block). 0 = same as the base.
   */
  topWidthIn?: number;
  /** Repeated arched bays for an `arch-block` mass. */
  bayCount?: number;
  bayWidthIn?: number;
  bayHeightIn?: number;
  bayShape?: OpeningShape;
  /**
   * Drawn cross-section for `swept` (revolved around the mass centre) and
   * `extruded` (pushed along the mass width) masses, bottom point first.
   */
  profile?: ProfilePoint[];
  /** Parent mass this one sits on, so a tower cap follows its shaft. */
  parentId?: string;
  materialNote: string;
  notes: string;
}


export type FeatureType =
  | "crenellation"
  | "string-course"
  | "cornice"
  | "buttress"
  | "banding"
  | "steps"
  | "chimney"
  | "balustrade"
  | "column"
  | "other";

/** Geometry that is not a plain panel: courses, buttresses, steps, parapets. */
export interface PlanFeature {
  id: string;
  name: string;
  type: FeatureType;
  massId: string;
  face: FaceKey;
  /** Real-world placement on that face/mass, in inches. */
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
  /** How far it stands out from (or sinks into) the wall. */
  projectionIn: number;
  /** Repeated features (courses of teeth, columns): how many and their pitch. */
  count: number;
  spacingIn: number;
  description: string;
  howToMake: string[];
}

export type OpeningShape =
  | "rectangle"
  | "round-arch"
  | "pointed-arch"
  | "horseshoe-arch"
  | "circle";

export interface PlanOpening {
  face: FaceKey;
  kind: "window" | "door";
  label?: string;
  /** Real-world inches from the left edge of that face to the opening's left edge. */
  xIn: number;
  /** Real-world inches from the bottom of that face to the opening's bottom edge. */
  yIn: number;
  widthIn: number;
  heightIn: number;
  paneCols?: number;
  paneRows?: number;
  trimNote?: string;
  /** Which mass the opening sits on (falls back to the largest block). */
  massId?: string;
  shape?: OpeningShape;
  /** Height of the arch above the springing line, for arched shapes. */
  archRiseIn?: number;
  /** How deep the opening is recessed into the wall. */
  recessIn?: number;
  /** Arcades: repeat this opening N times at this pitch along the face. */
  repeatCount?: number;
  repeatSpacingIn?: number;
  /** Cylinder masses: position around the tower, 0 = facing front. */
  angleDeg?: number;
}


export interface PlanDetailElement {
  name: string;
  description: string;
  location: string;
  materials: string;
  howToMake: string[];
}

export interface PlanStep {
  instruction: string;
  detail: string;
  tip: string;
}

export interface PlanStage {
  title: string;
  goal: string;
  tools: string[];
  parts: string[];
  steps: PlanStep[];
  check: string;
}

export interface PlanPaintArea {
  area: string;
  color: string;
  colorMatch: string;
  technique: string;
}

export interface PlanGlossaryEntry {
  term: string;
  definition: string;
}

export interface PlanModel {
  subject: string;
  style: string;
  stories: number;
  overview: string;
  difficulty: string;
  estimatedHours: number;
  overall: { widthIn: number; depthIn: number; heightIn: number; wallHeightIn: number };
  roof: { type: string; pitchNote: string; overhangIn: number; buildNotes: string };
  /** The subject broken into volumes. Drives the 3D preview and elevations. */
  masses: PlanMass[];
  features: PlanFeature[];
  /** Plain-language structural reading of the photos (pass 1 of generation). */
  structureNotes: string;
  /** Honest list of ways the model differs from the photographs. */
  knownDifferences: string[];
  parts: PlanPart[];
  openings: PlanOpening[];
  detailElements: PlanDetailElement[];
  assemblyStages: PlanStage[];
  assemblySteps: string[];
  finishingSteps: string[];
  paintPlan: PlanPaintArea[];
  toolsNeeded: string[];
  suppliesNeeded: string[];
  glossary: PlanGlossaryEntry[];
  safetyNotes: string[];
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
    wallHeightIn: model.overall.wallHeightIn / d,
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
  location: string;
  cutNotes: string;
  /** Openings that must be cut out of this panel, in model inches. */
  openings: Array<{
    label: string;
    kind: "window" | "door";
    fromLeftIn: number;
    fromBottomIn: number;
    widthIn: number;
    heightIn: number;
  }>;
}

const SNAP = 32; // snap to nearest 1/32"

export function snapInches(value: number): number {
  return Math.max(1 / SNAP, Math.round(value * SNAP) / SNAP);
}

const ROLE_FACE: Partial<Record<PartRole, FaceKey>> = {
  "front-wall": "front",
  "back-wall": "back",
};

/**
 * Butt-joint compensation: front/back panels overlap the side panels, so the
 * side panels lose one stock thickness at each end. Roof panels gain the overhang.
 */
export function buildCutList(model: PlanModel, scale: ScaleSettings): CutListRow[] {
  const d = resolveDenominator(model, scale);
  const t = scale.stockThicknessIn;
  let sideWallSeen = 0;
  const parts = [...model.parts, ...derivedGeometryParts(model)];

  return parts.map((part) => {
    let length = part.widthIn / d;
    const height = part.heightIn / d;
    const notes: string[] = [];
    if (part.notes) notes.push(part.notes);

    if (part.role === "side-wall") {
      length = Math.max(length - 2 * t, length * 0.25);
      notes.push(
        `Trimmed 2× ${formatInches(t)} stock thickness so the front and back panels wrap this panel's ends (butt joint)`,
      );
    }
    if (part.role === "floor" || part.role === "base") {
      notes.push("Fits inside the wall box");
    }

    // Which face's openings belong to this panel?
    let face: FaceKey | undefined = ROLE_FACE[part.role];
    if (part.role === "side-wall") {
      face = sideWallSeen === 0 ? "left" : "right";
      sideWallSeen += 1;
    }
    const openings = face
      ? expandOpenings(model.openings)
          .filter(
            (o) =>
              o.face === face && (!part.massId || !o.massId || o.massId === part.massId),
          )
          .map((o) => ({
            label: `${o.label || `${o.kind} on ${o.face}`}${
              o.shape && o.shape !== "rectangle" ? ` (${o.shape.replace("-", " ")})` : ""
            }`,
            kind: o.kind,
            fromLeftIn: snapInches(o.xIn / d),
            fromBottomIn: snapInches(o.yIn / d),
            widthIn: snapInches(o.widthIn / d),
            heightIn: snapInches(o.heightIn / d),
          }))
      : [];

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
      location: part.location ?? "",
      cutNotes: part.cutNotes ?? "",
      openings,
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
    overview: "",
    difficulty: "beginner",
    estimatedHours: 0,
    overall: { widthIn: 0, depthIn: 0, heightIn: 0, wallHeightIn: 0 },
    roof: { type: "gable", pitchNote: "", overhangIn: 0, buildNotes: "" },
    masses: [],
    features: [],
    structureNotes: "",
    knownDifferences: [],
    parts: [],
    openings: [],
    detailElements: [],
    assemblyStages: [],
    assemblySteps: [],
    finishingSteps: [],
    paintPlan: [],
    toolsNeeded: [],
    suppliesNeeded: [],
    glossary: [],
    safetyNotes: [],
    assumptions: [],
    extraMaterials: [],
  };
}

/** Defensive normalizer for AI/db JSON so the UI never crashes on a bad field. */
export function normalizePlanModel(raw: unknown): PlanModel {
  const model = normalizeRaw(raw);
  // Keep `overall` in agreement with the massing so every scale calculation,
  // drawing and 3D view uses the same bounding box.
  if (model.masses.length) {
    const b = massBounds(model.masses);
    if (b.widthIn > 0 && b.depthIn > 0 && b.maxY > 0) {
      model.overall = {
        widthIn: b.widthIn,
        depthIn: b.depthIn,
        heightIn: b.maxY,
        wallHeightIn: Math.min(
          Math.max(...model.masses.map((m) => m.baseYIn + m.heightIn)),
          b.maxY,
        ),
      };
    }
  }
  return model;
}

function normalizeRaw(raw: unknown): PlanModel {
  const base = emptyPlanModel();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const strs = (v: unknown) => arr(v).map((s) => String(s)).filter(Boolean);
  const obj = (v: unknown) => (v ?? {}) as Record<string, unknown>;
  const overall = obj(r['overall']);
  const roof = obj(r['roof']);

  return {
    subject: str(r['subject'], "Photographed subject"),
    style: str(r['style']),
    stories: Math.max(1, Math.round(num(r['stories'], 1))),
    overview: str(r['overview']),
    difficulty: str(r['difficulty'], "beginner"),
    estimatedHours: num(r['estimatedHours'], 0),
    overall: {
      widthIn: num(overall['widthIn'], 120),
      depthIn: num(overall['depthIn'], 96),
      heightIn: num(overall['heightIn'], 120),
      wallHeightIn: num(overall['wallHeightIn'], num(overall['heightIn'], 120)),
    },
    roof: {
      type: str(roof['type'], "gable"),
      pitchNote: str(roof['pitchNote']),
      overhangIn: num(roof['overhangIn'], 0),
      buildNotes: str(roof['buildNotes']),
    },
    masses: arr(r['masses']).map((m, i) => {
      const o = obj(m);
      const kind: MassKind = str(o['kind'], "block") === "cylinder" ? "cylinder" : "block";
      const top = obj(o['top']);
      const topType = str(top['type'], "flat") as TopTreatment;
      const diameterIn = num(o['diameterIn'], num(o['widthIn'], 48));
      return {
        id: str(o['id'], `mass-${i + 1}`),
        name: str(o['name'], `Mass ${i + 1}`),
        kind,
        widthIn: kind === "cylinder" ? diameterIn : num(o['widthIn'], 96),
        depthIn: kind === "cylinder" ? diameterIn : num(o['depthIn'], 96),
        diameterIn,
        heightIn: num(o['heightIn'], 96),
        xIn: num(o['xIn']),
        zIn: num(o['zIn']),
        baseYIn: num(o['baseYIn']),
        rotationDeg: num(o['rotationDeg']),
        top: {
          type: (
            [
              "flat",
              "gable",
              "hip",
              "shed",
              "dome",
              "cone",
              "crenellated",
              "parapet",
            ] as string[]
          ).includes(topType)
            ? topType
            : "flat",
          riseIn: num(top['riseIn']),
          ridgeAxis: str(top['ridgeAxis'], "x") === "z" ? ("z" as const) : ("x" as const),
          overhangIn: num(top['overhangIn']),
          merlonWidthIn: num(top['merlonWidthIn']),
          merlonGapIn: num(top['merlonGapIn']),
          merlonHeightIn: num(top['merlonHeightIn']),
          notes: str(top['notes']),
        },
        materialNote: str(o['materialNote']),
        notes: str(o['notes']),
      };
    }),
    features: arr(r['features']).map((f, i) => {
      const o = obj(f);
      const type = str(o['type'], "other") as FeatureType;
      const face = str(o['face'], "front") as FaceKey;
      return {
        id: str(o['id'], `feature-${i + 1}`),
        name: str(o['name'], `Feature ${i + 1}`),
        type: (
          [
            "crenellation",
            "string-course",
            "cornice",
            "buttress",
            "banding",
            "steps",
            "chimney",
            "balustrade",
            "column",
            "other",
          ] as string[]
        ).includes(type)
          ? type
          : "other",
        massId: str(o['massId']),
        face: (["front", "back", "left", "right"] as string[]).includes(face) ? face : "front",
        xIn: num(o['xIn']),
        yIn: num(o['yIn']),
        widthIn: num(o['widthIn']),
        heightIn: num(o['heightIn']),
        projectionIn: num(o['projectionIn']),
        count: Math.max(1, Math.round(num(o['count'], 1))),
        spacingIn: num(o['spacingIn']),
        description: str(o['description']),
        howToMake: strs(o['howToMake']),
      };
    }),
    structureNotes: str(r['structureNotes']),
    knownDifferences: strs(r['knownDifferences']),
    parts: arr(r['parts']).map((p, i) => {
      const o = obj(p);
      return {
        id: str(o['id'], `part-${i + 1}`),
        name: str(o['name'], `Part ${i + 1}`),
        role: (str(o['role'], "detail") as PartRole) ?? "detail",
        quantity: Math.max(1, Math.round(num(o['quantity'], 1))),
        widthIn: num(o['widthIn'], 12),
        heightIn: num(o['heightIn'], 12),
        notes: str(o['notes']),
        location: str(o['location']),
        cutNotes: str(o['cutNotes']),
        massId: str(o['massId']),
      };
    }),
    openings: arr(r['openings']).map((p) => {
      const o = obj(p);
      const face = str(o['face'], "front") as FaceKey;
      const shape = str(o['shape'], "rectangle") as OpeningShape;
      return {
        face: (["front", "back", "left", "right"] as string[]).includes(face) ? face : "front",
        kind: str(o['kind'], "window") === "door" ? ("door" as const) : ("window" as const),
        label: str(o['label']),
        xIn: num(o['xIn']),
        yIn: num(o['yIn']),
        widthIn: num(o['widthIn'], 30),
        heightIn: num(o['heightIn'], 48),
        paneCols: Math.max(1, Math.round(num(o['paneCols'], 1))),
        paneRows: Math.max(1, Math.round(num(o['paneRows'], 1))),
        trimNote: str(o['trimNote']),
        massId: str(o['massId']),
        shape: (
          ["rectangle", "round-arch", "pointed-arch", "horseshoe-arch", "circle"] as string[]
        ).includes(shape)
          ? shape
          : "rectangle",
        archRiseIn: num(o['archRiseIn']),
        recessIn: num(o['recessIn']),
        repeatCount: Math.max(1, Math.round(num(o['repeatCount'], 1))),
        repeatSpacingIn: num(o['repeatSpacingIn']),
        angleDeg: num(o['angleDeg']),
      };
    }),

    detailElements: arr(r['detailElements']).map((p) => {
      const o = obj(p);
      return {
        name: str(o['name'], "Detail"),
        description: str(o['description']),
        location: str(o['location']),
        materials: str(o['materials']),
        howToMake: strs(o['howToMake']),
      };
    }),
    assemblyStages: arr(r['assemblyStages']).map((p, i) => {
      const o = obj(p);
      return {
        title: str(o['title'], `Stage ${i + 1}`),
        goal: str(o['goal']),
        tools: strs(o['tools']),
        parts: strs(o['parts']),
        steps: arr(o['steps']).map((s) => {
          if (typeof s === "string") return { instruction: s, detail: "", tip: "" };
          const so = obj(s);
          return {
            instruction: str(so['instruction']),
            detail: str(so['detail']),
            tip: str(so['tip']),
          };
        }),
        check: str(o['check']),
      };
    }),
    paintPlan: arr(r['paintPlan']).map((p) => {
      const o = obj(p);
      return {
        area: str(o['area']),
        color: str(o['color']),
        colorMatch: str(o['colorMatch']),
        technique: str(o['technique']),
      };
    }),
    toolsNeeded: strs(r['toolsNeeded']),
    suppliesNeeded: strs(r['suppliesNeeded']),
    glossary: arr(r['glossary']).map((p) => {
      const o = obj(p);
      return { term: str(o['term']), definition: str(o['definition']) };
    }),
    safetyNotes: strs(r['safetyNotes']),
    assemblySteps: strs(r['assemblySteps']),
    finishingSteps: strs(r['finishingSteps']),
    assumptions: strs(r['assumptions']),
    extraMaterials: strs(r['extraMaterials']),
  };
}


/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Masses for rendering. Legacy plans (and any plan where the model skipped the
 * massing pass) fall back to a single block derived from `overall`, so old
 * projects keep working.
 */
export function ensureMasses(model: PlanModel): PlanMass[] {
  const real = model.masses.filter((m) => m.heightIn > 0 && (m.widthIn > 0 || m.diameterIn > 0));
  if (real.length) return real;
  const { widthIn, depthIn, heightIn, wallHeightIn } = model.overall;
  const wall = Math.min(wallHeightIn || heightIn, heightIn);
  const rise = Math.max(heightIn - wall, 0);
  return [
    {
      id: "mass-main",
      name: model.subject || "Main volume",
      kind: "block",
      widthIn,
      depthIn,
      diameterIn: Math.max(widthIn, depthIn),
      heightIn: wall,
      xIn: 0,
      zIn: 0,
      baseYIn: 0,
      rotationDeg: 0,
      top: {
        type: rise > wall * 0.04 ? "gable" : "flat",
        riseIn: rise,
        ridgeAxis: "x",
        overhangIn: model.roof.overhangIn,
        merlonWidthIn: 0,
        merlonGapIn: 0,
        merlonHeightIn: 0,
        notes: model.roof.buildNotes,
      },
      materialNote: "",
      notes: model.roof.pitchNote,
    },
  ];
}

/** Bounding box of all masses, in real-world inches. */
export function massBounds(masses: PlanMass[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  for (const m of masses) {
    const w = m.kind === "cylinder" ? m.diameterIn : m.widthIn;
    const dp = m.kind === "cylinder" ? m.diameterIn : m.depthIn;
    minX = Math.min(minX, m.xIn - w / 2);
    maxX = Math.max(maxX, m.xIn + w / 2);
    minZ = Math.min(minZ, m.zIn - dp / 2);
    maxZ = Math.max(maxZ, m.zIn + dp / 2);
    maxY = Math.max(maxY, m.baseYIn + m.heightIn + Math.max(m.top.riseIn, 0));
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 0, widthIn: 0, depthIn: 0 };
  return { minX, maxX, minZ, maxZ, maxY, widthIn: maxX - minX, depthIn: maxZ - minZ };
}

/** The mass an opening belongs to, falling back to the largest one. */
export function openingMass(model: PlanModel, o: PlanOpening): PlanMass {
  const masses = ensureMasses(model);
  const found = o.massId ? masses.find((m) => m.id === o.massId) : undefined;
  if (found) return found;
  return masses.reduce((a, b) => (b.widthIn * b.heightIn > a.widthIn * a.heightIn ? b : a), masses[0]!);
}

/** Expand arcade repeats into individual openings for drawing and counting. */
export function expandOpenings(openings: PlanOpening[]): PlanOpening[] {
  const out: PlanOpening[] = [];
  for (const o of openings) {
    const count = Math.max(1, Math.round(o.repeatCount ?? 1));
    const pitch = o.repeatSpacingIn && o.repeatSpacingIn > 0 ? o.repeatSpacingIn : o.widthIn * 1.6;
    for (let i = 0; i < count; i++) {
      out.push(i === 0 ? o : { ...o, xIn: o.xIn + pitch * i, repeatCount: 1 });
    }
  }
  return out;
}

/**
 * Extra cut-list rows implied by the geometry when the model didn't list parts
 * for a mass: tower wraps, cylinder discs, crenellation strips.
 */
export function derivedGeometryParts(model: PlanModel): PlanPart[] {
  const masses = ensureMasses(model);
  if (!model.masses.length) return [];
  const covered = new Set(model.parts.map((p) => p.massId).filter(Boolean) as string[]);
  const out: PlanPart[] = [];
  for (const m of masses) {
    if (!covered.has(m.id)) {
      if (m.kind === "cylinder") {
        const circumference = Math.PI * m.diameterIn;
        out.push({
          id: `${m.id}-wrap`,
          name: `${m.name} — wall wrap`,
          role: "side-wall",
          quantity: 1,
          widthIn: circumference,
          heightIn: m.heightIn,
          massId: m.id,
          location: `Wraps around ${m.name}.`,
          cutNotes:
            "Cut one long rectangle. Score the inside face every 1/4 in across the grain (or soak thin ply) so it bends into a cylinder, then glue around the top and bottom discs.",
          notes: `Length = circumference of a ${formatInches(m.diameterIn)} diameter tower.`,
        });
        out.push({
          id: `${m.id}-disc`,
          name: `${m.name} — top & bottom disc`,
          role: "floor",
          quantity: 2,
          widthIn: m.diameterIn,
          heightIn: m.diameterIn,
          massId: m.id,
          location: `Inside ${m.name}, at the base and under the top.`,
          cutNotes: "Cut two circles of this diameter. They keep the wrapped wall round.",
          notes: "Sand the edges until the wrap sits flush.",
        });
      } else {
        out.push({
          id: `${m.id}-front`,
          name: `${m.name} — front & back panel`,
          role: "front-wall",
          quantity: 2,
          widthIn: m.widthIn,
          heightIn: m.heightIn,
          massId: m.id,
          location: `Front and back faces of ${m.name}.`,
          cutNotes: "Cut square, grain running vertically. Cut this mass's openings out before assembly.",
          notes: m.notes,
        });
        out.push({
          id: `${m.id}-side`,
          name: `${m.name} — side panel`,
          role: "side-wall",
          quantity: 2,
          widthIn: m.depthIn,
          heightIn: m.heightIn,
          massId: m.id,
          location: `Left and right faces of ${m.name}.`,
          cutNotes: "Cut square; these sit between the front and back panels.",
          notes: m.notes,
        });
      }
    }
    if (m.top.type === "crenellated" || m.top.type === "parapet") {
      const perimeter =
        m.kind === "cylinder" ? Math.PI * m.diameterIn : (m.widthIn + m.depthIn) * 2;
      out.push({
        id: `${m.id}-parapet`,
        name: `${m.name} — ${m.top.type === "crenellated" ? "battlement strip" : "parapet strip"}`,
        role: "trim",
        quantity: 1,
        widthIn: perimeter,
        heightIn: Math.max(m.top.merlonHeightIn || m.top.riseIn, 1),
        massId: m.id,
        location: `Stands above the wall top of ${m.name}.`,
        cutNotes:
          m.top.type === "crenellated"
            ? `Cut one long strip, then notch the top edge: ${formatInches(
                m.top.merlonWidthIn || 4,
              )} tooth, ${formatInches(m.top.merlonGapIn || 3)} gap, repeated the whole length. Cut the notches before you cut the strip into wall lengths.`
            : "Cut one long strip and mitre it at the corners.",
        notes: `Total run around the mass: ${formatInches(perimeter)}.`,
      });
    }
  }
  return out;
}

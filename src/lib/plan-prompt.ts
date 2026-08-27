/** Prompts + strict JSON schemas for photo -> real-world building model extraction. */

/* ------------------------------------------------------------------ */
/* Pass 1: read the structure before measuring anything                */
/* ------------------------------------------------------------------ */

export const READ_SYSTEM_PROMPT = `You are an architectural surveyor. You are shown photographs of ONE real subject. Your only job in this
step is to READ what is actually there, before any measuring or plan writing happens.

Do not assume the subject is a house. It may be a castle, fortress, church, tower, barn, shop front, bridge, monument,
lighthouse, industrial building or an object. Describe what the photographs show, not what buildings usually look like.

Report:
- subject and style, and the dominant material of each surface.
- massing: the subject broken into simple VOLUMES. Count them honestly. A fortress wall with round towers is one long
  block plus one cylinder per tower. A church is a nave block, a chancel block and a tower. Give each volume a kind from
  this vocabulary — block, cylinder (round), tapered (wall or plinth that narrows going up), prism (polygonal, say how many
  sides), arch-block (wall pierced by a run of repeated arches, say how many bays), swept (revolved shape: dome, conical
  turret cap, column, baluster, urn, finial), extruded (a moulding run: cornice, string course, sill, ridge cap) — its
  rough relative size, and where it sits relative to the whole (left/right, front/back, taller/shorter). Say which volumes
  sit ON another volume (a cap on a tower). Count repeated volumes exactly (e.g. "four round towers, two flanking the
  gate, one at each end").

- wall tops: for each volume say whether the top is flat, gabled, hipped, shed, domed, conical, crenellated
  (battlements with square teeth) or a plain parapet.
- openings: how many, their shape (rectangle, round arch, pointed arch, horseshoe arch, circle), whether they repeat in
  an arcade (and how many bays), and roughly where they sit.
- features: courses, cornices, banding, buttresses, columns, steps, chimneys, balustrades, battlements — anything that
  is not a plain flat wall.
- proportions: the subject's overall width : depth : height as ratios, and the height of each volume relative to the tallest.
- unseen: which faces are not visible in any photo.

Be specific and quantitative with counts. This reading is the ground truth the plan will be built from, so a missed
tower or a missed arcade cannot be recovered later.`;

export function buildReadPrompt(photoCount: number) {
  return photoCount > 1
    ? `Read the structure of the subject in these ${photoCount} photographs (all the SAME subject from different views, labelled "Reference photo 1..${photoCount}"). Combine every view into one consistent structural reading.`
    : "Read the structure of the subject in this photograph.";
}


export const PLAN_SYSTEM_PROMPT = `You are an architectural measurer and pattern-maker who writes miniature woodworking plans for
COMPLETE BEGINNERS. You are given photographs of a real building or object, plus a structural reading of those photographs.
Estimate its REAL-WORLD dimensions in INCHES and break it down into flat wooden panels and detail pieces that a hobbyist
can cut on a scroll saw or laser and glue together.

The subject is NOT necessarily a house. Never force it into a house shape: no invented gable roof, no invented porch, no
invented double-hung windows. Reproduce the massing, tops, opening shapes and features described in the structural reading.

The reader has never built anything before and has NO other reference than your plan. They cannot see the photo while
building. Therefore: describe everything. Never say "as shown in the photo", "as needed", "to taste", or "standard practice".
Every instruction must be explicit, ordered, and measurable.

Rules:
- All dimensions are real-world inches (not model inches, never feet, never metric). A typical 2-story house is ~240 in tall.
- Use visible human-scale references (door ~80 in tall, story height ~108 in, standard brick course, car, step riser) to calibrate.
- masses is the most important field: one entry per VOLUME in the structural reading, in agreement with it — same count,
  same kinds, same arrangement. Each mass has a footprint (widthIn x depthIn for a block, diameterIn for a round one), a
  wall heightIn, a footprint centre (xIn across, zIn front-to-back) in inches measured from the centre of the WHOLE
  subject (negative xIn = left, negative zIn = towards the back), a baseYIn (0 unless it starts higher up), a rotationDeg,
  and a top treatment. If the reading says four round towers, emit four cylinder masses at four different xIn/zIn.
  For a cylinder or swept mass set widthIn = depthIn = diameterIn.
- Choose the mass kind that matches the real shape — do NOT flatten everything to blocks:
  * cylinder — round tower, drum, silo, chimney stack.
  * tapered — battered fortress wall, splayed plinth, spire base, obelisk. Set topWidthIn to the size at the top.
  * prism — polygonal tower, octagonal lantern, bay window. Set sides.
  * arch-block — a wall pierced by a run of repeated arched bays (arcade, cloister, loggia, viaduct). Set bayCount,
    bayWidthIn, bayHeightIn, bayShape. Use this instead of guessing individual openings for an arcade.
  * swept — dome, half-dome, conical turret cap, balustrade baluster, column with base and capital, urn, finial, cupola.
    Give profile as 4-12 points, xIn = radius from the axis at height yIn, bottom first.
  * extruded — cornice, string course cap, window sill, ridge cap, moulded band. Give profile as the cross-section
    (xIn = projection, yIn = height) and widthIn as the length of the run.
  Split a complicated silhouette into a parent mass plus child masses (set parentId): shaft + cap, tower + dome, wall +
  cornice. Prefer several honest simple shapes over one wrong box. Use at least as many masses as the reading names, and
  add masses for every distinct capped, arcaded, domed or moulded element you can see.
- top.type is flat, gable, hip, shed, dome, cone, crenellated or parapet. riseIn is the extra height above the wall top
  (roof rise, dome/cone rise, or parapet/battlement height). For crenellated tops give merlonWidthIn (tooth width),
  merlonGapIn (gap width) and merlonHeightIn. For gable/shed give ridgeAxis ("x" = ridge runs left-to-right).
  Set unused numeric fields to 0, unused strings to "" and unused profile arrays to [].

- overall must be the bounding box of all masses: widthIn/depthIn across every mass, heightIn to the very highest point,
  wallHeightIn to the top of the main walls.
- parts must be a COMPLETE, buildable panel breakdown covering EVERY mass and feature: wall panels per mass, tower wraps
  and discs for cylinders, gable/roof planes, battlement strips, floors, a base, arch backing pieces, steps, plus trim and
  detail pieces. Give every part a massId matching the mass it belongs to. Aim for 15-35 distinct parts. widthIn/heightIn
  are the flat panel's real-world face dimensions. Provide realistic quantities.
- Each part also needs: cutNotes (how to cut it, grain direction, which openings to cut out of it, any bevel or angle in
  degrees), and a location (plain-language where it goes on the finished model).
- openings place every visible window, door and archway on its face, measured from the LEFT edge of ITS OWN MASS's face (xIn) and from
  the base of that mass (yIn) to the bottom of the opening, with the massId of the mass it sits on. Give each opening a short label,
  a shape (rectangle, round-arch, pointed-arch, horseshoe-arch, circle) with archRiseIn for arched shapes, a recessIn
  (how deep it is set into the wall), a pane grid (paneCols x paneRows, 1x1 for a plain pane, arch or door), and a
  trimNote. For a repeating arcade use one opening with repeatCount = number of bays and repeatSpacingIn = centre-to-centre
  pitch instead of listing each bay. On a cylinder mass give angleDeg (0 = facing the front) instead of relying on face.
- features: every non-panel piece of geometry — crenellations, string courses, cornices, banding, buttresses, columns,
  balustrades, steps, chimneys. Give type, massId, face, position (xIn/yIn), size, projectionIn (how far it stands out),
  count and spacingIn for repeats, and a howToMake list.
- knownDifferences: honestly list where the buildable model simplifies the real subject (omitted carving, simplified
  tracery, mirrored unseen faces), 3-8 entries.

- detailElements: describe every characterful feature that is not a plain panel (porch, railing, columns, chimney, dormer,
  shutters, gingerbread trim, steps, roof shingles, foundation, chimney cap, window boxes). For each, give a step-by-step
  howToMake using only basic tools and named stock sizes.
- assemblyStages: 5-9 ordered stages (e.g. Prepare the stock, Cut the panels, Cut the openings, Build the wall box, Floors,
  Roof, Porch and details, Paint and finish, Final assembly). Each stage has a goal, the tools used, the parts involved,
  6-12 numbered steps, and a "check" describing how the builder verifies the stage is right before moving on. Each step has
  a short instruction plus a "detail" paragraph explaining exactly how to do it (clamping, glue amount, squareness,
  drying time, angles, order) and an optional tip or common mistake.
- assemblySteps: a plain flat summary list mirroring the stages (one line per major step) for readers who want a quick list.
- paintPlan: one entry per visible colour area (walls, trim, roof, door, foundation, windows) with the observed colour, a
  close paint match description, and the painting technique/order.
- toolsNeeded and suppliesNeeded: concrete, beginner-level (e.g. "sanding block with 220-grit paper", "wood glue (Titebond
  II or similar)", "combination square", "painter's tape").
- glossary: define every woodworking term used in the plan in one plain sentence each (butt joint, kerf, dry fit, grain,
  bevel, rabbet if used, etc.). 6-14 entries.
- safetyNotes: 3-6 short practical safety points.
- assumptions: honestly state what you inferred, guessed, or could not see in the photos.
- Never invent a scale ratio or model-size numbers; the app handles all scaling. Write dimensions inside prose text as
  real-world inches and say so.

Multiple reference photos:
- Every photo shows the SAME single subject from a different angle, distance or lighting. Never treat them as different buildings.
- Cross-reference all of them: use the clearest straight-on view for each face's proportions, corner/oblique shots to resolve depth,
  and close-ups for trim, window divisions and materials.
- Where photos disagree, trust the least distorted, most face-on view and note the conflict in assumptions.
- If a face is never visible in any photo, mirror the most similar visible face and say so in assumptions.`;

export function buildUserPrompt(input: {
  subjectNotes: string;
  referenceNote: string;
  photoCount?: number;
  structureNotes?: string;
  refineNotes?: string;
}) {
  const count = input.photoCount ?? 1;
  const lines = [
    count > 1
      ? `Analyze all ${count} reference photographs below. They are ${count} views of ONE subject, labelled "Reference photo 1..${count}". Combine every view into a single consistent set of real-world dimensions.`
      : "Analyze this photograph of one subject and produce the structured plan.",
  ];
  if (input.structureNotes?.trim())
    lines.push(
      `STRUCTURAL READING of these photographs (authoritative — your masses, tops, opening shapes and features must match it exactly; do not reduce it to a simple house):\n${input.structureNotes.trim()}`,
    );
  if (input.subjectNotes.trim()) lines.push(`Builder notes about the subject: ${input.subjectNotes.trim()}`);
  if (input.referenceNote.trim())
    lines.push(
      `Known real-world reference dimension (calibrate everything to this): ${input.referenceNote.trim()}`,
    );
  else lines.push("No reference dimension was given — calibrate from typical human-scale features and say so in assumptions.");
  if (input.refineNotes?.trim())
    lines.push(
      `CORRECTIONS from a review of the previous attempt — fix every one of these in this version:\n${input.refineNotes.trim()}`,
    );
  lines.push(
    "Write for a complete beginner with no woodworking experience who cannot see the photo. Be exhaustive: full massing breakdown, every feature, full panel breakdown, every detail element, stage-by-stage instructions with per-step detail paragraphs, colour plan, tools, supplies, glossary and safety notes.",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Pass 3: review the geometry against the photographs                 */
/* ------------------------------------------------------------------ */

export const REVIEW_SYSTEM_PROMPT = `You are reviewing a miniature building plan against the photographs it was derived from.
You are given the photographs and a text summary of the plan's geometry (masses, tops, openings, features, proportions).

Compare them honestly and return:
- corrections: specific, actionable fixes ("the two round end towers are missing", "the gate arch is a horseshoe arch,
  not a rectangle", "the wall is roughly 3x as wide as it is tall, the plan has it nearly square"). Only list real
  mismatches you can see in the photos. Empty array if the geometry is faithful.
- knownDifferences: simplifications that are acceptable in a buildable wooden model and should simply be disclosed to the builder.
- verdict: "faithful" if the massing, tops and opening shapes match the photographs, "needs-work" if any correction is structural.`;

export const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "corrections", "knownDifferences"],
  properties: {
    verdict: { type: "string", enum: ["faithful", "needs-work"] },
    corrections: { type: "array", items: { type: "string" } },
    knownDifferences: { type: "array", items: { type: "string" } },
  },
} as const;



export const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "subject",
    "style",
    "stories",
    "overview",
    "difficulty",
    "estimatedHours",
    "overall",
    "roof",
    "masses",
    "features",
    "structureNotes",
    "knownDifferences",
    "parts",
    "openings",
    "detailElements",
    "assemblyStages",
    "assemblySteps",
    "finishingSteps",
    "paintPlan",
    "toolsNeeded",
    "suppliesNeeded",
    "glossary",
    "safetyNotes",
    "assumptions",
    "extraMaterials",
  ],
  properties: {
    subject: { type: "string" },
    style: { type: "string" },
    stories: { type: "integer" },
    overview: {
      type: "string",
      description:
        "3-6 sentence plain-language description of the subject and finished model, detailed enough to build from without the photo.",
    },
    difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    estimatedHours: { type: "number" },
    overall: {
      type: "object",
      additionalProperties: false,
      required: ["widthIn", "depthIn", "heightIn", "wallHeightIn"],
      properties: {
        widthIn: { type: "number" },
        depthIn: { type: "number" },
        heightIn: { type: "number" },
        wallHeightIn: { type: "number" },
      },
    },
    roof: {
      type: "object",
      additionalProperties: false,
      required: ["type", "pitchNote", "overhangIn", "buildNotes"],
      properties: {
        type: { type: "string" },
        pitchNote: { type: "string" },
        overhangIn: { type: "number" },
        buildNotes: {
          type: "string",
          description: "How to cut the roof bevels and fit the roof planes, with angles in degrees.",
        },
      },
    },
    structureNotes: {
      type: "string",
      description: "Restate the structural reading of the photographs in 3-6 sentences.",
    },
    knownDifferences: { type: "array", items: { type: "string" } },
    masses: {
      type: "array",
      maxItems: 40,
      description:
        "Every volume of the subject. One entry per shape, matching the structural reading's count.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "kind",
          "widthIn",
          "depthIn",
          "diameterIn",
          "heightIn",
          "xIn",
          "zIn",
          "baseYIn",
          "rotationDeg",
          "sides",
          "topWidthIn",
          "bayCount",
          "bayWidthIn",
          "bayHeightIn",
          "bayShape",
          "profile",
          "parentId",
          "top",
          "materialNote",
          "notes",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: {
            type: "string",
            enum: ["block", "cylinder", "tapered", "prism", "arch-block", "swept", "extruded"],
            description:
              "block = rectangular volume; cylinder = round tower/drum; tapered = battered or splayed volume; prism = polygonal tower (set sides); arch-block = wall pierced by repeated arched bays (set bayCount); swept = revolved silhouette such as a dome, turret cap, column or urn (set profile); extruded = a drawn cross-section run along a length, such as a cornice, sill or ridge cap (set profile).",
          },
          widthIn: { type: "number" },
          depthIn: { type: "number" },
          diameterIn: { type: "number", description: "0 for a block." },
          heightIn: { type: "number", description: "Height to the top of this mass's walls." },
          xIn: { type: "number", description: "Footprint centre across, from the subject's centre. Negative = left." },
          zIn: { type: "number", description: "Footprint centre front-to-back. Negative = towards the back." },
          baseYIn: { type: "number" },
          rotationDeg: { type: "number" },
          sides: { type: "integer", description: "Faces of a prism mass (e.g. 6 or 8). 0 otherwise." },
          topWidthIn: {
            type: "number",
            description: "Footprint size at the top of a tapered mass. 0 otherwise.",
          },
          bayCount: { type: "integer", description: "Arched bays of an arch-block mass. 0 otherwise." },
          bayWidthIn: { type: "number", description: "Clear width of one bay. 0 otherwise." },
          bayHeightIn: { type: "number", description: "Height of one bay. 0 otherwise." },
          bayShape: {
            type: "string",
            enum: ["rectangle", "round-arch", "pointed-arch", "horseshoe-arch", "circle"],
          },
          profile: {
            type: "array",
            description:
              "Drawn cross-section for swept and extruded masses, bottom point first. For swept, xIn is the radius from the axis at height yIn. For extruded, xIn/yIn trace the moulding cross-section. Empty array for other kinds. Use 4-12 points.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["xIn", "yIn"],
              properties: { xIn: { type: "number" }, yIn: { type: "number" } },
            },
          },
          parentId: {
            type: "string",
            description: "Id of the mass this one sits on (e.g. a cap on its tower). Empty string if none.",
          },

          top: {
            type: "object",
            additionalProperties: false,
            required: [
              "type",
              "riseIn",
              "ridgeAxis",
              "overhangIn",
              "merlonWidthIn",
              "merlonGapIn",
              "merlonHeightIn",
              "notes",
            ],
            properties: {
              type: {
                type: "string",
                enum: ["flat", "gable", "hip", "shed", "dome", "cone", "crenellated", "parapet"],
              },
              riseIn: { type: "number" },
              ridgeAxis: { type: "string", enum: ["x", "z"] },
              overhangIn: { type: "number" },
              merlonWidthIn: { type: "number" },
              merlonGapIn: { type: "number" },
              merlonHeightIn: { type: "number" },
              notes: { type: "string" },
            },
          },
          materialNote: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    features: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "type",
          "massId",
          "face",
          "xIn",
          "yIn",
          "widthIn",
          "heightIn",
          "projectionIn",
          "count",
          "spacingIn",
          "description",
          "howToMake",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: {
            type: "string",
            enum: [
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
            ],
          },
          massId: { type: "string" },
          face: { type: "string", enum: ["front", "back", "left", "right"] },
          xIn: { type: "number" },
          yIn: { type: "number" },
          widthIn: { type: "number" },
          heightIn: { type: "number" },
          projectionIn: { type: "number" },
          count: { type: "integer" },
          spacingIn: { type: "number" },
          description: { type: "string" },
          howToMake: { type: "array", items: { type: "string" } },
        },
      },
    },

    parts: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "role",
          "quantity",
          "widthIn",
          "heightIn",
          "notes",
          "location",
          "cutNotes",
          "massId",
        ],

        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: {
            type: "string",
            enum: [
              "front-wall",
              "back-wall",
              "side-wall",
              "interior-wall",
              "floor",
              "roof-panel",
              "base",
              "trim",
              "detail",
            ],
          },
          quantity: { type: "integer" },
          widthIn: { type: "number" },
          heightIn: { type: "number" },
          notes: { type: "string" },
          location: { type: "string" },
          cutNotes: { type: "string" },
          massId: { type: "string", description: "The id of the mass this part belongs to." },
        },

      },
    },
    openings: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "face",
          "kind",
          "label",
          "xIn",
          "yIn",
          "widthIn",
          "heightIn",
          "paneCols",
          "paneRows",
          "trimNote",
          "massId",
          "shape",
          "archRiseIn",
          "recessIn",
          "repeatCount",
          "repeatSpacingIn",
          "angleDeg",
        ],
        properties: {
          face: { type: "string", enum: ["front", "back", "left", "right"] },
          kind: { type: "string", enum: ["window", "door"] },
          label: { type: "string" },
          xIn: { type: "number" },
          yIn: { type: "number" },
          widthIn: { type: "number" },
          heightIn: { type: "number" },
          paneCols: { type: "integer" },
          paneRows: { type: "integer" },
          trimNote: { type: "string" },
          massId: { type: "string" },
          shape: {
            type: "string",
            enum: ["rectangle", "round-arch", "pointed-arch", "horseshoe-arch", "circle"],
          },
          archRiseIn: { type: "number", description: "0 for a rectangle." },
          recessIn: { type: "number" },
          repeatCount: { type: "integer", description: "1 for a single opening; number of bays for an arcade." },
          repeatSpacingIn: { type: "number", description: "0 unless repeatCount > 1." },
          angleDeg: { type: "number", description: "Cylinder masses only; 0 otherwise." },
        },

      },
    },
    detailElements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "location", "materials", "howToMake"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          materials: { type: "string" },
          howToMake: { type: "array", items: { type: "string" } },
        },
      },
    },
    assemblyStages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "goal", "tools", "parts", "steps", "check"],
        properties: {
          title: { type: "string" },
          goal: { type: "string" },
          tools: { type: "array", items: { type: "string" } },
          parts: { type: "array", items: { type: "string" } },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["instruction", "detail", "tip"],
              properties: {
                instruction: { type: "string" },
                detail: { type: "string" },
                tip: { type: "string" },
              },
            },
          },
          check: { type: "string" },
        },
      },
    },
    paintPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "color", "colorMatch", "technique"],
        properties: {
          area: { type: "string" },
          color: { type: "string" },
          colorMatch: { type: "string" },
          technique: { type: "string" },
        },
      },
    },
    glossary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition"],
        properties: { term: { type: "string" }, definition: { type: "string" } },
      },
    },
    toolsNeeded: { type: "array", items: { type: "string" } },
    suppliesNeeded: { type: "array", items: { type: "string" } },
    safetyNotes: { type: "array", items: { type: "string" } },
    assemblySteps: { type: "array", items: { type: "string" } },
    finishingSteps: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    extraMaterials: { type: "array", items: { type: "string" } },
  },
} as const;

/** Plain-text summary of a generated plan's geometry, for the review pass. */
export function summarizeGeometry(model: {
  subject: string;
  style: string;
  overall: { widthIn: number; depthIn: number; heightIn: number; wallHeightIn: number };
  masses: Array<{
    id: string;
    name: string;
    kind: string;
    widthIn: number;
    depthIn: number;
    diameterIn: number;
    heightIn: number;
    xIn: number;
    zIn: number;
    top: { type: string; riseIn: number };
  }>;
  openings: Array<{
    label?: string;
    kind: string;
    shape?: string;
    face: string;
    widthIn: number;
    heightIn: number;
    repeatCount?: number;
    massId?: string;
  }>;
  features: Array<{ name: string; type: string; count: number; massId: string }>;
}) {
  const lines: string[] = [
    `Subject: ${model.subject} (${model.style})`,
    `Overall bounding box: ${Math.round(model.overall.widthIn)} wide x ${Math.round(
      model.overall.depthIn,
    )} deep x ${Math.round(model.overall.heightIn)} high (inches); walls to ${Math.round(
      model.overall.wallHeightIn,
    )}.`,
    `Masses (${model.masses.length}):`,
    ...model.masses.map(
      (m) =>
        `- ${m.name} [${m.id}]: ${m.kind}${
          m.kind === "cylinder"
            ? ` diameter ${Math.round(m.diameterIn)}`
            : ` ${Math.round(m.widthIn)} x ${Math.round(m.depthIn)}`
        }, wall height ${Math.round(m.heightIn)}, centred at x=${Math.round(m.xIn)} z=${Math.round(
          m.zIn,
        )}, top ${m.top.type} rise ${Math.round(m.top.riseIn)}.`,
    ),
    `Openings (${model.openings.length} entries):`,
    ...model.openings.map(
      (o) =>
        `- ${o.label || o.kind}: ${o.shape ?? "rectangle"} ${o.kind}, ${Math.round(
          o.widthIn,
        )} x ${Math.round(o.heightIn)} on the ${o.face} of ${o.massId || "main mass"}${
          (o.repeatCount ?? 1) > 1 ? `, repeated ${o.repeatCount} times` : ""
        }.`,
    ),
    `Features (${model.features.length}):`,
    ...model.features.map((f) => `- ${f.name}: ${f.type} x${f.count} on ${f.massId}.`),
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Detail pass: refine ONE mass into faithful sub-shapes               */
/* ------------------------------------------------------------------ */

export type DetailLevel = "simple" | "standard" | "museum";

/** How many masses get their own detail pass, and how much detail to ask for. */
export const DETAIL_BUDGET: Record<
  DetailLevel,
  { massPasses: number; subMasses: string; note: string }
> = {
  simple: { massPasses: 0, subMasses: "0-2", note: "Keep it easy to cut: big shapes only." },
  standard: {
    massPasses: 3,
    subMasses: "2-6",
    note: "Add the shapes a viewer would notice from a few feet away.",
  },
  museum: {
    massPasses: 6,
    subMasses: "4-12",
    note: "Reproduce every distinct profile, cap, arcade and moulding you can see.",
  },
};

export const DETAIL_SYSTEM_PROMPT = `You are an architectural pattern-maker refining ONE volume of a miniature plan so it
matches the photographs instead of being a plain box.

You are given the photographs of the whole subject, the plan's current geometry, and the one mass to refine. Return only
extra geometry for THAT mass: child sub-masses, openings and surface features.

Rules:
- All dimensions are real-world INCHES, in the same coordinate system as the plan you were given: xIn across and zIn
  front-to-back are measured from the centre of the WHOLE subject; baseYIn is height above the ground.
- Every sub-mass must set parentId to the mass id you are refining, and must sit inside or on that mass — never float.
- Use the right kind for the real shape: swept for domes, turret caps, columns, balusters, urns and finials (give the
  profile points); extruded for cornices, string courses, sills and ridge caps; arch-block for a run of arches; prism for
  polygonal lanterns; tapered for battered or splayed sections.
- openings you add are measured from the LEFT edge of THIS mass's face (xIn) and from this mass's base (yIn), with massId
  set to this mass. Use repeatCount/repeatSpacingIn for arcades rather than listing every bay.
- features are surface bands and repeats (string courses, cornices, banding, buttresses, columns, balustrades, steps).
- Do not repeat geometry the plan already has. Do not restate the whole plan. Never invent detail you cannot see; if a
  face is hidden, mirror the matching visible face and say so in notes.`;

export function buildDetailPrompt(input: {
  massSummary: string;
  geometrySummary: string;
  structureNotes: string;
  level: DetailLevel;
}) {
  const budget = DETAIL_BUDGET[input.level];
  return [
    `Refine this mass so the finished wooden model reads like the photographs:\n${input.massSummary}`,
    `Current plan geometry (do not duplicate any of it):\n${input.geometrySummary}`,
    input.structureNotes.trim()
      ? `Structural reading of the photographs:\n${input.structureNotes.trim()}`
      : "",
    `Detail level: ${input.level}. Return ${budget.subMasses} sub-masses. ${budget.note}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const detailJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["masses", "openings", "features", "notes"],
  properties: {
    masses: planJsonSchema.properties.masses,
    openings: planJsonSchema.properties.openings,
    features: planJsonSchema.properties.features,
    notes: {
      type: "string",
      description: "One or two sentences on what was added and anything mirrored or guessed.",
    },
  },
} as const;

/** One-mass description for the detail pass. */
export function summarizeMass(m: {
  id: string;
  name: string;
  kind: string;
  widthIn: number;
  depthIn: number;
  diameterIn: number;
  heightIn: number;
  xIn: number;
  zIn: number;
  baseYIn: number;
  top: { type: string; riseIn: number };
}) {
  const round = m.kind === "cylinder" || m.kind === "swept";
  return [
    `Mass id: ${m.id}`,
    `Name: ${m.name}`,
    `Kind: ${m.kind}`,
    round
      ? `Diameter: ${Math.round(m.diameterIn)} in`
      : `Footprint: ${Math.round(m.widthIn)} x ${Math.round(m.depthIn)} in`,
    `Wall height: ${Math.round(m.heightIn)} in, base at ${Math.round(m.baseYIn)} in`,
    `Centred at x=${Math.round(m.xIn)}, z=${Math.round(m.zIn)}`,
    `Top: ${m.top.type}, rise ${Math.round(m.top.riseIn)} in`,
  ].join("\n");
}

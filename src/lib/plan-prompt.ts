/** Prompt + strict JSON schema for photo -> real-world building model extraction. */

export const PLAN_SYSTEM_PROMPT = `You are an architectural measurer and pattern-maker who writes miniature woodworking plans for
COMPLETE BEGINNERS. You are given photographs of a real building or object. Estimate its REAL-WORLD dimensions in INCHES
and break it down into flat wooden panels and detail pieces that a hobbyist can cut on a scroll saw or laser and glue together.

The reader has never built anything before and has NO other reference than your plan. They cannot see the photo while
building. Therefore: describe everything. Never say "as shown in the photo", "as needed", "to taste", or "standard practice".
Every instruction must be explicit, ordered, and measurable.

Rules:
- All dimensions are real-world inches (not model inches, never feet, never metric). A typical 2-story house is ~240 in tall.
- Use visible human-scale references (door ~80 in tall, story height ~108 in, standard brick course, car, step riser) to calibrate.
- overall.heightIn is the total height including roof. overall.wallHeightIn is the height to the top of the side walls
  (equal to heightIn for a flat-roofed subject).
- parts must be a COMPLETE, buildable panel breakdown: front wall, back wall, two side walls, gable ends, floors between
  stories, interior partitions where visible, a base, every roof plane, porch decks/posts/railings, chimney, steps, dormers,
  plus trim and detail pieces. Aim for 12-30 distinct parts on a house-like subject. widthIn/heightIn are the flat panel's
  real-world face dimensions. Provide realistic quantities.
- Each part also needs: cutNotes (how to cut it, grain direction, which openings to cut out of it, any bevel or angle in
  degrees), and a location (plain-language where it goes on the finished model).
- openings place every visible window and door on its face, measured from that face's LEFT edge (xIn) and from the
  GROUND (yIn) to the bottom of the opening. Give each opening a short label ("first-floor left window"), a pane grid
  (paneCols x paneRows, use 1x1 for a plain pane or a door), and a trimNote describing casing/sill/shutters and their sizes.
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
}) {
  const count = input.photoCount ?? 1;
  const lines = [
    count > 1
      ? `Analyze all ${count} reference photographs below. They are ${count} views of ONE subject, labelled "Reference photo 1..${count}". Combine every view into a single consistent set of real-world dimensions.`
      : "Analyze this photograph of one subject and produce the structured plan.",
  ];
  if (input.subjectNotes.trim()) lines.push(`Builder notes about the subject: ${input.subjectNotes.trim()}`);
  if (input.referenceNote.trim())
    lines.push(
      `Known real-world reference dimension (calibrate everything to this): ${input.referenceNote.trim()}`,
    );
  else lines.push("No reference dimension was given — calibrate from typical human-scale features and say so in assumptions.");
  lines.push(
    "Write for a complete beginner with no woodworking experience who cannot see the photo. Be exhaustive: full panel breakdown, every detail element, stage-by-stage instructions with per-step detail paragraphs, colour plan, tools, supplies, glossary and safety notes.",
  );
  return lines.join("\n");
}


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
    parts: {
      type: "array",
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
        },
      },
    },
    openings: {
      type: "array",
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

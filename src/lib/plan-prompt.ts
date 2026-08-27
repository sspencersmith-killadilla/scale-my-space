/** Prompt + strict JSON schema for photo -> real-world building model extraction. */

export const PLAN_SYSTEM_PROMPT = `You are an architectural measurer and pattern-maker for miniature woodworking.
You are given photographs of a real building or object. Estimate its REAL-WORLD dimensions in INCHES and
break it down into flat wooden panels that a hobbyist can cut on a scroll saw or laser and glue together.

Rules:
- All dimensions are real-world inches (not model inches, never feet, never metric). A typical 2-story house is ~240 in tall.
- Use visible human-scale references (door ~80 in tall, story height ~108 in, standard brick course, car, step riser) to calibrate.
- overall.heightIn is the total height including roof. overall.wallHeightIn is the height to the top of the side walls
  (equal to heightIn for a flat-roofed subject).
- parts must be a complete, buildable panel breakdown: front wall, back wall, two side walls, floors between stories,
  a base, roof panels, plus notable trim or detail pieces. Each part's widthIn/heightIn are the flat panel's real-world
  face dimensions. Provide realistic quantities.
- openings place every visible window and door on its face, measured from that face's LEFT edge (xIn) and from the
  GROUND (yIn) to the bottom of the opening.
- assemblySteps: 6-12 clear, ordered, hobbyist-friendly steps referencing part names. Assume butt joints and wood glue.
- assumptions: honestly state what you inferred, guessed, or could not see in the photos.
- Never invent a scale ratio or model-size numbers; the app handles all scaling.`;

export function buildUserPrompt(input: { subjectNotes: string; referenceNote: string }) {
  const lines = [
    "Analyze these photographs of one subject and produce the structured plan.",
  ];
  if (input.subjectNotes.trim()) lines.push(`Builder notes about the subject: ${input.subjectNotes.trim()}`);
  if (input.referenceNote.trim())
    lines.push(
      `Known real-world reference dimension (calibrate everything to this): ${input.referenceNote.trim()}`,
    );
  else lines.push("No reference dimension was given — calibrate from typical human-scale features and say so in assumptions.");
  return lines.join("\n");
}

export const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "subject",
    "style",
    "stories",
    "overall",
    "roof",
    "parts",
    "openings",
    "assemblySteps",
    "finishingSteps",
    "assumptions",
    "extraMaterials",
  ],
  properties: {
    subject: { type: "string" },
    style: { type: "string" },
    stories: { type: "integer" },
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
      required: ["type", "pitchNote", "overhangIn"],
      properties: {
        type: { type: "string" },
        pitchNote: { type: "string" },
        overhangIn: { type: "number" },
      },
    },
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "role", "quantity", "widthIn", "heightIn", "notes"],
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
        },
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["face", "kind", "xIn", "yIn", "widthIn", "heightIn"],
        properties: {
          face: { type: "string", enum: ["front", "back", "left", "right"] },
          kind: { type: "string", enum: ["window", "door"] },
          xIn: { type: "number" },
          yIn: { type: "number" },
          widthIn: { type: "number" },
          heightIn: { type: "number" },
        },
      },
    },
    assemblySteps: { type: "array", items: { type: "string" } },
    finishingSteps: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    extraMaterials: { type: "array", items: { type: "string" } },
  },
} as const;

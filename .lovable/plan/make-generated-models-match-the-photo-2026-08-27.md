# Make generated models match the photo

The render is a plain box because that is all the plan format can express. Today a plan has one width/depth/height, a flat-or-gable roof, and rectangular windows. Your photo is a fortress wall with two round towers, crenellated tops, an arcaded gallery of repeated arches, and a pointed arch gateway — none of which the current format can hold, so the AI's detail all lands in prose while the geometry collapses to a single rectangle.

The fix is to let a plan describe *shapes*, and make the drawings, cut list and 3D preview read from those shapes.

## 1. Describe the subject as massing, not one box

Add a `masses` list to the plan: each mass is a block or a cylinder with its own size, position, rotation, and top treatment.

- block (wall, wing, tower base) — width, depth, height, x/z position
- cylinder (round tower, column, turret) — diameter, height, position
- top treatment per mass: flat, gable, hip, shed, dome, cone, or crenellated parapet (with merlon width/gap/height)

A house then becomes one block plus a gable; your palace becomes a long block with a crenellated parapet, two cylinders in front, and a recessed gate block. `overall` stays as the bounding envelope so scaling, target-height and the existing UI keep working.

## 2. Real opening shapes and repeats

Openings gain a `shape` (rectangle, round arch, pointed/horseshoe arch, circular) plus `archRiseIn`, a recess depth, and an optional `repeat` (count and spacing) so an arcade of 12 identical arches is one entry rather than twelve guesses. Openings can also be attached to a named mass instead of only front/back/left/right.

## 3. Surface and profile features

A `features` list for things that are geometry, not panels: crenellation courses, string courses / cornice bands, buttresses, stone-course banding, steps, chimneys, balustrades. Each carries its real-world size so it can be both drawn and turned into cut parts.

## 4. Two-pass photo analysis

Accuracy also fails upstream. Instead of one call, generation runs two:

1. **Read the subject** — the model looks at every photo and writes a plain structural description: how many masses, their shapes and rough proportions, tower count and roundness, arch counts, courses, what is hidden. It also names its calibration reference.
2. **Measure and lay out** — a second call takes that description plus the photos and fills in the strict numeric schema (masses, openings, features, parts, stages).

Splitting reading from measuring stops the model from flattening an unusual subject into the nearest house-shaped template, and it gets validated: if masses do not fit inside `overall`, or an opening falls off its mass, the plan is repaired/rejected rather than shown.

## 5. Make every output read the geometry

- **3D preview**: renders each mass (box or cylinder), applies top treatments (cones, domes, crenellated parapets), and cuts arched/recessed openings, so the preview looks like the subject.
- **Elevations**: drawn per mass with arch profiles and repeated arcades.
- **Cutting layout & cut list**: cylinders become laminated stacked rings or a wrapped skin with a template ring, crenellations become a strip with notches, arches become panel cut-outs — each with its own cut instructions.
- **PDF**: same sections, plus the new geometry pages.
- **Step-by-step**: stages ordered by mass (core block, towers, parapets, gate, details).

## 6. Verify against the photo

After generation, a check renders the 3D preview and asks the model to compare it against the reference photos on a few concrete points (mass count, tower shape, arch count, roof/parapet type). Mismatches surface in the plan as a short "known differences" note, and a one-click "refine" re-runs pass 2 with those corrections.

## Technical notes

- `src/lib/plan-prompt.ts`: split into a read-pass prompt and a measure-pass prompt; extend `planJsonSchema` with `masses`, `features`, and richer `openings`; keep `strict: true`.
- `src/lib/plan-model.ts`: new `PlanMass`, `PlanFeature`, extended `PlanOpening`; normalizer defaults a single block mass from `overall` so existing saved plans still render.
- `src/lib/plans.functions.ts`: two sequential gateway calls (read → measure), streamed, then geometry validation before insert; keeps the same auth/middleware boundary and error handling.
- `src/components/PlanPreview3D.tsx`: rewrite around a mass renderer (`Box`/`Cylinder`/extruded gable) with treatment and opening sub-components; arch cut-outs via `THREE.Shape` holes.
- `src/components/Elevation.tsx`, `PanelLayout.tsx`, `src/lib/plan-pdf.ts`, `projects.$id.tsx`: consume masses/features; add cylinder-ring and crenellation-strip part generation.
- Existing plans keep working through the compatibility default; redrafting a project regenerates it with the new pipeline.

# Better likeness, and plans a first-time builder can follow

Two goals: the model should look more like the photo, and someone who has never built anything should be able to finish it from the plans alone.

## Part A — Look more like the photo

1. **Photo tagging before generation.** On upload, ask the builder to mark each photo: front / side / back / corner / close-up, and to tap two points on a known object (a door, a car) and type its real size. This gives the AI fixed views and a real scale reference instead of guessing.
2. **Side-by-side review by picture, not text.** Render the 3D preview from the same angle as each tagged photo and have the AI compare the two images directly. It lists concrete mismatches (wrong tower count, roof too flat, missing arches) and only those parts get redrafted. Up to 2 rounds; keep the best one.
3. **Close-up crops for detail.** Cut each photo into enlarged sections so small features (window grids, trim, arches) are seen at usable size during the detail step.
4. **"Fix this" by pointing.** In the 3D view the builder can click a part, say what is wrong ("roof should be steeper", "add a chimney here"), and only that part is regenerated.
5. **Likeness score.** Show a simple checklist on the plan (overall shape, roof, towers, openings, trim) marked matches / close / differs, with the photo and render side by side.

## Part B — Plans a novice can understand

1. **Beginner mode (default).** Simplifies joints to glued butt joints, rounds sizes to easy marks (1/16"), merges tiny parts, and swaps hard shapes for approachable ones (e.g. a round tower becomes a cardboard tube or stacked rings, with the reason explained).
2. **Picture for every step.** Each assembly step gets its own small 3D snapshot showing only the parts added so far, the new parts highlighted, and an arrow for where they go.
3. **Parts labeled everywhere.** Every part gets a short code (A1, A2, B1…) that appears on the cut sheet, the drawings, the step pictures and a printable sticker sheet to tape onto cut pieces.
4. **Full-size templates.** Printable 1:1 pages for any curved, angled or arched piece — trace onto wood and cut — with a 1" test square to check printer scale.
5. **Plain-language steps.** Every step follows one format: what you need (parts + tools), what to do (short numbered actions), how to check it's right (e.g. "corner should be square — check with a card"), and common mistake. Terms like "kerf" or "rabbet" get a tap-to-explain definition.
6. **Before-you-start pages.** Shopping list with quantities and stock sizes, tool list with cheap alternatives, a 1-page "how to cut safely and glue square" primer, and a time estimate per stage.
7. **Build checklist.** In the app, steps can be ticked off so progress is saved; the PDF gets checkboxes.

## Suggested order

1. Part labels + step pictures + plain-language step format (biggest win for novices)
2. Full-size templates + beginner mode
3. Picture-based review + photo tagging (biggest win for likeness)
4. Close-up crops, point-to-fix, likeness score, build checklist

## Technical notes

- Photo tags and scale points stored on project images (new columns); passed into read/measure prompts.
- Headless render of `PlanPreview3D` per tagged view (server-side or client capture uploaded to storage) feeding a new image-compare review pass; per-mass redraft reuses `detailMass`.
- Part codes assigned deterministically in `plan-model.ts`; step snapshots rendered client-side from cumulative stage parts and embedded into `plan-pdf.ts`.
- Beginner mode is a post-processing transform in `plan-model.ts` plus prompt guidance; no extra AI cost.
- Step schema gains `needs`, `actions`, `check`, `pitfall`; glossary linking in UI.
- More review rounds mean longer generation and more AI credits; capped and tied to the detail level.

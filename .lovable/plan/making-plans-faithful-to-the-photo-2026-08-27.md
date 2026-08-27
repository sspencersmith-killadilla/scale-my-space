# Making plans faithful to the photo

The models still come out chunky for one reason: the plan format can only describe two shapes (a rectangular block and a cylinder), the AI gets one pass at the whole subject at once, and the accuracy check reads a *text summary* of the geometry rather than looking at the rendered result. Any subject that isn't box-and-tube gets rounded down to boxes and tubes.

Four changes, in order of impact.

## 1. A richer shape vocabulary

Add mass kinds beyond block/cylinder:

- tapered block (battered walls, spires, plinths)
- prism / polygon mass (octagonal towers, bays) with side count
- arch block (an arcade wall as a single mass with pierced bays)
- swept profile (revolved silhouette for domes, turret caps, balusters, columns, urns)
- extruded profile (a drawn cross-section pushed along a length: cornices, mouldings, sills, string courses, ridge caps)

Profiles are given as a short list of points in inches, so the AI can describe a curve or a stepped cornice instead of picking the nearest preset. Each mass also gets an optional `parentId` so a subject can be described hierarchically (tower → tower shaft → tower cap → tower corbel band), which is how buildings actually read, and lets small parts sit accurately on big ones.

Mass count limits go up (roughly 6 → 40) with feature counts raised to match, so detail lives in geometry rather than in prose.

## 2. Detail passes per mass, not one pass for the whole subject

Generation becomes: read → measure the massing → **detail each major mass in its own call** → assemble → review. The detail pass looks only at the photos and one mass ("the left round tower") and returns its sub-masses, opening arcade, courses and cap profile. A per-mass call has room to be specific, where a whole-subject call spends its budget on the outline.

To help those calls, the server crops and up-samples the photos around each mass (a fixed 2×2/3×3 tile set plus per-mass crop hints) so the model sees the arches at usable resolution instead of a 40-pixel band in a wide shot.

## 3. Visual review loop — compare renders, not text

Replace the text-summary review with an actual image comparison:

1. Render the generated geometry offscreen from the same viewpoints as the photos (the existing 3D renderer, run headless server-side into PNGs).
2. Send render + photo pairs to the model and ask for concrete mismatches (mass count, tower cross-section, arch count and shape, cap type, proportions, missing courses).
3. Feed the mismatch list into a targeted redraft — of *only* the masses named, not the whole plan — and repeat up to a small fixed number of rounds, keeping the best-scoring draft.

This is the change that stops "faithful enough" self-assessments: the model is graded on what the model actually looks like.

## 4. Faithfulness controls and honesty in the UI

- A **detail level** control on the project (Simple / Standard / Museum) that sets the mass/feature budget and number of detail+review rounds, since higher fidelity means more parts and a harder build.
- A **fidelity report** on the plan: per-item comparison (masses, towers, arches, roof/parapet, courses), side-by-side render vs photo, plus the remaining known differences, and a per-mass "refine this" button that re-runs one detail pass.
- Cut list and instructions grow with the geometry: swept/extruded profiles become template-and-scrape or stacked-lamination parts with a printable full-size profile template page; polygon towers get bevel angles; arcade walls get a drilling/coping sequence.

## Technical notes

- `src/lib/plan-model.ts`: new mass kinds (`tapered`, `prism`, `arch-block`, `swept`, `extruded`), `profile: {xIn,yIn}[]`, `parentId`, `sides`, `topDiameterIn`; `massBounds`/`ensureMasses` handle hierarchy; `derivedGeometryParts` gains profile-template, polygon-bevel and arcade parts.
- `src/lib/plan-prompt.ts`: split into read → massing → per-mass detail → visual-review prompts; raise array caps; keep `strict: true` schemas; add a profile-points schema.
- `src/lib/plans.functions.ts`: orchestrates the extra calls sequentially with bounded rounds, per-mass crops, best-draft selection; unchanged auth boundary and gateway error handling.
- Photo tiling done server-side with the existing storage download path (no new deps needed for crops if done via canvas-free slicing; otherwise a small pure-JS image lib).
- `src/components/PlanPreview3D.tsx`: shape renderers for prism/tapered/lathe/extrude via `THREE.LatheGeometry`, `ExtrudeGeometry`, `CylinderGeometry` with side counts; hierarchy grouping.
- `src/components/Elevation.tsx`, `src/lib/plan-pdf.ts`: project the new shapes; add full-size profile template pages.
- `projects.$id.tsx` / `projects.new.tsx`: detail-level control, fidelity report tab, per-mass refine.

Note on cost: each project will make several AI calls instead of three, so generation takes longer and uses more credits — the detail-level control keeps that in the user's hands.

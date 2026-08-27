# Verifying the engine on a complex building

I have not yet proven the new pipeline on a complex subject — nothing in this session ran a real generation. So the honest answer is: unverified. Here is how to verify it, in two stages, cheapest first.

## Stage 1 — Offline geometry harness (no AI credits)

Hand-write a "hard case" plan JSON that mimics a fortress like the Aljafería: a long block wall with a crenellated parapet, two round towers with conical caps, an octagonal prism lantern, an arcade wall with 12 pointed-arch bays, a cornice moulding run, a tapered plinth, and a pointed-arch gateway — plus a couple of deliberately bad entries (a sub-mass floating off its parent, an opening wider than its face).

Then check every consumer reads it:

- `normalizePlanModel` keeps all masses, nests children, and grows `overall` to the real bounding box; the bad entries get repaired or dropped rather than crashing.
- Cut list produces parts for every mass kind (faceted tower bevels, lathe blanks + profile template, moulding runs, arcade templates, crenellation strip) with no zero/NaN dimensions.
- Elevations and panel layout draw all masses (no missing shapes, nothing off-sheet).
- 3D preview mounts and renders each kind without a Three.js error.
- PDF pack generates end-to-end with the volume schedule, opening schedule and template pages.

Verification is by rendering the harness plan in the running app (browser-driven screenshots of the 3D preview, elevations and the generated PDF) — not by reading code.

## Stage 2 — One real end-to-end generation

Create a project from the Aljafería photos at Museum detail and record what actually comes back:

- Does the read pass name the correct massing (wall + N round towers + arcade + parapet)?
- Do the numbers survive the strict schema (no 400s), and does the review pass fire a redraft?
- Do the per-mass detail passes return usable sub-geometry, or get dropped by the sanity filter?
- Does the render look like the photo: tower count and roundness, arch count, cap type, parapet?
- Wall-clock time and number of gateway calls at each detail level.

Result goes into a short written comparison (render vs photo, item by item) so "faithful" is a measured claim.

## What Stage 1 is likely to expose

Two weak points I can see in the current code without running it:

- The detail-pass merge filter only rejects sub-masses by absolute span; it does not check that a child actually sits within its parent, so a mis-measured detail can float or spear through a tower.
- Array sizes in the strict schema are uncapped, so a Museum-level plan can return far more masses than the cut list and layout pages were designed to paginate.

Fixes for whatever the harness finds are follow-up work, sized once the failures are real rather than guessed.

## Technical notes

- Harness lives as a dev-only fixture (`src/lib/__fixtures__/complex-plan.ts`) plus a small vitest run over `normalizePlanModel`, `derivedGeometryParts` and the PDF builder; visual checks via Playwright against localhost.
- Stage 2 uses the existing `generatePlan` server function unchanged — no engine edits before the results are in.

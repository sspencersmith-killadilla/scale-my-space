# Fix "Failed to fetch" during plan generation

"Failed to fetch" is not an AI error — it means the browser's request to the server never came back. Right now the whole generation runs inside one request: read the photos, measure, review, redraft, then up to six per-mass detail passes, each one re-sending all six photos to the model. At Museum detail that is 10+ model calls in a single HTTP request, which runs for several minutes and the connection is dropped before it finishes. The 400 fix from last time worked; this is the next wall.

Note on the diagnosis: the failing run happened on the preview deployment, whose server logs are not in this sandbox, so the timeout is inferred from the pipeline's shape (single request, many sequential multi-minute model calls) rather than read from a log line. Step 1 below confirms it before the rest lands.

## Steps

1. **Confirm the stall point.** Log a timestamped line at the start and end of each pass, then run one Museum generation on the six house photos and read the server logs to see how far it got and how long each pass took.
2. **Split generation into short stages.** Replace the single `generatePlan` call with stages the page runs one after another, each a separate short request:
   - Stage A: read the photos and draft the plan (read + measure), save it as version 1.
   - Stage B: review and redraft once if needed, saving the result.
   - Stage C: one request per detail mass, run a few at a time.
   Each stage saves its result to the database, so nothing is lost if a later stage fails.
3. **Shrink each request.** Downscale the inlined photos to a sane max edge before sending, and pass fewer photos to the detail passes (they only need the views that show the mass). Smaller payloads mean faster passes and fewer timeouts.
4. **Show real progress and let the user stop.** The new-project screen gets a live stage list ("Reading photos", "Drafting", "Reviewing", "Detailing 3 of 6") instead of one spinner, and the plan is viewable as soon as Stage A finishes — detail keeps filling in.
5. **Make failure honest.** If a stage fails, the project keeps the best plan produced so far and shows a "Continue detailing" button rather than an error toast, and a network drop no longer strands the project in "generating".
6. **Verify.** Run a full Museum generation on the six house photos end to end and confirm the plan viewer shows masses, elevations, cut list, and that no stage exceeds the request budget.

## Technical notes

- `src/lib/plans.functions.ts` splits into `draftPlan`, `reviewPlan`, and `detailMass` server functions, all keeping `requireSupabaseAuth`. Each reads the current plan row, mutates it, and writes a new version (or updates the latest) so state lives in the database, not in a long-lived request.
- Photo inlining moves to a helper that decodes, downscales (max edge ~1280) and re-encodes before base64, cutting request bytes roughly 3-5x.
- `src/routes/_authenticated/projects.new.tsx` drives the stage sequence with `useServerFn` calls and stage state; the redraft flow in `projects.$id.tsx` reuses the same stage runner.
- Projects gain a stage marker in `status` (or a `generation_stage` column) so a resumed run knows where to pick up.

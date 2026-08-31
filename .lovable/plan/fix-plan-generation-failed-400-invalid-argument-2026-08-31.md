# Fix "Plan generation failed (400) — invalid argument"

The generator returned a raw upstream 400 ("Request contains an invalid argument"), so we don't yet know which of the four AI passes failed or why. The photos themselves are all normal JPG/PNG files between 250 KB and 640 KB, so payload size is unlikely to be the cause. The most likely suspect is the plan JSON schema: array item caps (`maxItems`) were added to the schema in the last change, and the strict structured-output validator upstream is picky about extra keywords. That is a suspicion, not a confirmed cause — step 1 confirms it before anything is "fixed".

## Steps

1. **Diagnose first.** Add pass labels and body-shape logging to the gateway helper so a failure says which pass failed (read / measure / review / detail) and echoes the upstream message. Then run one real generation with these photos and read the log.
2. **Fix the confirmed cause.** If it is the schema keywords, drop the unsupported ones (keeping array size limits enforced in the normalizer instead, which already trims runaway geometry). If it is instead an image or payload problem, downscale photos server-side before inlining and cap total request bytes.
3. **Make failures survivable.** Wrap each pass so an optional pass (review, detail) that 400s is skipped rather than killing the whole run, and the measure pass retries once with a relaxed schema. A partial plan is far better than an error toast.
4. **Make the error readable.** Replace the raw JSON toast with plain language plus which stage failed, and keep the project row out of a stuck `generating` state when a run aborts.
5. **Verify.** Re-run generation with the four house photos at Museum detail and confirm a plan is produced, then check the plan viewer renders masses, elevations and the cut list.

## Technical notes

- `src/lib/plan-gateway.ts`: add a `label` argument, log status + upstream body, classify 400s as terminal (no retry) per gateway error semantics, and expose the upstream message.
- `src/lib/plan-prompt.ts`: remove schema keywords the upstream validator rejects; keep the caps as constants used by the normalizer.
- `src/lib/plans.functions.ts`: per-pass try/catch, one relaxed-schema retry for the measure pass, and a `status: "failed"` update on the project when the run cannot produce a plan.
- Optional downscale: re-encode inlined photos to a max edge (~1600 px) before base64 to cut request size.

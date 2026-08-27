# Photo-to-Dollhouse Plans Generator

Upload photos of a real building or object, choose a scale, and get a printable woodworking plan pack you can save to your account.

## How it works for the user

1. **Sign in** (email + password) — projects are saved to the account.
2. **New project**: upload 1–6 photos (front, sides, angles), optionally add notes ("2-story Victorian, front porch") and one real-world reference dimension if known (e.g. "the door is 7 ft tall") to improve accuracy.
3. **Choose scale**: preset dollhouse scales (1:12, 1:24, 1:48, custom ratio) *or* a target size ("finished model 18 in tall"). Both modes offered; the app derives the other value and shows it.
4. **Choose materials**: stock thickness options (1/8", 1/4", 3/8", 1/2" plywood/basswood), so parts snap to real stock.
5. **Generate**: AI analyzes the photos and returns a structured model — overall real-world dimensions, a list of parts (walls, roof panels, floors, base, trim), openings (windows/doors) with positions, and assembly steps.
6. **Review the plan** in the browser:
   - Summary: real-world estimate, scale used, finished model size, material list.
   - Cut list table: part name, quantity, material/thickness, scaled length × width, notes.
   - 2D drawings: auto-generated SVG elevations and flat panel layouts with dimension callouts and window/door cutouts, drawn from the structured data.
   - Step-by-step assembly instructions, plus a glue-up/finishing section.
   - Editable fields: user can correct estimated dimensions and everything (cut list, drawings, PDF) recomputes.
7. **Download PDF pack**: cover page with the source photo, summary, cut list, drawing pages (printable at true scale where it fits, otherwise scaled with a printed scale bar), and instructions.
8. **Dashboard**: list of saved projects with thumbnails; open, regenerate at a different scale, or delete.

## Screens

- `/` — landing page explaining the concept, with a sample plan preview and sign-in call to action.
- `/auth` — sign in / sign up.
- `/projects` — saved projects dashboard (protected).
- `/projects/new` — upload + scale + material wizard (protected).
- `/projects/$id` — generated plan viewer with edit controls and PDF download (protected).

## Technical approach

- **Backend**: Lovable Cloud (database, auth, file storage for photos and generated PDFs).
- **Tables**: `projects` (owner, title, scale mode, scale ratio/target height, material thickness, status), `project_images` (storage paths), `plans` (versioned JSON of the structured plan model + AI notes). RLS scoped to `auth.uid()` on all three, with explicit grants; private storage bucket with owner-scoped policies.
- **AI**: a server function sends the uploaded photos (as signed URLs / inlined base64) to a multimodal Lovable AI model with a strict JSON schema for the plan model: `realWorldDimensions`, `parts[]`, `openings[]`, `assemblySteps[]`, `assumptions[]`. Scaling math (real → model dimensions, stock-thickness rounding, kerf note) runs deterministically in app code, not in the model, so the numbers are consistent and instantly recomputed when the user edits.
- **Drawings**: generated client-side as SVG from the plan model (elevation per face + flat panel nesting), so they stay in sync with edits.
- **PDF**: built in the browser from the same plan model and SVGs (pdf-lib + svg rendering), giving a multi-page printable pack saved to storage and downloadable.
- **Honesty about accuracy**: every plan shows an "assumptions & estimates" panel — photo-derived dimensions are approximations, and the user is prompted to supply one known reference dimension for better results.

## Build order

1. Design directions for the look and feel, then the landing page.
2. Lovable Cloud: auth, schema, storage.
3. Upload wizard + scale/material math with live preview of finished size.
4. AI plan generation server function with structured output.
5. Plan viewer: summary, cut list, SVG drawings, instructions, edit-and-recompute.
6. PDF export pack.
7. Projects dashboard, regenerate-at-new-scale, delete.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Part codes (A1, B2…) are derived deterministically from part order and role in `assignPartCodes`; never store them, so every sheet agrees.
- Per-device builder state (beginner toggle, ticked steps) lives in localStorage keyed by project id; no schema needed.

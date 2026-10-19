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

## Architecture rules
- All backend calls go through `api` from `frontend/src/lib/api` (contract in `types.ts`); UI never imports mock or http directly — so the user's own FastAPI backend can replace the mock by setting `VITE_API_BASE_URL`.
- `frontend/src/lib/api/http.ts` is the REST endpoint map the external backend must implement; keep it in sync with `KezekApi` when adding calls.
- No Lovable Cloud: the user is building the backend themselves.

## Repository layout
- `frontend/` contains the existing frontend application and its package/configuration files. Run npm commands from this directory, or use `npm --prefix frontend` from the repository root.
- `backend/` is reserved for the backend implementation.
- `docs/` contains project documentation, including `plan.md` and `spec.md`.

# Architecture and delivery decisions

## 2026-10-20 — Preserve the existing application and selected stack

Use the existing React/TypeScript/Vite/Tailwind/shadcn frontend and its TanStack Router/Start setup, plus FastAPI, SQLAlchemy 2.x, Alembic and SQLite for the new backend. Keeping TanStack routing is the documented deviation from the plan's reference to React Router; application directories remain in their existing locations.

The original `docs/spec.md` asks for a mock frontend. The current user instruction explicitly authorizes the full-stack MVP in `docs/plan.md`, so mocks remain development aids and cannot count as final backend implementation.

## 2026-10-20 — Local issue preparation before GitHub creation

The user will run the GitHub scripts from their authenticated WSL terminal. Preparing the backlog, scripts and offline tests locally before real issues exist is necessary for this explicitly requested workflow; no GitHub authentication is attempted here. Product implementation follows issue import and the backlog's dependency order.

Keep the existing 48 session-sized tasks and stable `KEZEK-NNN` identifiers. The Markdown backlog is reviewable and the JSON counterpart supplies exact issue contents. Import all issue states and all pages, match task markers or exact titles and save actual numbers incrementally. Do not assume task number 1 means GitHub issue 1.

## 2026-10-20 — Evidence-gated closure

Verification is explicit and initially pending for every MVP task. Only a task with all acceptance criteria checked, successful documented checks, hashed evidence and a recorded tested revision may be considered for closure. Later code, test or acceptance-definition changes invalidate that evidence; only evidence-related commits may follow without rerunning verification. Real live issue identity is checked before any issue is closed.

Outstanding product decisions remain in the backlog, including anonymous issuance recovery after a lost response, exact API reconciliation, overnight schedule behavior and configuration/assignment changes during active service. These are not silently treated as already implemented.

## 2026-10-20 — Approved direct GitHub operations supersede the manual fallback

Outside-sandbox GitHub CLI execution is now approved and authenticated as `dooloe`.
Use direct approved commands to create, inspect, comment on and close issues. The
earlier manual scripts are fallback artifacts and are not used for this workflow;
no additional manual scripts are generated. Record actual issue numbers and retain
all incomplete issues open. Task-specific verification and scoped commits govern
direct closure; unrelated pre-existing working-tree changes are not committed or
claimed as verified. Push normal commits only, preserving Lovable history.

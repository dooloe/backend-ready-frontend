# Implementation and verification record

## 2026-10-20 — Backlog and issue automation preparation

Scope: the user's requested initial step—inspect the project, prepare detailed MVP issues and provide scripts for their authenticated WSL terminal. No GitHub authentication, network issue management or application feature implementation was attempted in this step. The requested scripts are prepared before issue creation because the user will execute the import outside the sandbox.

Read `AGENTS.md`, `docs/plan.md`, `docs/spec.md`, `docs/architecture.md` and `_docs/tasks.md`. Inspected the existing package/configuration, API facade, REST adapter, local-storage session handling, customer/ticket/staff/admin routes and the two frontend test files.

Findings:

- `docs/spec.md` describes the original mock frontend request; the user's current full-stack instruction and `docs/plan.md` define the MVP now being planned.
- `backend/` contains only `.gitkeep`; no FastAPI implementation or database migrations exist.
- Frontend API calls use mocks unless `VITE_API_BASE_URL` is set. The HTTP adapter and types do not yet implement the plan's full endpoint contract, cookie sessions or organization model.
- Customer name fields, ID-based private ticket lookup, local-storage bearer sessions and three-second polling need deliberate integration changes.
- Existing tests exercise mock behavior and route matching; they do not prove persistence, backend authorization, SQLite concurrency or real browser integration.
- `frontend/src/routeTree.gen.ts` already had an unrelated modification before this work and was left untouched.

Prepared 48 tasks with three acceptance criteria each, dependency IDs, expected files, areas and priority. Added an empty actual-number map and a verification ledger in which every MVP task is pending. No task completion has been inferred from these planning changes.

Validation performed:

| Command | Actual result |
| --- | --- |
| `python3 -m unittest discover -s scripts/tests -v` | 12 automation tests passed; GitHub operations mocked and temporary repositories isolated |
| `bash -n scripts/create_issues.sh scripts/close_issues.sh` | Exit 0; both shell wrappers parse |
| `bash scripts/create_issues.sh` | Exit 0; offline preview lists 48 tasks without creating issues or writing the map |
| `bash scripts/close_issues.sh` | Exit 0; no verified tasks eligible; no GitHub calls |
| `npm --prefix frontend test` | 2 existing test files, 6 tests passed; this is a frontend baseline only |
| `git diff --check` | Exit 0 at initial verification; repeated after final edits |

Not verified: live GitHub issue creation/closure, clean full-stack setup, any backend requirement, real database concurrency or browser MVP acceptance. No real issue numbers or remote writes are claimed. Run the creation script in WSL and retain `docs/issue-map.json` before implementing application tasks; follow `docs/issue-automation.md` for evidence and closure.

## 2026-10-20 — Direct backlog publication

Re-read the plan, original specification and repository instructions and inspected
the current frontend types, HTTP facade, session storage and polling behavior.
The backend was still empty. The current user instruction replaces the manual
script workflow with approved direct CLI operations; the earlier entry remains
historical evidence of what was prepared before connectivity was available.

Approved outside-sandbox commands confirmed a public repository with ADMIN access
and no existing issues. Published issues #1–#48 directly using `gh issue create`,
all with `mvp`, task markers, goals, descriptions, dependencies, expected files and
three acceptance criteria. Queried all issues again and verified exactly 48 OPEN
issues with `mvp` and 144 criteria. Saved the returned actual numbers in
`docs/issue-map.json`; no issues were closed during publication.

Status after publication: completed 0, open 48, externally blocked 0. The next
implementation is #1 (empty FastAPI project and passing smoke test). No additional
manual management scripts were generated or invoked. Existing unrelated changes
in `frontend/src/routeTree.gen.ts` remain excluded from commits.

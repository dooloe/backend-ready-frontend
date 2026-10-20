# Project and GitHub issue audit — 2026-10-20

The current frontend-compatible demo passes its automated and live HTTP checks.
The full MVP in [plan.md](plan.md) is incomplete. All 52 GitHub issue bodies and
acceptance criteria were reviewed against the implementation. The original
organization/private-ticket/cookie-session backlog is broader than the later
current-client implementation issues #49–#52; overlapping functionality does not
meet every original criterion.

## Verification

| Check | Actual result |
| --- | --- |
| Backend Pytest, isolated SQLite databases | 72 passed; one existing Starlette/httpx deprecation warning |
| Frontend Vitest | 6 passed in two unchanged route/mock test files |
| Issue-management Python unit tests | 12 passed |
| Fresh frontend locked install in a temporary directory | 518 packages installed; exit 0 |
| Frontend lint | Initially 60 formatting errors; after scoped fixes, zero errors and seven existing warnings |
| Strict frontend typecheck | Added `npm run typecheck`; exit 0, strict settings unchanged |
| Production frontend build | Passed both default mock configuration and explicit real-API configuration |
| Live HTTP integration | All 20 operations exercised through the actual TypeScript HTTP adapter against FastAPI and temporary SQLite |
| Live rejection cases | Missing auth 401, bad login 401, staff/admin denial 403, unknown ticket 404, closed join/busy counter/cancel-called 409 |
| Frontend server smoke | All five page routes return HTTP 200; transformed API module contains the real backend URL |
| Browser interactions, accessibility and live PostgreSQL | Not verified; relevant issues remain open |

Live verification covered customer join → staff call → start → complete,
customer cancellation excluded from call-next, no-show, empty call-next, admin
configuration/staff CRUD supported by the client, analytics and 204 responses.
The two temporary server process groups were stopped after testing. Tests did
not use the development database. Full commands and evidence are in
[process.md](process.md) and [KEZEK-002.txt](verification-evidence/KEZEK-002.txt).

## Local checkout blockers

The checkout already had uncommitted deletions of `Makefile`, `README.md`,
`AGENTS.md`, `openapi.yaml` and `backend/.gitkeep`. They were excluded from the
audit fixes and commits while clarification was requested. In this working
tree, `make dev` is unavailable and the root API contract/documentation is
missing. Their committed versions still exist on GitHub. Backend tests can read
the committed OpenAPI snapshot, so their success does not resolve these missing
local files. Read-only review of committed AGENTS guidance preserved its rules.

Starting the frontend without `VITE_API_BASE_URL` still selects browser-local
mocks. Use the explicit command in [frontend development](../frontend/README.md)
with [the running backend](../backend/README.md) to exercise persistent data.
Schema setup uses SQLAlchemy `create_all`; there is no Alembic migration chain.
PostgreSQL DDL compilation passes, but live PostgreSQL support is unverified.

## Issue-by-issue decisions

Issue numbers below refer to
[dooloe/backend-ready-frontend](https://github.com/dooloe/backend-ready-frontend/issues).
“Open” means at least one acceptance criterion remains unimplemented or lacks
required evidence; it does not mean all work on that issue is absent.

| Issue | Decision | Verified implementation or remaining gap |
| --- | --- | --- |
| #1 | Keep closed | Original empty backend milestone was verified historically; current backend tests pass. |
| #2 | Closed | Fresh locked install, documented lint/typecheck/build/test commands and unchanged existing tests pass. Fixed formatting errors and added the missing typecheck script in d3d8455. |
| #3 | Open | Decisions/process exist; contributor docs are missing locally, committed root setup is stale, and chat-brainstorm documentation is absent. |
| #4 | Open | No agreed queue-scoped idempotency/lost-response recovery and hashed private-ticket-token design. |
| #5 | Open | Current-client OpenAPI exists in Git; future organization/daily queue/private-token contract and structured error examples do not. |
| #6 | Open | Current bearer contract lacks the planned logout/current-identity/CSRF/cookie and assigned-counter contract. |
| #7 | Open | Future administration contract lacks schedules, daily closure, staff assignment operations and date/duration analytics. |
| #8 | Open | No complete page/state contract for organization selection, private tokens and anonymous joins without customer names. |
| #9 | Open | Environment database/CORS/seed settings exist; contracted structured error envelopes are absent. |
| #10 | Open | SQLite FK/WAL/timeout/rollback/concurrency checks pass; Alembic initialization is absent. |
| #11 | Open | Configuration ORM and constraints exist; organization fields, organization ownership and assignment models are absent. |
| #12 | Open | Tickets, hashed bearer sessions and active-counter constraints exist; daily queues, events and private-token/idempotency constraints are absent. |
| #13 | Open | Persistent seed runs once; planned organization/timezone fixture and Argon2id criterion are unmet (current passwords use scrypt). |
| #14 | Open | Hashed expiring bearer sessions and login pass; inactive-user/current-identity/cookie criteria are unmet. |
| #15 | Open | Explicit bearer CORS works; planned cookie CSRF and server-side logout/revocation are absent. |
| #16 | Open | Anonymous and wrong-role denials pass; organization and staff-counter assignment checks are absent. |
| #17 | Open | No organization-local schedules, daily queue creation or manual daily closure model. |
| #18 | Open | Current service list works; organization directory, daily queue IDs and scheduled availability are absent. |
| #19 | Open | Atomic service-lifetime numbering passes; daily queues, private token hashes, events and idempotent retries are absent. |
| #20 | Open | ID-based view, position and estimates pass; required distinct hashed private-ticket-token access is absent. |
| #21 | Open | Waiting-only cancellation and call race tests pass; private-token ownership and cancellation events are absent. |
| #22 | Open | No public aggregate queue-status endpoint. |
| #23 | Open | Counter queue lookup works; server-side assigned-counter/organization filtering is absent. |
| #24 | Open | FIFO, busy/empty counter and atomic claims pass; authorization by assignment and ticket events are absent. |
| #25 | Open | Current lifecycle actions pass; completion still permits called → completed and no actor/events or wrong-counter/organization checks exist. |
| #26 | Open | Independent-process joins/calls, cancellation races and lock contention pass; same-key idempotency tests cannot pass without idempotent joins. |
| #27 | Open | Current service CRUD and history preservation pass; schedules, organization isolation and daily-queue edit semantics are absent. |
| #28 | Open | Counter CRUD and service links pass; organization checks and active-work configuration-change safeguards are incomplete. |
| #29 | Open | Staff creation and password hashing pass; staff editing/deactivation, assignment lifecycle and session revocation are absent. |
| #30 | Open | Service-level open/closed toggle exists; a scheduled daily-queue override does not. |
| #31 | Open | Current UTC timestamp counts/averages pass; local-date filtering, organization isolation and mean service duration are absent. |
| #32 | Open | Current typed bearer adapter passes all 20 live operations; future contract, cookie/CSRF/abort/structured-error integration is absent. |
| #33 | Open | Current service cards exist; organization selection, timezone hours and required real-data state component tests are absent. |
| #34 | Open | Current join works; it collects a name, uses an ID link and lacks idempotent uncertain-response recovery. |
| #35 | Open | Current ticket polling/cancellation work; polling continues every three seconds for terminal states, with no confirmation or required refresh/recovery tests. |
| #36 | Open | Bearer login/local storage exists; planned cookie identity, expiry recovery, logout revocation and protected-cache clearing are absent. |
| #37 | Open | Live staff actions work for the current contract; backend assignment isolation, strict planned transitions and component regression coverage are absent. |
| #38 | Open | Current service creation/open toggles exist; schedule forms and daily closure controls are absent. |
| #39 | Open | Current counter/service/assignment controls exist; organization options, active-work safeguards and component tests are absent. |
| #40 | Open | Staff creation exists; staff editing, deactivation and rejected active-work/assignment tests are absent. |
| #41 | Open | Current stats come from real data when configured; date filters, service-duration metrics and full error-state coverage are absent. |
| #42 | Open | Password and bearer hashes exist; private-ticket log/referrer protection and login/join rate limiting criteria are unmet. |
| #43 | Open | SQLite restart/seed/history tests pass; fresh Alembic migrations and event persistence cannot be verified. |
| #44 | Open | API/client lifecycle smoke passes; no required Playwright customer/staff workflows or migrated test database setup. |
| #45 | Open | API role rejection passes; no required admin/access-control browser workflow suite. |
| #46 | Open | No full mobile/keyboard/accessibility and loading/error/conflict workflow review; HTTP 200 is insufficient evidence. |
| #47 | Open | No CI workflow installing locked dependencies and running migrations/browser/schema checks. |
| #48 | Open | Current demo has passing checks; complete clean-clone MVP, migrations, browser workflow and delivery documentation remain incomplete. |
| #49 | Keep closed | Current-client contract verified against backend tests; file remains deleted only in this local working tree. |
| #50 | Keep closed | Current-contract backend behavior passes; its historical in-memory implementation was intentionally replaced by #52. |
| #51 | Keep closed | Committed Makefile startup/cleanup was verified previously; local deletion remains unresolved and was not committed. |
| #52 | Keep closed | SQLite persistence/restarts/constraints/independent-process concurrency pass; live PostgreSQL and future migrations are explicitly outside its scope. |

## Next implementation order

Resolve the local deleted-file intent, then complete contributor documentation
(#3). Settle retry/private-ticket/API/page contracts (#4–#8) before changing the
frontend-compatible API. Continue with configuration/migrations/models (#9–#12),
seed/auth/permissions/scheduling (#13–#17), transactional customer/staff features,
administration, frontend integration and finally browser/CI/delivery checks.

GitHub confirmed #2 closed after the verified commit was pushed. There are now
6 closed and 46 open issues. The other 46 open
issues retain their full acceptance criteria; none were closed on partial
coverage or merely because a related current-contract issue was finished.

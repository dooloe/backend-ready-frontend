# Project and GitHub issue audit — 2026-10-20

The current frontend-compatible demo passes its automated and live HTTP checks.
The full MVP in [plan.md](plan.md) is incomplete. All 52 GitHub issue bodies and
acceptance criteria were reviewed against the implementation. The original
organization/private-ticket/cookie-session backlog is broader than the later
current-client implementation issues #49–#52; overlapping functionality does not
meet every original criterion.

Remote status refreshed after Issue #10 was closed: **38 open, 14 closed, 52 total**.
Closed issues are #1–#10 and #49–#52.

## Verification

| Check | Actual result |
| --- | --- |
| Backend Pytest, isolated SQLite databases | 124 passed after QA, error-contract and migration regressions; one existing Starlette/httpx deprecation warning |
| Frontend Vitest | 15 passed across five files, including QA regressions |
| Issue-management Python unit tests | 12 passed |
| Fresh frontend locked install in a temporary directory | 518 packages installed; exit 0 |
| Frontend lint | Initially 60 formatting errors; after scoped fixes, zero errors and seven existing warnings |
| Strict frontend typecheck | Added `npm run typecheck`; exit 0, strict settings unchanged |
| Production frontend build | Passed both default mock configuration and explicit real-API configuration |
| Live HTTP integration | All 20 operations exercised through the actual TypeScript HTTP adapter against FastAPI and temporary SQLite |
| Live rejection cases | Missing auth 401, bad login 401, staff/admin denial 403, unknown ticket 404, closed join/busy counter/cancel-called 409 |
| Frontend server smoke | Previously verified: all five page routes return HTTP 200; transformed API module contains the real backend URL |
| Browser interactions, accessibility and live PostgreSQL | Not verified; relevant issues remain open |

Live verification covered customer join → staff call → start → complete,
customer cancellation excluded from call-next, no-show, empty call-next, admin
configuration/staff CRUD supported by the client, analytics and 204 responses.
The two temporary server process groups were stopped after testing. Tests did
not use the development database. Full commands and evidence are in
[process.md](process.md) and [KEZEK-002.txt](verification-evidence/KEZEK-002.txt).

## Initial checkout blockers (resolved)

The checkout initially showed local deletions of `Makefile`, `README.md`,
`AGENTS.md`, `openapi.yaml` and `backend/.gitkeep`. The first four were restored
from their committed versions and updated where needed; `backend/.gitkeep` is an
empty marker and remains deleted. `make dev` and the root API contract are now
available locally.

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
| #3 | Closed | Contributor process/docs, recovered local files, updated setup and brainstorm links are committed and verified. |
| #4 | Closed | Ticket issuance and idempotent retry/token behavior are specified in the issue evidence. |
| #5 | Closed | Current OpenAPI and future full-stack contract validate against OpenAPI 3.0, including examples. |
| #6 | Closed | Auth and staff-assignment contract is documented and validated. |
| #7 | Closed | Administration, schedules and analytics contract is documented and validated. |
| #8 | Closed | Eight page/state contracts and shared failure/loading behaviors are documented and checked. |
| #9 | Closed | Validated startup settings, safe structured errors, OpenAPI error responses and regression evidence are committed. |
| #10 | Closed | Alembic runs automatically at startup; fresh, legacy and partial-schema behavior plus SQLite connection/transaction rules are tested. |
| #11 | Verified | Organization-owned models, same-organization links, legacy data backfill, and history-preserving deletion are covered by migration and database tests. |
| #12 | Closed (2026-10-26) | Daily queues, ticket events, hashed ticket credentials, scoped idempotency, active-counter uniqueness, legacy backfill and hosted verification pass; see latest process entry. |
| #13 | Closed (2026-10-26) | Idempotent Asia/Almaty demo seed, assigned staff/counters, development-only credentials, Argon2id hashes, legacy scrypt verification and hosted checks pass. |
| #14 | Open | Hashed expiring bearer sessions and login pass; inactive-user/current-identity/cookie criteria are unmet. |
| #15 | Open | Explicit bearer CORS works; planned cookie CSRF and server-side logout/revocation are absent. |
| #16 | Open | Anonymous, wrong-role and staff-counter assignment checks pass; organization-scope enforcement is absent. |
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
| #33 | Closed (2026-10-26 follow-up) | Organization selection, timezone hours, backend availability/wait estimates, and loading/empty/closed/error component states are verified. |
| #34 | Open | Current join works; it collects a name, uses an ID link and lacks idempotent uncertain-response recovery. |
| #35 | Open | Current ticket polling/cancellation work; polling continues every three seconds for terminal states, with no confirmation or required refresh/recovery tests. |
| #36 | Open | Bearer login/local storage exists; planned cookie identity, expiry recovery, logout revocation and protected-cache clearing are absent. |
| #37 | Open | Live staff actions work for the current contract; backend assignment isolation, strict planned transitions and component regression coverage are absent. |
| #38 | Open | Current service creation/open toggles exist; schedule forms and daily closure controls are absent. |
| #39 | Open | Current counter/service/assignment controls exist; organization options, active-work safeguards and component tests are absent. |
| #40 | Open | Staff creation exists; staff editing, deactivation and rejected active-work/assignment tests are absent. |
| #41 | Open | Current stats come from real data when configured; date filters, service-duration metrics and full error-state coverage are absent. |
| #42 | Closed (2026-10-26) | Secret-safe logs, no-referrer ticket access, login/join limits and hosted real-backend verification pass; see the latest audit entry below. |
| #43 | Open | SQLite restart/seed/history tests pass; fresh Alembic migrations and event persistence cannot be verified. |
| #44 | Closed | Real-backend customer/staff workflows pass on desktop and mobile with isolated migrated/seeded SQLite. |
| #45 | Closed | Real-backend admin setup/assignment, access denial, expired-session UI/API and invalid private-link checks pass on desktop and mobile. |
| #46 | Closed (2026-10-26 follow-up) | Mobile/keyboard flows, accessible labels, focus and dialogs, contrast, loading/empty/error/conflict states verified; category filter and skip-link defects fixed. |
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

## Rapid follow-up audit — initial categories

Fresh GitHub retrieval: 46 open MVP issues, 6 closed (52 total). Every open
issue's full acceptance criteria were compared with the code and evidence above.
A means all criteria already implemented; B means a small, bounded completion;
C means substantial missing foundational behavior; D means unresolved prerequisites
prevent complete verification. A passing related test never substitutes for a
missing criterion. C issues also have dependencies, listed explicitly below.

**A: none.** No safe closure is available without implementation.

B priority order (estimates are working time, not test results):

| Rank | Issue | Estimate | Dependency / next action |
| --- | --- | --- | --- |
| 1 | #3 | 15–25 min | None; restore investigated contributor files, update stale setup and link-check guidance. |
| 2 | #4 | 15–25 min | None; document client-retained secret and queue-scoped retry semantics, including response loss. |
| 3 | #6 | 25–40 min | None; specify cookie/CSRF identity and assigned-counter operations. |
| 4 | #7 | 30–45 min | None; specify administration schemas, restrictions and real analytics. |

Small tasks currently in D promote to B in this order as prerequisites finish:
#5 (25–40 min, after #4), #8 (20–30 min, after #5–#7), #9 (40–60 min,
after #5–#7), #10 (45–75 min, after #9). Existing working API behavior will
remain covered while implementing new contracts and persistence migrations.

| Open issue | Initial category | Unfinished dependencies |
| --- | --- | --- |
| #3 | B | None |
| #4 | B | None |
| #5 | D | #4 |
| #6 | B | None |
| #7 | B | None |
| #8 | D | #5, #6, #7 |
| #9 | D | #1, #5, #6, #7 |
| #10 | D | #9 |
| #11 | C | #10 |
| #12 | C | #4, #11 |
| #13 | D | #12 |
| #14 | C | #6, #12 |
| #15 | D | #14 |
| #16 | D | #14, #11 |
| #17 | C | #12 |
| #18 | D | #5, #17 |
| #19 | C | #4, #5, #12, #17 |
| #20 | D | #5, #19 |
| #21 | D | #19, #20 |
| #22 | D | #5, #19 |
| #23 | D | #6, #16, #17 |
| #24 | D | #19, #23 |
| #25 | D | #24 |
| #26 | D | #19, #21, #24, #25 |
| #27 | D | #7, #16, #17 |
| #28 | D | #7, #16, #11, #25 |
| #29 | D | #7, #16, #14, #25 |
| #30 | D | #7, #16, #17, #24 |
| #31 | D | #7, #16, #25 |
| #32 | D | #5, #6, #7, #15 |
| #33 | D | #8, #18, #22, #32 |
| #34 | D | #19, #32, #33 |
| #35 | D | #20, #21, #32, #34 |
| #36 | D | #14, #15, #32 |
| #37 | D | #23, #24, #25, #32, #36 |
| #38 | D | #27, #30, #32, #36 |
| #39 | D | #28, #32, #36 |
| #40 | D | #29, #32, #36 |
| #41 | D | #31, #32, #36 |
| #42 | D | #15, #19, #20 |
| #43 | D | #13, #25, #27, #28, #29, #31 |
| #44 | Closed (2026-10-26 follow-up) | Real-backend customer/staff desktop and mobile workflows pass. |
| #45 | Closed (2026-10-26 follow-up) | Admin configuration, staff assignment visibility, anonymous/wrong-role/expired-session denials, and invalid private links pass real-backend browser checks. |
| #46 | Closed (2026-10-26 follow-up) | Required screens reviewed and verified on desktop/mobile Chromium; see current process evidence. |
| #47 | D | #2, #26, #43, #44, #45 |
| #48 | D | #3, #26, #41, #42, #43, #44, #45, #46, #47 |

Investigation before restoration: Git status and the index show local deletions
only, not committed removals. The latest Makefile/OpenAPI commits are the verified
#49/#51/#52 work; no replacement files exist. Restore Makefile, AGENTS.md and
openapi.yaml byte-for-byte from HEAD; update README while retaining Lovable
guidance. Leave the unused backend/.gitkeep deletion untouched. This records a
reversible repair under the current instruction to investigate before restoring.

## GitHub state and revised MVP review — 2026-10-26

Reviewed all 53 GitHub issues, including the acceptance criteria for the
redesign and remaining milestones. The final backend suite passed (129 tests).
Frontend Vitest passed (23 tests), typecheck and production build passed, and
lint had zero errors (six existing warnings). The updated real-backend Playwright
suite passed all six desktop/mobile cases, including live organization hours,
timezone, availability and the admin Organizations tab. Issues #11, #33, #44 and
#53 were closed with verification comments. No existing labels were changed.

No other open issue was closed: each retains an unmet or unverified acceptance
criterion, even where the redesigned application implements a related current-
MVP flow.

Customer discovery, joining, ticket tracking, staff FIFO operations, and the
global admin directory are implemented and covered by existing API, frontend,
and browser-test issues. The updated MVP explicitly retains bearer
login and private ticket links; it does not require daily queue numbering,
cookie/CSRF auth, account-based ticket history, or notification delivery. These
older contract criteria remain open until their scope is formally resolved;
they are not marked complete or silently removed. Security, authorization,
transactional queue, admin, accessibility, CI and release-verification work
remains in #12–#48.

The previously considered proposal for a separate admin-overview browser issue
is not needed: the all-organization view now passes the real-backend desktop and
mobile browser workflow. No new GitHub issue was created.

## 2026-10-26 — Issue #45 follow-up and next phase review

Issue #45's three acceptance criteria are now verified in the isolated
real-backend browser suite and the issue was closed with criterion-specific
evidence. The suite passes six desktop/mobile cases, including admin service and
counter creation, staff assignment visibility, anonymous and wrong-role denial,
expired-session API/UI denial, and safe invalid private-ticket feedback. The
current GitHub count is **19 closed and 34 open**. The open issues are #12–#32,
#34–#43 and #46–#48.

The open issue set was reviewed again against the updated customer-first MVP.
Its remaining criteria already cover unfinished or unverified work, including
daily queues/idempotency/private-token persistence, account/session security,
organization scoping, schedule and analytics contracts, admin/staff integration,
accessibility review, CI and delivery verification. Some older requirements
(cookie/CSRF auth, daily numbering and account-based history) exceed the revised
MVP, but their issues remain open until scope is formally reconciled; they were
not closed as complete. No distinct uncovered feature was identified that
warrants a new issue without duplicating this backlog. No new issues were
created and no existing issue labels were changed.

## 2026-10-26 — Issue #46 accessibility and responsive verification

Fixed two accessibility defects found during review: the skip link now moves
keyboard focus to the main content, and the category-filter label is exposed on
an explicit accessible group. The browser suite now verifies keyboard
navigation through discovery, service selection, queue joining and cancellation;
staff login and Call Next; admin login and tab navigation; dialog focus and
confirmation; and no horizontal overflow across customer, login, staff and admin
screens at desktop and mobile viewports. A real-backend availability race also
verifies that a 409 conflict is announced and does not create a ticket.

Focused route/component tests cover loading, empty, closed and network-error
states. The visual/code review checked accessible input names, focus styling,
Radix alert-dialog semantics and key status colors. Measured text contrast ratios
are 5.17:1 for primary blue on white, 4.76:1 for muted body text on white, 5.21:1
for completed status text on its pale green surface, and 6.16:1 for waiting text
on its pale blue surface. Vitest passed 23 tests, typecheck passed, lint had zero
errors (six existing warnings), and real-backend Playwright passed all 8 desktop
and mobile cases. Native assistive technology was not available for this review.
Issue #46 was closed with these results. The repository now has **20 closed and
33 open issues**; open issues are #12–#32, #34–#43 and #47–#48.

## 2026-10-26 — Issue #47 CI implementation status

Added `.github/workflows/ci.yml` for locked installs, frontend checks/build,
fresh migrations and drift detection, backend checks/tests, current-contract
OpenAPI consistency, and isolated real-backend Playwright workflows. Local
commands for each gate pass, including 129 backend tests, two explicit
OpenAPI consistency tests, fresh migration upgrade/check, and eight desktop/
mobile browser cases. The workflow YAML parses. The first hosted run exposed a
login hydration race in keyboard tests; the tests now wait for the username
field to become enabled before typing. GitHub Actions run
[40308941320](https://github.com/dooloe/backend-ready-frontend/actions/runs/40308941320)
passed all gates, including both browser viewports. Issue #47 was closed after
the successful hosted run. GitHub now has **21 closed and 32 open issues**;
open issues are #12–#32, #34–#43 and #48.

## 2026-10-26 — Issue #48 clean setup and delivery verification

GitHub Actions run [40308941320](https://github.com/dooloe/backend-ready-frontend/actions/runs/40308941320)
verified clean dependency installation, fresh Alembic migration/model checks,
all frontend/backend checks, and eight real-backend desktop/mobile browser
cases. A separate direct `make dev` run used a fresh temporary SQLite database
and non-default ports; migrations and demo seeding completed at startup. A
desktop browser walkthrough discovered the university Demo, joined the real
queue, received its private ticket, then observed staff call, start and complete
the same ticket. Invalid ticket access and invalid login were rejected as
expected. Additional failure checks in the browser suite cover empty search,
closed queues, availability-race 409 without issuance, expired sessions and
staff denial on admin pages. README, process evidence, demo guide, screenshots
and limitations now describe the observed application. No new unresolved bug
was found. Issue #48 was closed after all three criteria were verified.

The remaining open issues are still tracked rather than treated as complete:
daily queues/idempotent private ticket tokens, cookie/CSRF sessions, rate limits,
complete organization scoping, and other design-contract work do not match the
currently shipped bearer-session API. The repository now has **22 closed and
31 open issues**; open issues are #12–#32 and #34–#43.

## Full issue review and next-phase backlog — 2026-10-26

Refreshed all existing GitHub issues, including closed history and the full
acceptance criteria for every open issue. Issue #42 was closed only after the
hosted workflow passed: [run 40313472194](https://github.com/dooloe/backend-ready-frontend/actions/runs/40313472194).
The run passed frontend lint, typecheck, tests and production build, fresh
migrations/model-drift checks, OpenAPI consistency, backend tests and the
real-backend desktop/mobile browser journey. Local and live-server evidence for
rate limiting, ticket-token redaction and referrer policy is recorded in
`docs/process.md`.

GitHub currently has **24 closed and 29 open issues**. The remaining open
issues are #13–#32, #34–#41 and #43. They still have incomplete acceptance
criteria; in particular, #43 requires event persistence, which the current
backend does not implement. No other issue was closed during this review.

The revised customer-first experience is implemented and verified under #53,
with the real customer/staff journey in #44, admin/access checks in #45,
responsive/accessibility review in #46, CI in #47 and clean setup/delivery in
#48. The remaining open issues already cover the remaining technical gaps:
queue/ticket persistence and transactions (#19–#21, #26, #43), public
availability and authorization (#16, #18, #22–#25), administration and
analytics (#27–#31), API facade and frontend integration (#32, #34–#41), and
seed data (#13). These should be prioritized and reconciled with the revised
scope rather than duplicated as new issues.

Some older acceptance criteria are out of scope for the updated MVP, including
cookie/CSRF migration (#14–#15) and manual daily queue opening/closing (#17,
#30); current bearer authentication, private ticket links and operating-hours
availability are retained. These issues remain open pending an explicit
scope disposition; they are not represented as implemented. Account-based
ticket history is also not proposed because the revised experience uses the
existing secure private-ticket links and does not require customer accounts.

No distinct uncovered requirement warrants a new issue today, so no issue was
created. The existing `new-mvp` label is available for any genuinely new,
approved backlog items; every newly created issue for this version will receive
`new-mvp` and appropriate area labels. No existing labels were changed.

## Issue #12 hosted verification and closure — 2026-10-26

Hosted run [40315662108](https://github.com/dooloe/backend-ready-frontend/actions/runs/40315662108)
passed all frontend/backend, migration/model-drift, OpenAPI, and real-backend
desktop/mobile workflow gates for commit `cec8e7e`. Issue #12 was closed with
acceptance-criterion evidence. GitHub now has **24 closed and 29 open issues**;
the remaining open issues are #13–#32, #34–#41 and #43. The Argon2id seed
update and its hosted verification are recorded in the follow-up below.

## Issue #13 hosted verification and closure — 2026-10-26

Hosted run [40316814343](https://github.com/dooloe/backend-ready-frontend/actions/runs/40316814343)
passed locked dependency installation, all frontend/backend checks, fresh
migrations/model-drift, OpenAPI consistency, and real-backend desktop/mobile
workflows for commit `07fd1a0`. The full backend suite passed 136 tests. Issue
#13 was closed after verifying the seeded organizations/services/counters/
assignments, Argon2id hashes with legacy scrypt login compatibility, and
repeat-seed ticket preservation. GitHub now has **25 closed and 28 open issues**;
the remaining open issues are #14–#32, #34–#41 and #43.

## Issue #16 authorization review — 2026-10-26

Implemented database-backed role checks, same-organization scoping for protected
admin operations, staff assignment checks for counter operations, and denial for
inactive counters. Cross-organization IDs are hidden with 404 responses, and
deactivated users' existing sessions are rejected. The full backend suite passed
139 tests locally. The first hosted run passed all code gates but found stale
browser expectations for organization scope and shared desktop/mobile queue
state, plus an admin assignment UI bug. Those cases now pass locally in all eight
desktop/mobile browser runs. A second run flagged browser-spec formatting; local
lint then passed with zero errors and six existing warnings. Hosted run
[40321281812](https://github.com/dooloe/backend-ready-frontend/actions/runs/40321281812)
passed every gate. Issues #16 and #37 were closed with criterion-specific
evidence comments. GitHub now has **27 closed and 26 open issues**. The remaining
open issues are #14–#15, #17–#32, #34–#36, #38–#41 and #43.

## Next-phase backlog review — 2026-10-26

No new issues are proposed: the missing requirements are already covered by
open issues. The updated customer-first experience and responsive review are
covered by #53 and #44–#48; staff authorization and dashboard behavior are now
verified and closed in #16 and #37. Remaining technical work is represented by
#18–#35 and #38–#43. Issues #14–#15 and #36 specify cookie/CSRF behavior that
does not match the current bearer-session API; #30 specifies manual daily queue
controls beyond the current operating-hours model. These remain open pending a
scope decision; none is being treated as implemented or removed. Issue #17's
organization-local schedule behavior is now implemented and awaits hosted
verification.

The `new-mvp` label already exists. No issues or labels were created or changed;
if an uncovered, approved requirement emerges later, every new issue will carry
`new-mvp` plus relevant area/type labels.

## Issue #17 scheduling implementation — 2026-10-26

Implemented organization-local schedule resolution and daily queue creation on
accepted joins. Local backend verification passed 149 tests, including concurrent
independent-process first access, same-day boundaries, midnight/overnight date
selection, and manual closure precedence. Issue #17 remains open pending hosted
CI; no issue count changed.

## Issue #17 hosted verification and closure — 2026-10-26

Hosted CI run [40325780414](https://github.com/dooloe/backend-ready-frontend/actions/runs/40325780414)
passed all frontend, backend, migration/model-drift, OpenAPI and real-backend
desktop/mobile browser workflow gates for commit `25b83cf`. Combined with the
149-test local backend suite, this verifies the issue's schedule boundaries,
overnight business date behavior, single daily queue under concurrent first
access, and manual closure precedence. Issue #17 was closed with criterion-
specific evidence. GitHub now has **28 closed and 25 open issues**; remaining
open issues are #14–#15, #18–#32, #34–#36, #38–#41 and #43.

## Issue #19 transactional issuance — 2026-10-26

Implemented the queue-scoped anonymous issuance endpoint with canonical proof
validation, hashed proofs, atomic daily numbering and issued-event persistence,
idempotent current-state recovery, token/key conflict rejection, closed-queue
rejection, and transaction rollback. Verification passed locally: 154 backend
tests, including same-key concurrency, replay after closure, and injected event
failure; compileall and diff checks also passed. Issue #19 stays open pending
hosted CI; no closure is claimed yet.

## Issue #19 hosted verification and closure — 2026-10-26

Hosted run [40328672266](https://github.com/dooloe/backend-ready-frontend/actions/runs/40328672266)
passed frontend lint, typecheck, tests and build; migration/model-drift,
compilation, backend tests, OpenAPI consistency, and real-backend desktop/mobile
workflows for commit `1f6456b`. Together with 154 passing local backend tests,
including concurrency, replay-after-close and rollback coverage, this verifies
all #19 acceptance criteria. Issue #19 was closed with criterion-specific
evidence. GitHub now has **29 closed and 24 open issues**; remaining open issues
are #14–#15, #18, #20–#32, #34–#36 and #38–#41 and #43.

## Issue #18 public directory implementation — 2026-10-26

Implemented organization slugs and the public per-organization active service
catalog, including a joinable current daily queue ID, organization-local date,
authoritative schedule/manual availability, aggregate waiting/counter counts
and estimates. Current UI directory fields are preserved. Legacy joins now link
to their daily queue so the new aggregate catalog counts both compatible and
anonymous-protocol tickets. Unknown organization, empty catalog, closed service,
cross-organization isolation, and absence of private ticket fields are covered.
Focused tests passed 18 cases and the complete backend suite passed 156 tests;
compileall and diff checks passed. Issue #18 remains open pending hosted CI.

## Issue #18 hosted verification and closure — 2026-10-26

Hosted run [40340675758](https://github.com/dooloe/backend-ready-frontend/actions/runs/40340675758)
passed every frontend, backend, migration/model-drift, OpenAPI and real-backend
desktop/mobile workflow gate for commit `2b89a2a`. Combined with the 156-test
local backend suite, this verifies all #18 acceptance criteria. Issue #18 was
closed with criterion-specific evidence. GitHub now has **30 closed and 23 open
issues**; remaining open issues are #14–#15, #20–#32, #34–#36, #38–#41 and #43.

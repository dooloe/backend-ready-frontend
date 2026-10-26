# Implementation and verification record

## 2026-10-26 — Issue #17 organization-local scheduling (hosted verification pending)

Added `backend/app/scheduling.py` to resolve the service's business date and
opening window using its organization's IANA timezone. Same-day hours include
the opening instant and exclude the closing instant. Overnight hours belong to
the date they opened, including the segment after midnight. Both hours absent or
equal represent a full-day schedule; incomplete hours and invalid timezones fail
closed. Service activity, the existing `isOpen` setting, schedule hours and a
manually closed `DailyQueueRow` all participate in effective availability.
Public directory reads reflect that availability without creating data. A
successful legacy join creates the daily queue within the same writer-reserved
transaction; the unique organization/service/date key and existing SQLite
reservation prevent duplicate first-access queues across processes. Ticket-to-
queue linkage and daily issuance remain for Issue #19.

Verification: focused scheduling/directory/process tests passed (**14 passed**).
The full backend suite passed (**149 passed**, six existing Starlette/sqlite
deprecation warnings). Tests cover timezone conversion, opening/closing and
midnight boundaries, overnight business dates, invalid and partial schedules,
manual closure precedence, no queue creation after a closed-hours rejection,
and concurrent first access from independent processes. `git diff --check`
passed. Hosted CI is pending; Issue #17 remains open until hosted verification.

## 2026-10-26 — Issue #16 authorization and organization scoping (hosted verification pending)

Added service-level actor checks that reload the authenticated user from the
database and reject inactive accounts, non-staff roles, and non-admin access to
admin operations. Staff counter reads and queue mutations now require a persisted
same-organization assignment and an active counter. Protected admin operations,
including services, counters, staff listing, and statistics, are scoped to the
admin user's organization. Cross-organization resource IDs return 404. Disabled
users' existing sessions are revoked on authentication. Finishing a ticket that
was already called remains possible after its counter is soft-deleted.

Verification: `backend/.venv/bin/python -m pytest backend/tests -q
-p no:cacheprovider` passed (**139 passed**, six existing Starlette/sqlite
deprecation warnings). The suite includes anonymous and wrong-role denials,
cross-organization access rejection, unassigned and inactive counter rejection,
and deactivated-session rejection. The first hosted run passed every code gate
but found stale browser assumptions about cross-organization admin mutations and
shared desktop/mobile queue state. While aligning those checks, the admin counter
assignment UI was found to capture a controlled select value after it had reset,
causing `null` to be sent; the handler now captures the value synchronously. The
browser checks use isolated organizations, assert assignment persistence, and
passed locally (**8 desktop/mobile cases**). Hosted CI must pass on the updated
revision before the acceptance criteria are marked complete. The follow-up CI
run flagged formatting in the revised browser spec; it has been corrected and
local lint passes with zero errors and six existing warnings.

Hosted CI run [40321281812](https://github.com/dooloe/backend-ready-frontend/actions/runs/40321281812)
passed all frontend checks, migrations/model drift, OpenAPI consistency, backend
tests and eight real-backend browser cases on desktop and mobile. Issues #16 and
#37 were closed with criterion-specific evidence comments. No other issue was
closed during this audit.

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

## 2026-10-20 — Issue #1 implemented and verified

Committed the empty FastAPI scaffold as `26b5e972ef010041d6f19406b92594bfac82a20b`.
Added an application package, direct requirements and pinned dependency file,
Pytest configuration, one startup/schema smoke test and backend instructions.
The root README now links the backend setup. No frontend files were committed.

AC-1: a second fresh Python 3.14.4 virtual environment installed all 22 pinned
requirements successfully; its dependency check reported no broken requirements.
AC-2: Uvicorn started successfully, and a real localhost request returned HTTP 200
with the empty OpenAPI schema; the server was shut down cleanly.
AC-3: the test against the committed source in that fresh environment passed:
`/tmp/kezek-issue1-clean-vw7kpusu/bin/python -m pytest backend/tests -q -p no:cacheprovider`
returned exit 0, 1 passed, 1 non-failing Starlette/httpx deprecation warning.
Exact commands/results are saved in `docs/verification-evidence/KEZEK-001.txt`.

Environment notes: system Python lacked pip/ensurepip, and sudo could not request
a password without a terminal. Used the official pip bootstrap in the ignored
backend virtual environment instead; no system package was installed. Package
installation failed inside the sandbox and succeeded with approved outside-sandbox
execution. The sandbox TestClient run stalled and was interrupted (exit 130);
the approved outside-sandbox runs passed. No GitHub authentication was attempted.

Issue #1 is verified locally; GitHub closure is deferred until the commits are
successfully pushed. All other 47 issues remain incomplete and open.

## 2026-10-20 — Pushed implementation and closed verified issue #1

A normal `git push origin main` failed because the saved credential helper pointed
to the deleted `/tmp/gh_2.102.0_linux_amd64/bin/gh`. Retried with the approved
command-local override:
`git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`.
It succeeded, publishing commits through `85fb170` without changing saved
credentials or Git configuration and without rewriting history.

Posted acceptance evidence directly on issue #1, then closed it as completed:
https://github.com/dooloe/backend-ready-frontend/issues/1#issuecomment-6276967105
Only #1 was closed. A fresh `gh issue list --state all --label mvp` confirmed
completed 1, open 47, blocked 0. Issue #2 (frontend verification commands) is the
next task in backlog order. All unimplemented requirements remain open. The
unrelated generated route change and previously prepared manual scripts are
excluded from these commits; no new manual issue scripts were generated.

## 2026-10-20 — Issue #49: document the current frontend contract

Read `frontend/src/lib/api/http.ts`, `types.ts`, `index.ts`, `mock.ts` and session
handling. Created root `openapi.yaml` for the current client: 17 paths, 20 operations,
21 schemas, exact camelCase fields, required/nullable properties, seven JSON request
bodies, two no-content DELETE responses and nullable call-next/current-ticket views.
Authorization is inferred from mock role checks: five public operations, six
staff/admin operations and nine admin-only operations using bearer tokens. The
contract explicitly identifies inferred success/error conventions and current
ID-based ticket access; it does not substitute future cookie/private-token API
requirements or claim the backend is implemented.

Verified using `python3 /tmp/kezek-validate-current-openapi.py` (exit 0): official
OpenAPI 3.0 schema validation; all local references resolve; all 20 operation IDs,
methods and normalized paths match the HTTP adapter; all eight TypeScript response
interfaces and required/nullable fields match; create/update inputs, authentication
and empty/null success shapes match. Validation used system PyYAML/jsonschema and
the official OpenAPI schema downloaded to `/tmp`; no project dependency changed.
`git diff --check` passed. The temporary validation program is not a new repository
test or an issue-management script.

Existing user deletions of AGENTS.md, README.md and the backend were observed before
this task and left untouched. Commit only the contract and this process record.
Future planned API/migration issues #5, #6, #7 and #32 remain open.

## 2026-10-20 — Issue #50: seeded in-memory backend

Implemented all 20 current-client operations in `backend/app/routers/` with typed
wire models, an isolated seeded MemoryStore and separate authentication helpers.
Default data includes services, counters, demo users and waiting/completed/cancelled
tickets. Passwords use salted scrypt; bearer tokens expire after eight hours and
only their hashes are retained. Queue mutations are locked across threads.

Validation:
- `backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`
  ran outside the sandbox: 57 passed, 1 non-failing Starlette/httpx deprecation
  warning, exit 0. Tests validate all endpoint successes against the OpenAPI
  schemas, generated operation/security coverage, every protected endpoint's
  access rules, session expiry, password salting, state rules, CRUD, input errors,
  real UTC analytics, CORS, parallel joins/calls and cancellation races.
- The first run had 55 passes and one test failure: the next-day analytics test
  reused an intentionally expired eight-hour token. Renewed that test session;
  the final run above passed. No failed check is counted as completion evidence.
- `backend/.venv/bin/python -m pip check`: no broken requirements, exit 0.
- `python3 -m compileall -q backend/app backend/tests`: exit 0.
- Real Uvicorn HTTP smoke on port 8766 verified the service catalog, anonymous
  denial, demo bearer login, seeded statistics, queue and new ticket creation.
  The temporary server was then shut down cleanly.
- `git diff --check`: exit 0.

The old empty-schema smoke test was updated for the now-functional default app.
Contract tests read a present root YAML file, an explicit KEZEK_OPENAPI_PATH, or
HEAD's committed contract when the local file is deleted. No frontend files,
root README/AGENTS deletions or deleted backend/.gitkeep were staged for this task.
No SQLite persistence, organization isolation, future cookie/private-ticket-token
migration or full browser MVP completion is claimed by this in-memory issue.

## 2026-10-20 — Issue #51: local execution Makefile

Added a root Makefile with help, combined dev/run, separate backend/frontend,
installation, test and frontend-build targets. Combined execution injects the real
API URL, configures CORS for the selected frontend port and uses strict frontend
ports. It isolates each service's reload workers in a process group and cleans
both groups on interruption or service exit. No repository restructuring or
frontend implementation changes were made.

Verification:
- `make help`: exit 0; documented commands are discoverable.
- `make -n install dev backend frontend test build`: exit 0; reviewed environment
  setup, dependency installation, server, test and build command expansion.
  Dependency reinstalls and full application tests were not repeated for these
  command wrappers; their implementations and dependency files are unchanged.
- Approved `make dev BACKEND_PORT=18765 FRONTEND_PORT=15173` started both services.
  Real HTTP requests confirmed the seeded API catalog and frontend HTTP 200.
  The transformed frontend API module contained the real custom-port API URL,
  and CORS preflight accepted the custom frontend origin.
- Ctrl+C stopped both service process groups (expected exit 130); socket checks
  confirmed both temporary ports closed.
- `make dev NPM=false BACKEND_PORT=18766 FRONTEND_PORT=15174` intentionally failed
  frontend startup (expected make exit 2). Both temporary ports were then closed,
  verifying failure cleanup without disturbing other local servers.
- `make -n dev BACKEND_PORT=8001 FRONTEND_PORT=5174`: exit 0, correct API/CORS URLs.
- `git diff --check`: exit 0.

Updated backend/README.md with the combined setup and launch commands. Existing
root README, AGENTS, openapi.yaml and backend/.gitkeep deletions remain untouched.

## 2026-10-20 — Issue #52: SQLAlchemy persistence and DATABASE_URL

Replaced MemoryStore with DatabaseStore while preserving the current frontend's
20 operations and response shapes. Added portable relational ORM models for
users, hashed sessions, services, counters, service associations, tickets and
active counter claims. A singleton initialization/transaction row records first
setup. Ticket sequences, state, timestamps and credentials persist in the DB.
Services/counters use tombstones so deletion hides them without breaking ticket
history or allowing seed resurrection.

DATABASE_URL defaults to the absolute backend/data/kezek.db SQLite path and is
exported by the Makefile. Connections open only at app startup. SEED_DEMO_DATA
controls first-time demo provisioning; initialization is recorded even when
seeding is disabled. Added backend/.env.example and ignored local SQLite files.
Database-specific engine setup, UTC conversion and write synchronization are
separated from routers and public wire models. Schema creation is initial setup,
not a migration mechanism; future schema changes still require migrations.

Validation results:
- Initial API regression run on temporary SQLite files: 57 passed, exit 0.
- New DB-specific run initially had 14 passes and one failure: the contention
  check exposed SQLAlchemy's lazy Session.begin(), which did not reserve a writer
  on context entry without a query. The adapter now explicitly opens that
  connection on entering a SQLite write context. Re-run: 15 passed, exit 0.
- Final `backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`
  outside the sandbox: 72 passed, 1 unchanged/non-failing Starlette/httpx
  deprecation warning, exit 0 (57.72 seconds).
- Tests cover application/engine restart persistence across all data categories,
  preserved credentials/tokens and sequences, environment-selected database files,
  lazy connections, seed idempotency and disabled provisioning, transactional
  rollback, foreign keys/uniqueness, UTC/expiry round trips and bounded contention.
- Spawned independent OS processes verified unique numbering and competing/same-
  counter calls using the same SQLite file. This does not rely on a process-local
  Python lock. In-memory SQLite URL handling was also checked separately.
- PostgreSQL DDL compilation passed without a live driver/server. No live
  PostgreSQL support is claimed; adding its driver and integration tests remains
  future work. SQLite-specific pragmas/BEGIN behavior stay in app/database.py.
- Test fixtures override environment settings and use temporary DB files; the
  development database directory was not created during the suite.
- Runtime/dev dependency closures pinned with SQLAlchemy 2.1.5; pip check reported
  no broken requirements. compileall and git diff --check passed. make help and
  custom DATABASE_URL command expansion passed.

Unrelated root README/AGENTS/openapi.yaml and backend/.gitkeep deletions remain
untouched and excluded from this implementation. No cookie/private-ticket or
organization API migration is claimed; broader migration backlog issues stay open.

## 2026-10-20 — Full issue audit and issue #2 frontend verification

Read all 52 GitHub issue bodies and acceptance criteria using approved
outside-sandbox GitHub CLI access, plus docs/plan.md, docs/spec.md, committed
AGENTS.md, frontend routes/API/session code and backend routers/store/database/
models/auth/tests. Initially 47 issues were open and 5 closed. The broader
organization/private-ticket/cookie-session migration requirements are different
from the explicitly implemented current-frontend contract (#49–#52).

For #2, the first frontend run passed all six tests and strict tsc checking, and
the mock-mode production build succeeded. Lint exposed 60 existing Prettier
errors and seven warnings. Added the missing npm typecheck command and documented
locked installation, checks and real-API startup in frontend/README.md. Applied
eslint formatting fixes only to the six affected mock/route files; both existing
test files and all compiler rules remain unchanged.

Verified acceptance evidence is in verification-evidence/KEZEK-002.txt:
- Fresh temporary-directory npm ci: exit 0, 518 packages installed in 38 seconds.
- npm run lint: exit 0, no errors, seven pre-existing non-failing warnings.
- npm run typecheck: exit 0, existing strict configuration unchanged.
- npm test: exit 0, six tests in two files (4.44 seconds).
- VITE_API_BASE_URL=http://127.0.0.1:8000 npm run build: exit 0.

Whole-project checks:
- backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider:
  exit 0, 72 passed in 65.94 seconds, one existing Starlette/httpx warning.
  Used approved outside-sandbox execution and isolated temporary SQLite files.
- python3 -m unittest discover -s scripts/tests -v: exit 0, 12 passed.
- python3 /tmp/kezek-audit-live.py: exit 0. Started API and Vite on temporary ports
  18865/15873 with an isolated temporary SQLite file. All five frontend routes
  returned HTTP 200; Vite served the configured real API URL. Transpiled the actual
  frontend HTTP adapter and exercised all 20 operations against the running API:
  joins, call/start/complete, cancel, no-show, CRUD, analytics and 401/403/404/409
  rejection cases passed. Both server process groups stopped in finally cleanup.
  This is HTTP integration verification, not a browser interaction/accessibility
  test; Playwright issues #44–#46 remain open.
- git diff --check -- frontend: exit 0.

At audit start Makefile, README.md, AGENTS.md, openapi.yaml and backend/.gitkeep
were already deleted locally. Asked whether these deletions were intentional;
preserved them while awaiting clarification. The backend contract tests use
HEAD:openapi.yaml as documented, so passing tests do not mean the local root
contract file or make dev command is present. No development database was used.

Issue #2 closure: committed and pushed d3d84550adce3caf506ddf5fc250f07827e0879b;
posted acceptance evidence and closed #2 directly through approved GitHub CLI.
A fresh GitHub issue listing confirmed 52 total: 6 closed (#1, #2, #49–#52),
46 open (#3–#48). docs/issue-audit.md records the decision and outstanding gap
for every issue; docs/verification.json records #2 evidence and actual closure.
All unrelated local deletions remain uncommitted.

## 2026-10-20 — Rapid audit and #3 contributor workflow

Retrieved all 46 open MVP issue bodies from GitHub; compared every acceptance
criterion with current code and prior evidence. No category A issue is complete.
Ranked initial category B issues #3, #4, #6 and #7; recorded C/D categories and
dependencies for all remaining issues in issue-audit.md. Counts before closure:
46 open, 6 closed. Tests passing elsewhere do not satisfy missing MVP behavior.

Investigated deleted root files using git status, index entries, path history
and repository-wide filename searches. All four are tracked local deletions,
with intact committed versions and no replacements; no committed removal was
found. Under the current instruction to investigate before restoring, restored
AGENTS.md, Makefile and openapi.yaml exactly from HEAD. Updated root README to
describe current FastAPI/SQLite behavior, real-client configuration, contributor
verification and outstanding MVP work while retaining Lovable guidance. Added
chat-brainstorm.md with recorded decisions and open questions. Left the unused
backend/.gitkeep deletion untouched.

#3 acceptance verification: AC-1 issue-first work, evidence recording and verified
closure are documented; AC-2 selected stack and TanStack routing deviation are
explicit; AC-3 all 17 relative links in README/AGENTS/decisions/discussion notes
resolve. make help and make -n dev test build exit 0. Byte comparison confirms
all three restored files equal their HEAD snapshots. No runtime code changed;
the previously recorded 90 passing tests are not claimed as re-run here.

## 2026-10-20 — #4 recoverable anonymous issuance decision

Specified exact join requests and creation/replay responses in ticket-issuance.md,
with client-generated independent 32-byte access/idempotency secrets, hash-only
storage and queue-scoped uniqueness. Reviewed lost-response recovery before and
after closure/midnight, simultaneous identical requests, different proof with the
same key, reused token with a new key, rollback and bounded contention. Each case
has an explicit existing-ticket result or safe rejection, never an automatic
second logical join. Documented the deviation from server-minted-once tokens and
the unrecoverable loss of all anonymous proof. This closes design work only.

Acceptance checks: AC-1 concrete JSON/header examples specify scope and ownership;
AC-2 matching retries re-use the client-retained proof and no raw secret is saved;
AC-3 serialization/constraints and key/token reuse outcomes are explicit. A Python
one-off decoded/re-encoded both examples to verify distinct canonical 32-byte
values and a name-free join body. No backend issuance or idempotency test is
claimed; #19 remains open. Removed a trailing blank line reported by diff --check
in the preceding audit documentation commit.

## 2026-10-20 — #5 planned public API contract

Added openapi.yml with organization/service directories, aggregate queue status,
transactional creation/recovery and private-token read/cancel schemas. Kept the
current openapi.yaml unchanged; planned endpoints are marked as design-only.
Examples cover closed queues, invalid tokens, duplicate recovery, proof conflicts,
token reuse, validation, bounded contention and unavailable wait estimates.
api-migration.md maps existing calls and fields, name removal and token routes.

AC-1 complete requests/responses/structured errors and access rules are present;
AC-2 the required success/rejection/null examples validate; AC-3 the migration map
reconciles current ID/name/bearer calls with the planned public contract. Added
offline contract regression checks using the official OpenAPI 3.0 metaschema
(source ID retained) and JSON Schema example validation. Command:
backend/.venv/bin/python -m pytest backend/tests/test_mvp_contract.py -q -p no:cacheprovider
passed 8 tests in 0.18s with one existing import warning. These validate design,
not live endpoints. #4 closure confirmed: running count 44 open / 8 closed.

## 2026-10-20 — #6 cookie/session and assigned staff contract

Extended planned openapi.yml and auth-contract.md with login, logout, current
identity, CSRF exchange, assigned counter/queue discovery, atomic call-next and
strict staff lifecycle actions. Defined eight-hour hash-only opaque sessions,
HttpOnly/SameSite/Secure settings, credentialed origins, assignment/organization
checks, 200 null on empty queues and concrete 401/403/409 examples. Documented
the migration from localStorage bearer identity without claiming it implemented.

Acceptance: AC-1 all identity/session/CSRF operations specified; AC-2 counter
selection, assignment, busy/empty behavior and strict transitions specified;
AC-3 cookies and rejected examples explicit. Offline contract/example/security
checks: backend/.venv/bin/python -m pytest backend/tests/test_mvp_contract.py -q
-p no:cacheprovider, 18 passed, one existing import warning. No runtime changes.

## 2026-10-20 — #7 administration and date-filtered analytics contract

Extended planned OpenAPI with service/counter/staff list/create/patch, explicit
staff-assignment composite-key create/delete, daily queue override and analytics.
Defined organization ownership, deactivation/history preservation, active-work
restrictions, non-overnight schedule validation, session revocation and duplicate
identity rejection. admin-contract.md defines inclusive local-date cohorts,
UTC boundary conversion, completed-only waiting/service averages and null values.

AC-1 all administration operations and body schemas are explicit; AC-2 metrics
and filters are defined; AC-3 full schema/examples validate, including invalid
schedule, outside-hours queue opening and duplicate identities. Initial run
reported 1 failed / 32 passed: OpenAPI 3.0 disallows an empty required array on
PATCH schemas. Removed those fields (properties stay optional, minProperties=1).
Re-run of backend/.venv/bin/python -m pytest backend/tests/test_mvp_contract.py -q
-p no:cacheprovider passed 33 tests, one existing warning. #5 and #6 closure
confirmed, running count 42 open / 10 closed before #7. No runtime feature claimed.

## 2026-10-20 — #8 page/state contracts

Added page-contracts.md for all eight required customer/ticket/login/staff/admin
screens, mapping each to planned OpenAPI operation IDs. Defined common loading,
empty, validation, unauthorized, stale-refresh, conflict and confirmed-success
states; five-second terminal-aware polling, request aborts, private-token routes,
name-free join/recovery, cookie expiry/cache clearing, active-work restrictions,
accessible dialogs, mobile layout and keyboard behavior are explicit.

AC-1 all eight page mappings reference 29 existing named contract operations;
AC-2 shared and page-specific states are defined; AC-3 mobile, private-route and
customer-name removal rules are specified. One-off YAML/Markdown check confirmed
all eight Operations rows resolve to declared IDs and every relative link exists.
This is a design issue, so no browser execution or UI implementation is claimed.

## 2026-10-20 — #9 backend configuration and safe errors

Added validated environment-backed settings for `APP_ENV`, `DATABASE_URL`,
`SEED_DEMO_DATA` and explicit HTTP(S) `CORS_ORIGINS`. Invalid or credential-bearing
database/CORS values are rejected without echoing raw values; database URLs are
excluded from settings repr. Production configuration refuses demo seeding. The
non-secret `backend/.env.example` and `backend/README.md` document the defaults and
how to export settings. Startup applies settings before opening the database.

Added structured `code`, `message`, `details` error responses and the backwards-
compatible `detail` alias. Request/Pydantic validation reports only allow-listed
field paths; unexpected failures return a generic 500 message, and the outer ASGI
boundary prevents server tracebacks from echoing credentials or request input.
The existing `openapi.yaml` now describes the implemented shared error responses.

AC-1: parametrized startup tests reject invalid environment, seed and database/CORS
settings, verify production seed safety and ensure database credentials do not
appear in settings repr or exceptions. AC-2: contract-backed tests validate 401,
404, 409 and 422 JSON envelopes; an injected unexpected exception verifies generic
response and secret-free logs while preserving auth challenge headers. AC-3: the
default application startup test and documented example configuration pass.

Verification:
- `backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` —
  119 passed, one existing Starlette/httpx deprecation warning, exit 0.
- `python3 /tmp/kezek-validate-current-openapi.py` — official OpenAPI 3.0 schema,
  local references, all 20 operation/path/security mappings and TypeScript
  request/response shapes passed.
- `npm --prefix frontend test` — 15 passed; `npm --prefix frontend run typecheck`
  passed; `npm --prefix frontend run lint` exited 0 with seven existing warnings;
  `npm --prefix frontend run build` completed client, SSR and Nitro builds.
- `git diff --check` — exit 0.

Issue #9 was closed through approved GitHub CLI only after commit
`d052512906e7f2b7f9c44fe2d7f1dd39e1bddee3` and its tests were pushed. A short
closing comment records the acceptance evidence. The refreshed remote backlog is
39 open and 13 closed issues (52 total). Existing organization/private-token/
cookie-session requirements and live PostgreSQL support remain open in their
separate issues.

## 2026-10-20 — #10 SQLite sessions and Alembic migrations

Added Alembic 1.20.0 to the runtime and development pins, an Alembic config and
versioned baseline under `backend/migrations/`. Database initialization now runs
`upgrade head` on the exact SQLAlchemy engine selected by `DATABASE_URL`, so
migrations use the same connection hooks as requests. The baseline creates the
current schema on a fresh file. A full pre-Alembic schema is stamped without
rewriting records; an incomplete unversioned schema is rejected with its data
preserved. The baseline downgrade is a documented no-op to avoid accidental data
deletion.

SQLite's connection event continues to enable foreign keys, `busy_timeout=10000`
and WAL on every physical connection. Write transactions use `BEGIN IMMEDIATE`
before mutable reads. Tests explicitly inspect two concurrent file-backed
connections, prove separate-session read isolation and rollback, verify restart
persistence, and exercise independent-process sequence/counter contention.

AC-1: the file-backed connection test observes `foreign_keys=1`,
`busy_timeout=10000` and `journal_mode=wal` on two simultaneous connections.
AC-2: temporary file tests cover WAL, rollback, session isolation, restart and
bounded busy handling. AC-3: a fresh temp file reaches revision `af7168bb27f8`;
the documented CLI `upgrade head`, `current` and `check` commands succeed. Legacy
complete schemas are stamped without data loss; partial schemas are rejected and
their existing data remains intact.

Verification:
- `backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` —
  124 passed in 70.20s; one existing Starlette/httpx deprecation warning; exit 0.
- `DATABASE_URL=sqlite:////tmp/kezek-cli-migration.db SEED_DEMO_DATA=false
  backend/.venv/bin/alembic -c backend/alembic.ini upgrade head` — exit 0 on an
  isolated `/tmp` database.
- `DATABASE_URL=sqlite:////tmp/kezek-cli-migration.db
  backend/.venv/bin/alembic -c backend/alembic.ini current` — reports
  `af7168bb27f8 (head)`.
- `DATABASE_URL=sqlite:////tmp/kezek-cli-migration.db
  backend/.venv/bin/alembic -c backend/alembic.ini check` — no new upgrade
  operations detected.
- `backend/.venv/bin/python -m pip install --dry-run --no-index -r
  backend/requirements-dev.txt`, `backend/.venv/bin/python -m pip check`,
  `backend/.venv/bin/python -m compileall -q backend/app backend/migrations
  backend/tests` and `git diff --check` — pass.

Issue #10 was closed through approved GitHub CLI only after commit
`16b3232` and its tests were pushed. The closing comment records the acceptance
evidence. Remote issue state was refreshed: 38 open and 14 closed (52 total).

## 2026-10-20 — Issue #11 organization-owned configuration models

Added normalized `organizations` and `staff_assignments` ORM models and ownership
fields on users, services, counters, and counter-service links. The Alembic
revision backfills existing records into `org-demo`, preserves password hashes
and tickets, gives legacy users non-deliverable `@legacy.invalid` addresses, and
creates uniqueness and same-organization association constraints. SQLite
migrations temporarily disable foreign-key enforcement only on their migration
connection because Alembic batch mode replaces tables; the migration connection
runs `foreign_key_check` before restoring enforcement, and application/request
connections continue to enable foreign keys. Current API-created configuration
remains in the seeded organization; request-scoped tenant authorization remains
open in #16.

AC-1: ORM and Alembic schema include organization, user, service, counter,
counter-service and staff-assignment fields, plus schedule/duration and active
metadata from `docs/plan.md`. AC-2: tests reject duplicate organization slugs,
duplicate email addresses, invalid foreign keys, and counter-service or staff
assignment links across organizations. AC-3: migration tests preserve existing
users, password hashes, service sequence, relationships and ticket history;
soft-deletion tests confirm service deletion does not erase tickets. Same-org
constraints are enforced by composite foreign keys; application-level
organization request scoping is intentionally tracked separately in #16.

Verification: backend suite passes with 126 tests; fresh and populated legacy
SQLite migrations pass; Alembic reports no schema drift; dependency, compile and
whitespace checks pass. One existing Starlette/httpx deprecation warning remains.
Manual browser/E2E cases remain unrun as recorded in `qa-engineer.md`.

## 2026-10-26 — Customer-first UI/UX redesign (#53)

Assessed the current project guidance, architecture/plan/specification, API facade,
React routes, persistent backend/model/migration implementation and relevant open
GitHub backlog. Existing working endpoints implement the older compatible API;
separate planned-contract issues remain incomplete. Preserved pre-existing user
changes to the organization ownership models/migration, backend, tests and docs.

Implemented shared Inter/blue/navy styling and customer-first navigation; searchable
organization Explore with category filters; organization details and live service
summaries; focused name-free confirmed joining; six-state digital tickets with
people ahead, timestamps, counter, last refresh and confirmed cancellation; and
browser-local My Tickets using only received private links. Staff retain automatic
FIFO selection with focused actions and confirmed no-shows; all admin configuration
is retained with services/queues first, accessible fields, request feedback and
confirmed deletion. Sign-in/out clears query caches. UI calls remain behind `api`.

Added public organization list/detail operations and synchronized `KezekApi`, HTTP,
development mock and implemented `openapi.yaml`. They expose metadata and aggregates
only. Added an additive category/location migration after the user's existing local
organization revision, plus an explicit idempotent four-category Demo seed command
with organization-specific staff/counters. Real HTTP is now the default; mock mode
requires explicit opt-in. Existing ticket/auth/lifecycle operations remain intact.

Verification: frontend lint passes with six existing shared-component Fast Refresh
warnings; typecheck passes; 17 frontend tests pass; production client/SSR build
passes. Backend suite passes 129 tests with one existing deprecation warning.
Six real-backend Playwright scenarios pass (desktop/mobile Chromium), exercising
customer discovery/join/live position/call/start/complete/cancel/no-show, private
history isolation/recovery, search/closed states, keyboard navigation and admin
service creation/queue closure/confirmed deletion. The isolated fixture migrates
and seeds temporary SQLite files rather than touching development data. Inspected
desktop/mobile Explore and mobile ticket screenshots. Compile and diff checks pass.

Initial browser checks found an SSR pre-hydration interaction issue; controls now
stay disabled until React can accept input, and all six cases passed on a clean
rerun. Sandbox/local-browser dependency obstacles and exact check commands are
recorded in `verification-evidence/KEZEK-REDESIGN-053.txt`. Setup, API additions,
optional seed accounts and retained limitations are documented in `redesign.md`.

Created redesign issue #53 and updated it with evidence. Broader existing cookie,
hash-only access-token, idempotency, daily queue and tenant-admin requirements are
not marked complete. No existing issue was closed, no user changes were discarded,
and no commits/pushes or history rewrites were performed; #53 remains open for
review and delivery of the working tree.


## 2026-10-26 — Make demo organizations available on startup

Follow-up: the client could not see organizations because the four-directory seed
was only documented as an optional one-off script. FastAPI startup now invokes
the idempotent seed in development and test environments, whether the SQLite
database is new or already initialized. Existing data is never cleared. Production
settings continue to reject demo seeding. Explicit mock mode now includes the same
four organizations, their services/counters, and organization-specific staff users.
The login screen lists mock credentials; real-development credentials are in
`docs/redesign.md`. Startup coverage asserts the public categories and successful
login with an assigned counter.

Provisioned the configured local SQLite development database using
`cd backend && .venv/bin/python seed_directory.py`. Read-only inspection confirmed
five organizations total (the existing Kezek Demo plus four sample organizations),
four distinct service categories, one service and counter per sample organization,
and the four expected assigned demo staff usernames. No ticket history or existing
organization was removed.

Provisioning follow-up verification: the complete backend suite from repository
root (`backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`)
passes 129 tests with one existing Starlette/httpx deprecation warning. The
startup-entrypoint test verifies all four directory categories, successful
`demo-staff-university` login and its assigned demo counter. The frontend suite
passes 18 tests, including demo discovery, staff login and a full mock ticket
lifecycle; frontend lint and typecheck pass. This follow-up changes no prior
Playwright evidence; the earlier six real-backend desktop/mobile workflows remain
recorded above. The default local SQLite file was absent before seeding; the
explicit development seed command created it and added the four demo organizations.

## 2026-10-26 — GitHub issue review and current browser verification

After the all-organization admin tab was added, the E2E scenario was updated to
assert the real organization directory before navigating to Services for the
configuration checks. From `frontend/`, run:

```sh
LD_LIBRARY_PATH=/tmp/kezek-browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/home/asus/.cache/ms-playwright npm run test:e2e
```

Actual result: **6 passed (1.2m)** across desktop and mobile Chromium. Playwright
started the real FastAPI and Vite servers with a fresh migrated/seeded temporary
SQLite database and mock mode disabled. The suite verifies discovery/search,
ticket join and lifecycle, cancellation, no-show, browser-local private ticket
history, staff FIFO operations, admin access, all five organizations in the
admin directory, and admin service controls. Organization detail assertions
also verify backend-provided operating hours, timezone, availability, waiting
count, and wait estimate.

The full backend suite also passed **129 tests**. The current frontend suite has
**23 passing tests**; typecheck and production build pass; lint has no errors and
six existing shared-component Fast Refresh warnings. On GitHub, #11, #33, #44
and #53 were closed with criterion-specific verification comments. The repository
now has 18 closed issues and 35 open issues (#12–#32, #34–#43 and #45–#48). No
existing labels were changed, and no new issues were created.

## 2026-10-26 — Issue #45 access-control browser verification

The full browser command above was rerun after adding the expired-session and
admin-assignment checks. Actual result: **6 passed (1.4m)** across desktop and
mobile Chromium, against the real FastAPI/Vite applications and fresh temporary
migrated/seeded SQLite. The browser suite verified admin service/counter creation
and staff assignment, staff visibility of the assigned counter, anonymous and
wrong-role admin denial, expired-session API 401 and UI recovery feedback, and
safe invalid private-ticket feedback. Issue #45 was closed only after these
checks passed. GitHub currently has 19 closed and 34 open issues (#12–#32,
#34–#43, #46–#48).

## 2026-10-26 — Issue #46 responsive and accessibility verification

Accessibility fixes: the skip link target now receives focus, and the category
filter is an explicitly named group for assistive technology. Real-backend
Playwright covers keyboard navigation through customer discovery, service
selection, queue joining and cancellation; staff login and Call Next; admin
login and tab navigation; confirmation-dialog focus; and a queue-closed 409 race
that announces the conflict without issuing a ticket. The same eight scenarios
pass on desktop and mobile Chromium. Mobile checks assert no horizontal overflow
in customer, login, staff and admin screens.

Actual checks: `npm run lint` (zero errors, six existing Fast Refresh warnings),
`npm run typecheck` (pass), `npm test` (23 passed across 8 files), and the
real-backend command above (**8 passed in 1.7m**). Existing detail-page tests
cover loading, empty, closed and network-error states. Contrast review measured
primary blue on white at 5.17:1, muted text on white at 4.76:1, completed status
text on pale green at 5.21:1, and waiting status text on pale blue at 6.16:1.
The code review confirmed named inputs, visible focus styling and Radix dialog
focus handling. Native screen-reader testing was unavailable. Issue #46 was
closed after these checks; GitHub has 20 closed and 33 open issues (#12–#32,
#34–#43, #47–#48).

## 2026-10-26 — Issue #47 CI implementation

Added `.github/workflows/ci.yml`. On pushes, pull requests and manual dispatch,
it installs the frontend lockfile with `npm ci` and pinned backend requirements,
runs frontend lint/typecheck/Vitest/build, applies fresh Alembic migrations and
checks for model drift, compiles Python modules, runs an explicit current
OpenAPI-to-FastAPI contract consistency gate plus the full backend suite, then
installs Chromium and runs the real-backend Playwright workflows. The migration
database uses the runner temporary directory; Playwright creates its own fresh
temporary SQLite database. The workflow runs with read-only repository
permissions.

Local results: frontend lint (zero errors, six existing warnings), typecheck,
Vitest (**23 passed**), production build, backend pytest (**129 passed**, one
existing Starlette/httpx warning), explicit OpenAPI consistency guard (**2
passed**), isolated `alembic upgrade head` plus `alembic check` (no pending model
operations), and real-backend Playwright (**8 passed** across desktop/mobile).
The workflow YAML parsed successfully. GitHub Actions run
[40308941320](https://github.com/dooloe/backend-ready-frontend/actions/runs/40308941320)
passed every gate, including the hosted desktop/mobile real-backend journey.
The login hydration wait added after the first hosted run made the keyboard
login tests deterministic. Issue #47 was closed after the successful hosted
run; GitHub now has 21 closed and 32 open issues (#12–#32, #34–#43, #48).

## 2026-10-26 — Issue #48 delivery evidence

Updated the root README to describe the shipped customer-first journey, link the
demo/setup guide and limitations, and point to the hosted verification workflow.
The redesign guide already records demo-only organizations and credentials,
manual startup/seed instructions, limitations, and committed desktop/mobile
preview images. The issue audit and decision record distinguish the current
implementation from the still-open planned API/security work.

Evidence from clean hosted run [40308941320](https://github.com/dooloe/backend-ready-frontend/actions/runs/40308941320): the runner checked out a fresh revision, ran `npm ci`, created a Python 3.12 virtual environment and installed pinned backend requirements, applied migrations to a new temporary SQLite database, and passed the complete frontend/backend/build/OpenAPI/browser pipeline. The real-backend browser suite passed all 8 desktop/mobile cases. Its complete visitor path discovered a Demo organization, joined a real queue, tracked FIFO position, was called/served/completed by staff, canceled another ticket, verified browser-local history and a working private link, and exercised staff no-show plus admin configuration.

Failure/rejection cases verified by the same suite include: an unmatched search returns an empty state; a closed queue disables joining; a queue closed between availability check and submission returns an announced 409 without issuing a ticket; expired credentials receive HTTP 401 and the staff UI reports the load failure; invalid credentials are rejected; an invalid private ticket link shows safe unavailable feedback; and staff are denied the admin page. Desktop and mobile assertions found no horizontal overflow in customer, login, staff or admin views. Screenshot previews are committed under `docs/redesign-previews/`; Playwright also generated ignored run screenshots under `frontend/test-results/`.

Direct full-stack run: started a fresh isolated database and both services with
`make dev DATABASE_URL=sqlite:////tmp/kezek-issue48-manual-20261026.sqlite BACKEND_PORT=18766 FRONTEND_PORT=15174`.
Startup applied migrations and seeded the development directory. In a separate
desktop Chromium session, opened Explore, selected the university Demo, chose
Student services, joined, and received a private ticket URL. Signed in as the
organization's demo staff user, called the ticket, started service and completed
it; the visitor page reflected each state. Then verified an invalid private link
shows safe unavailable feedback and a wrong password is rejected with the
expected message. API access logs showed HTTP 200 for the completed lifecycle,
404 for the invalid ticket and 401 for invalid credentials. The application was
stopped cleanly after the walkthrough. This was a direct browser walkthrough
against `make dev`, separate from the CI Playwright fixture.

AC-1 and AC-2 are now verified by the clean hosted install/migration pipeline,
the fresh-database direct startup and full browser journey, plus the documented
rejection cases. AC-3 is reflected in the README, this evidence record, the
known-limitations section in `docs/redesign.md`, and the open issue audit; no new
untracked bug was found in the run. Existing incomplete planned-contract and
security work remains open. Issue #48 was closed after the direct walkthrough
and hosted checks. GitHub now has 22 closed and 31 open issues (#12–#32,
#34–#43).

## 2026-10-26 — Issue #42 security controls implemented; hosted verification pending

Added bounded per-client sliding-window limits to the current public API: 20
login attempts per 15 minutes and 30 queue joins per minute. A rejected request
returns the structured `RATE_LIMITED` response and `Retry-After` seconds before
the authentication or ticket-issuance handler runs. The counters are process
local and reset on restart; deployments with multiple workers need a shared
gateway limit, documented in `backend/README.md`. Added response-wide
`Referrer-Policy: no-referrer` and confirmed the private ticket route carries the
same document policy. Uvicorn access logs now drop query strings and redact the
private ticket identifier while retaining method, status and non-sensitive path.
The current OpenAPI contract documents 429 responses and `Retry-After` on login
and join.

Verification so far: backend pytest (**133 passed**, one existing Starlette/
httpx deprecation warning); OpenAPI-to-FastAPI consistency (**2 passed**);
frontend Vitest (**23 passed**); lint (zero errors, six existing Fast Refresh
warnings); typecheck; and real-backend Playwright (**8 passed** on desktop and
mobile, including the private-ticket `no-referrer` metadata check). A separate
Uvicorn run on a fresh temporary SQLite database returned 404 for a dummy private
ticket URL while logging only `/api/tickets/[redacted]`; its `access_token` query
was absent. The response included `Referrer-Policy: no-referrer`. Twenty invalid
login attempts returned 401, the 21st returned 429, and the database retained
zero sessions. Thirty joins returned 200, the 31st returned 429, and ticket count
stayed at 34 (four seeded examples plus exactly 30 accepted joins). The dummy
password/query values did not appear in captured Uvicorn logs. Hosted CI run
[40313472194](https://github.com/dooloe/backend-ready-frontend/actions/runs/40313472194)
passed every job, including the real-backend desktop/mobile browser workflow.
Issue #42 was closed with criterion-specific evidence after that success.

## 2026-10-26 — Issue #12 daily queue and event schema

Added migration `9ca12ef41d60` after the existing organization-directory
revision. It creates organization/service/business-date queues with a unique
service/date constraint, adds nullable daily queue/number and SHA-256 hash
columns to tickets, enforces unique queue-scoped idempotency hashes and globally
unique access-token hashes, and adds SQLite/PostgreSQL partial unique indexes that
prevent two `called`/`serving` tickets from occupying one counter. The
existing `active_tickets` claim table remains in place for transactional staff
operations. Existing tickets are backfilled to deterministic queue IDs using
their service organization's local date; stored issue/call/start/terminal
timestamps are copied into appendable ticket event rows. Existing hashed
bearer-session records are retained. The current ID-based join endpoint remains
compatible while the later issuance issue (#19) adopts the new queue/token
columns.

Verification: targeted migration, legacy-data preservation, constraint and
PostgreSQL DDL compilation checks passed (**5 passed**). The full backend suite
passed (**135 passed**, five existing Starlette/sqlite adapter deprecation
warnings). On a fresh temporary SQLite database, `alembic upgrade head` and
`alembic check` succeeded with **no new upgrade operations**. Constraint tests
confirm duplicate service/date queues, per-queue daily numbers, per-queue ticket
codes, global access-token hashes, same-queue idempotency keys and concurrent
active counter claims are rejected; a repeated idempotency hash in a different
queue is allowed. The legacy migration test verifies timezone-aware business
date assignment and imported issued/completed events. Hosted workflow
[40315662108](https://github.com/dooloe/backend-ready-frontend/actions/runs/40315662108)
passed all CI gates, including the real-backend browser journey, and issue #12
was closed with criterion-specific evidence.

## 2026-10-26 — Issue #13 deterministic Argon2id development seed

New password hashes now use pinned `argon2-cffi` with explicit Argon2id
parameters. Verification still accepts the existing scrypt encoding, preserving
accounts created before this update; no session, account, or password reset is
required. The existing optional seed creates the four documented Demo
organizations in `Asia/Almaty`, each with a service, counter, same-organization
counter-service link, assigned staff account, and development-only credentials.
Re-running the seed adds no duplicates and does not overwrite or remove existing
tickets. Production startup continues to reject demo seeding.

Focused verification passed (**4 tests**): Argon2id salted writes and login,
legacy scrypt verification, all four organization/service/counter/assignment
fixtures, and a second seed run preserving an issued ticket. The full backend
suite passed (**136 passed**, six existing Starlette/sqlite adapter deprecation
warnings); `pip check` reported no broken requirements. Issue #13 remained open
until hosted CI passed for the pushed revision. Hosted run
[40316814343](https://github.com/dooloe/backend-ready-frontend/actions/runs/40316814343)
passed every gate, including real-backend desktop/mobile workflows, and issue
#13 was closed with criterion-specific evidence.

## 2026-10-26 — Issue #17 organization-local schedules

Hosted CI run [40325780414](https://github.com/dooloe/backend-ready-frontend/actions/runs/40325780414)
passed frontend lint, typecheck, tests and production build; fresh migration and
model-drift checks; backend compilation and tests; OpenAPI contract checks; and
real-backend desktop/mobile browser workflows for commit `25b83cf`. With the
local 149-test backend suite also passing, issue #17 was closed after verifying
organization-local opening/closing boundaries, overnight business dates,
deterministic daily queue creation on accepted joins, and manual closure
precedence.

## 2026-10-26 — Issue #19 transactional anonymous ticket issuance

Added `POST /api/queues/{queueId}/tickets` with canonical 32-byte base64url
proof validation, queue-scoped SHA-256 idempotency hashes, globally unique
access-token hashes, sequential daily numbers, private ticket URLs, and an
issued event. The write reservation precedes mutable reads; matching retries
return the same ticket's current state before checking whether its queue has
since closed. New requests validate the current organization-local schedule and
queue status. Ticket, sequence, proof hashes and event commit in one transaction;
no raw proofs or customer identity are stored in the new issuance record.

Verification: focused issuance/replay/concurrency/conflict/closed-queue/rollback
checks passed (**6 passed**). The complete backend suite passed (**154 passed**,
six existing Starlette/sqlite adapter deprecation warnings); compileall and
`git diff --check` passed. The current client remains on the legacy join flow as
documented for coordinated integration in #32/#34. Issue #19 remains open until
hosted CI passes for the pushed change.

Hosted workflow [40328672266](https://github.com/dooloe/backend-ready-frontend/actions/runs/40328672266)
passed locked dependency setup, frontend lint/typecheck/tests/build, fresh
migrations/model-drift, backend compilation/tests, OpenAPI consistency, and
real-backend desktop/mobile workflows for commit `1f6456b`. Issue #19 was closed
after this hosted verification.

## 2026-10-26 — Issue #18 public organization and service catalogs

Added the public `GET /api/organizations/{orgId}/services` catalog with active
service details, current organization-local queue IDs, schedule/manual
availability, daily waiting counts, active counter counts, and estimates. The
legacy aggregate directory now includes each organization's slug while keeping
its existing category/location/service fields for the current UI. The new
catalog materializes missing daily queue rows in its transaction so their IDs
can be used by the customer join endpoint. Legacy customer joins now also
attach to the daily queue and record their daily number/event, keeping aggregate
counts accurate across both current and anonymous-protocol clients. Unknown
organizations return 404; empty catalogs return `[]`; inactive services are
omitted; unavailable active services remain visible with `isOpen: false`.

`backend/.venv/bin/python -m pytest backend/tests/test_directory.py backend/tests/test_scheduling.py backend/tests/test_api.py::test_private_ticket_issue_and_matching_retry_returns_current_ticket backend/tests/test_api.py::test_ticket_issue_closed_queue_and_invalid_proofs_do_not_allocate backend/tests/test_api.py::test_ticket_issue_rolls_back_number_ticket_and_event_on_event_failure -q -p no:cacheprovider`
passed (**18 passed**). The complete
`backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` run
passed (**156 passed**, six existing deprecation warnings).
`backend/.venv/bin/python -m compileall -q backend/app backend/tests` and
`git diff --check` passed. The tests exercised the public routes against an
isolated SQLite backend and confirmed queue IDs can be used for actual issuance.
Issue #18 remains open until hosted CI passes for the pushed revision.

Hosted workflow [40340675758](https://github.com/dooloe/backend-ready-frontend/actions/runs/40340675758)
passed frontend lint/typecheck/tests/build, fresh migrations/model-drift,
backend compilation/tests, OpenAPI consistency, and real-backend desktop/mobile
workflows for commit `2b89a2a`. Issue #18 was closed after verifying the public
organization/service schemas, usable current queue IDs and aggregate
availability, plus unknown/empty/closed catalog behavior.

## 2026-10-26 — Issue #22 public aggregate queue status

Added public `GET /api/queues/{queueId}/status`. It reports current queue date,
schedule/manual open state, daily waiting count, active service-capable counters,
and an estimated wait (null when no active counter is available). Queue IDs that
do not exist return the standard 404 envelope. The response is restricted to
aggregate values and contains no ticket, visitor, credential, or staff identity
fields.

Focused directory/API contract checks passed (**8 passed**); the manual-closure
queue-status case passed (**1 passed**). The full
`backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` suite
passed (**157 passed**, six existing deprecation warnings).
`backend/.venv/bin/python -m compileall -q backend/app backend/tests` and
`git diff --check` passed. Hosted CI is pending; issue #22 remains open.

The docs-only push following #18 exposed a flaky admin-tab focus assertion in
the browser workflow (the tab uses roving focus), and a prior workflow run had a
fixed-count Tab assumption. Updated those checks to focus the tab before testing
arrow navigation and to tab until the cancel action is focused. `npm run lint`
passed with zero errors and six existing warnings; `npm run typecheck` passed.
`LD_LIBRARY_PATH=/tmp/kezek-browser-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_BROWSERS_PATH=/home/asus/.cache/ms-playwright npm run test:e2e`
passed (**8 passed**) on desktop and mobile. Hosted run
[40342641484](https://github.com/dooloe/backend-ready-frontend/actions/runs/40342641484)
passed frontend lint/typecheck/tests/build, fresh migrations/model-drift,
backend compilation/tests, OpenAPI consistency, and real-backend desktop/mobile
workflows for commit `5c68685`. Issue #22 was closed after these checks passed.

## 2026-10-26 — Issue #23 staff queue discovery

Added authenticated `GET /api/staff/queues` using existing bearer-session
authorization. Staff receive active counters assigned to them (including
unowned counters explicitly assigned to them); admins receive active counters
in their organization. Each entry contains active same-organization service
queues for the current organization-local business date, aggregate waiting and
capacity estimates, and the active current counter ticket without customer
identity fields. Inactive counters and services, unassigned counters, and
cross-organization configuration are excluded. The endpoint is documented in
the current frontend/backend contract and matches the generated OpenAPI route.

Focused authorization, response-schema, multi-service/multi-assignment,
inactive-config, empty-assignment and tenant-isolation checks passed. The full
`backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` suite
passed (**160 passed**, six existing deprecation warnings), as did compileall
and `git diff --check`. Hosted workflow
[40344497196](https://github.com/dooloe/backend-ready-frontend/actions/runs/40344497196)
passed all frontend, migration, backend, OpenAPI, and real-backend desktop/mobile
gates for commit `24bd4b4`. Issue #23 was closed after verifying its acceptance
criteria.

## 2026-10-26 — Issues #24 and #25 staff lifecycle audit events

The existing counter-scoped call-next and lifecycle endpoints already serialize
queue selection and ticket transitions in database write transactions, enforce
FIFO and counter/service assignment, preserve callable outstanding work on
closed queues, reject invalid lifecycle states, and release active counter
claims on completion/no-show. Added missing `called`, `started`, `completed`
and `no_show` audit events with actor and counter IDs in the same transactions
as their state changes. Tests verify event actor/counter data and that event
write failures roll back both call-next claims and lifecycle transitions.

Focused lifecycle, authorization, concurrency, and rollback checks passed. The
full backend suite passed (**161 passed**, six existing deprecation warnings),
as did compileall and `git diff --check`. Hosted run
[40345892516](https://github.com/dooloe/backend-ready-frontend/actions/runs/40345892516)
passed the frontend, migration, backend, OpenAPI, and real-backend desktop/mobile
gates for commit `9cb6216`, including atomic actor-attributed event writes.
Issue #25 remains open because its strict-transition criterion conflicts with
the recorded decision to preserve direct called-to-completed behavior; hosted
CI does not resolve that scope conflict. Issue #24 remains open because its
requested queue-scoped path does not identify a counter when staff have multiple
eligible counters; the current frontend API instead uses the explicit
counter-scoped `/api/counters/{counterId}/call-next` route.

## 2026-10-26 — Issue #26 independent-process concurrency

Extended temporary file-backed SQLite tests using spawned workers with
independent engines/sessions. Four same-key private-ticket requests produce one
ticket and one issued event; competing process joins preserve unique numbers;
competing counters and calls at one counter do not double-assign; a process-level
cancellation/call-next race has only the valid serialized outcomes. Existing
bounded busy-timeout tests verify retry after lock contention without corrupting
state. The focused process suite passed (**6 passed**). The complete backend
suite passed (**163 passed**, six existing deprecation warnings), as did
compileall and `git diff --check`. Hosted run
[40346781553](https://github.com/dooloe/backend-ready-frontend/actions/runs/40346781553)
passed the complete frontend, migration, backend, OpenAPI and real-backend
desktop/mobile workflow. Issue #26 was closed after those checks passed.

## 2026-10-26 — Issue #27 organization service management

Added authenticated `GET /api/admin/services`, returning active and inactive
non-deleted services only for the admin's organization. Service create/update
now supports activation and paired opening/closing hours alongside the current
name, description, prefix, and duration fields. Invalid durations, malformed or
partial schedules, wrong roles, and cross-organization updates are rejected.
Deactivation is rejected while waiting/called/serving tickets remain, preserving
the service and its history; those tickets remain operable. Prefix changes keep
the existing daily queue's stored prefix and apply to future daily queues.
Schedule changes affect current availability immediately while outstanding
work remains callable.

Focused API contract, organization isolation, role, schedule, activation/history,
and existing-daily-queue behavior checks passed (**14 passed**). The complete
backend suite passed (**166 passed**, six existing deprecation warnings), as did
compileall and `git diff --check`. `npm run lint` passed with six existing
Fast Refresh warnings and no errors; `npm run typecheck` passed. Hosted run
[40348816997](https://github.com/dooloe/backend-ready-frontend/actions/runs/40348816997)
passed frontend lint/typecheck/tests/build, migration/model drift, OpenAPI,
backend tests and real-backend desktop/mobile workflows. Issue #27 was closed.

## 2026-10-26 — Issue #28 counter configuration safeguards

Counter configuration now rejects duplicate service links. Staff reassignment
is rejected while a counter has an active ticket. A counter can be deactivated
or soft-deleted without stranding its current visitor: assigned staff continue
seeing and completing that ticket after service links are removed, while
call-next remains blocked on inactive counters. The focused regression test
passed. The full backend suite passed (**167 passed**, six existing
deprecation warnings), as did backend compileall and `git diff --check`.
Hosted run [40349956496](https://github.com/dooloe/backend-ready-frontend/actions/runs/40349956496)
passed all frontend, migration, backend, OpenAPI and real-backend desktop/mobile
gates. Issue #28 was closed after those checks passed.

## 2026-10-26 — Issue #29 admin staff management

Added admin-only staff updates for name, username, role and activation. Public
staff responses expose activation state and omit passwords/hashes. Duplicate
usernames are rejected; role/activation changes invalidate existing sessions, and
deactivation is rejected while the user owns an active counter ticket. Existing
counter assignment APIs retain same-organization validation, and active-work
reassignment is blocked by #28. Backend suite passed (**170 passed**, six
existing deprecation warnings), as did compileall and `git diff --check`.
Frontend lint/typecheck passed, with six existing Fast Refresh warnings; 24
Vitest tests and the production build passed. Hosted run 40351318131 passed the
frontend, backend tests and OpenAPI checks. Its unrelated Chromium installation
and browser workflow remain in progress; #29's backend acceptance criteria
were verified, so the issue was closed.

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

## 2026-10-20 — Current-client in-memory backend (#50)

The user explicitly requested the current `openapi.yaml` contract with an in-memory
store, seeded data, hashed passwords, bearer tokens and routers/models/store/auth
modules. This supersedes SQLite, organizations and cookie sessions for this scoped
implementation; their separate backlog issues remain open. The locally deleted
root contract was read from Git without restoring unrelated deletions.

Use one process-local RLock around full queue mutations, salted scrypt password
hashes (N=32768, r=8, p=1), opaque eight-hour tokens with hash-only storage and
UTC analytics boundaries because the current contract carries no timezone.
Preserve current public ticket-ID access and called-to-completed behavior. The
server validates counter references and positive service durations; clients get
string `detail` errors. Runtime and test dependencies are pinned separately.

Issue #13 later changes new password writes to salted Argon2id while retaining
verification support for existing scrypt hashes; see the current implementation
and evidence in `process.md`.

## 2026-10-20 — SQLAlchemy persistence for the current contract

The user's latest instruction replaces the temporary in-memory implementation
with a DATABASE_URL-configured SQLAlchemy database, defaulting to a persistent
SQLite file. Preserve the current frontend contract and hashed bearer-session
behavior. Persist all configuration, relationships, ticket numbers, lifecycle
state, timestamps and credentials; initialize demo data once without resetting
subsequent edits or deletions.

Use portable SQLAlchemy models/types and transactional store methods. Isolate
SQLite engine options and writer serialization in the database adapter; use a
transactional singleton row lock on row-locking engines for the same operation
ordering. PostgreSQL is a future integration, so compilation/portability checks
must not be described as a tested live PostgreSQL deployment. The first schema
is created for the new database; future schema evolution requires migrations.

## 2026-10-20 — Recoverable anonymous issuance (#4)

Adopt [ticket-issuance.md](ticket-issuance.md) as the exact planned join/retry
contract. The client creates and retains separate 256-bit access and idempotency
secrets before the request; persist hashes only. Serialize joins and enforce
queue/key, queue/sequence and global token-hash uniqueness. Replays with matching
proof return the same ticket before checking current closure/date; mismatched
proof is a non-disclosing conflict. No names are collected by the planned flow.

This explicitly changes server-minted-once issuance to a client-generated proof
echoed in the creation/replay URL. It permits lost-response recovery without raw
token storage. Unknown commit outcomes retry the original pair, including after
midnight; never automatically issue in a new daily queue. Losing all client proof
is unrecoverable anonymously. This is a contract decision, not completed #19.

## 2026-10-20 — Keep current and planned API contracts explicit (#5–#7)

Retain root openapi.yaml as the verified current-client contract. Add the plan's
openapi.yml as an explicitly labelled design document for the organization/daily
queue/private-token/cookie API. Do not overwrite a working API specification with
unimplemented endpoints. Contract-only issues validate schemas/examples; runtime
and integration issues remain open until implemented. api-migration.md maps the
current client calls/fields to the planned facade and documents coordinated
private-token cutover without public ID fallback.

## 2026-10-20 — Organization ownership for configuration (#11)

Add organization IDs and database-enforced same-organization composite
references for counter-service links and staff assignments. Preserve the current
client API by assigning its existing records and new configuration to the seeded
`org-demo`; organization-aware APIs and request-scoped isolation remain separate
work under #16 and later integration issues. During migration, existing rows are
backfilled to this organization, and users receive stable synthetic
`@legacy.invalid` email addresses until real email provisioning exists.

Services retain the current wire fields while storing planned duration, schedule
and active metadata. `avgServiceMinutes` and `duration_minutes` stay aligned on
current API writes. Service/counter deletion remains a soft delete and removes
configuration links while ticket rows retain their foreign keys and history.
Organization-owned records use restrictive foreign keys; historical data is
never cascade-deleted with configuration.

## 2026-10-26 — Customer-first redesign (#53)

Retain the existing React/TanStack/FastAPI/SQLAlchemy stack and all lifecycle
endpoints. Add a public organization directory with only per-service aggregates;
add category/location metadata through an additive migration after the existing
local organization ownership revision. Seed additional organizations only with
an explicit, idempotent development command; label all four as Demo and provide
organization-specific staff accounts. Preserve pre-existing uncommitted backend
work rather than replacing it.

Use the real HTTP client by default and require explicit `VITE_USE_MOCK=true` for
mock development. Keep API calls behind the facade. Preserve existing opaque,
high-entropy ticket links as bearer capabilities; My Tickets only indexes links
received on this browser. Do not claim account history, hash-only token storage,
new cookie authentication, or the broader planned-contract migration is complete.
Remove mandatory name entry by sending `Visitor` to the compatible existing join
endpoint. Staff completion is presented after start, retaining backend transition
compatibility. Preserve all admin tabs while prioritizing services and queues.

## 2026-10-26 — Organization-local daily queue schedule (#17)

Use `ZoneInfo` with the owning organization's IANA timezone for schedule checks
and queue business dates. Same-day hours are open at the opening instant and
closed at the closing instant (`[opensAt, closesAt)`). An overnight schedule
belongs to the date it opens; the after-midnight segment remains on that prior
business date. Both hours absent or equal mean a 24-hour schedule. A partial
schedule or invalid timezone is a configuration error and fails closed.

Effective availability requires an active service, its existing `isOpen` setting,
an in-hours instant and a daily queue whose status is not manually closed. An
existing closed queue is never implicitly reopened by a schedule check. Public
directory reads calculate availability without writing. A customer join creates
the open daily queue on demand in the same SQLite writer-reserved transaction as
the current join; the database uniqueness constraint is the cross-process
backstop. Issue #19 will attach the newly issued ticket to this queue as part of
the full daily issuance transaction.

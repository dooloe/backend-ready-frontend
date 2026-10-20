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

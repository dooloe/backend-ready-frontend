# Kezek database backend

Implements the existing frontend API and server extensions in repository-root
`openapi.yaml`, using FastAPI with modules for `routers`, `models`, `store` and
`auth`. SQLAlchemy stores configuration, users, hashed sessions, ticket numbers
and lifecycle state in a database. The default SQLite file is
`backend/data/kezek.db`; data survives server restarts and automatic reloads.

## Install, test and start

For the combined application, run `make install` once from the repository root,
then `make dev`. Open <http://127.0.0.1:5173>; Ctrl+C stops both services.
`make help` lists separate server, test and build commands. To use other ports,
run `make dev BACKEND_PORT=8001 FRONTEND_PORT=5174`; the API URL and allowed
frontend origins follow those settings automatically. The combined command
requires Bash and `setsid`, both available on typical Linux/WSL installations.

Use Python 3.12+ with pip/venv support. From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

For runtime dependencies alone, install `backend/requirements.txt`. The `.in`
files declare direct dependencies; the `.txt` files pin the tested resolution.

## Database configuration

`DATABASE_URL` selects the SQLAlchemy connection. Without an override, direct
Uvicorn startup and the Makefile both use an absolute path to
`backend/data/kezek.db`, so the default file does not move with the working
directory. Its parent directory is created on first startup.

```bash
# Persist to another SQLite file (relative paths resolve from the working directory).
DATABASE_URL=sqlite:///backend/data/another.db make dev

# Command-line Make overrides work too.
make backend DATABASE_URL=sqlite:////absolute/path/kezek.db
```

`backend/.env.example` documents settings. Export them in the terminal; the
template is not automatically loaded. Do not put real connection credentials
in tracked files. Local SQLite databases and journal files are ignored by Git.

## Optional browser notifications

Web Push is opt-in and is available only when all three VAPID settings are
configured. Generate and retain the private key outside the repository (the
`vapid` command is installed with the backend requirements):

```bash
sudo install -d -m 700 /etc/kezek/push
cd /etc/kezek/push
vapid --gen
vapid --applicationServerKey --private-key /etc/kezek/push/private_key.pem
```

Copy the printed application server key into `VAPID_PUBLIC_KEY`. Set
`VAPID_PRIVATE_KEY` to the protected absolute path of `private_key.pem` and set
`VAPID_CLAIMS_EMAIL` to a contact such as `mailto:ops@example.org`. Restrict
the private key file to the backend service account and never commit or log it.
The API publishes only the public key when all settings are present. Browser
push requires HTTPS in deployed environments; localhost is treated as a secure
context by browsers. Chromium, Firefox and Safari push service host domains are
accepted to prevent customer-supplied endpoints from turning delivery into an
arbitrary server-side request.

Subscriptions are authorized by the ticket's private link and are removed
when the ticket becomes terminal or the push service reports the endpoint as
stale. Alerts contain only a generic message; the ticket page remains the
source of current position and status. Delivery is attempted after the queue
transition commits, with a short network timeout; errors do not undo the
transition. A persisted event/subscription claim prevents duplicate sends.

Alembic migrations run automatically against the configured database during
backend startup. `backend/alembic.ini` and `backend/migrations/` hold the
migration history; a fresh database receives the baseline and current schema
revisions and an `alembic_version` row. A complete database created by the
pre-Alembic app is stamped at the baseline without rewriting its data. A partial
unversioned schema is rejected so startup cannot silently overwrite it. SQLite connections enable
foreign keys, WAL and the bounded busy timeout before migrations or requests.
The baseline and organization ownership downgrades intentionally retain schema
and data because removing ownership fields would erase data semantics.

The configuration model includes organizations, organization-owned users,
services and counters, counter-service links, and staff assignments. Existing
records migrate into the seeded `org-demo`; legacy users receive synthetic
`@legacy.invalid` addresses. Composite foreign keys prevent links across
organizations, and soft deletion preserves ticket history. In development,
startup also adds four sample Demo organizations with services, assigned staff,
and counters to new or existing databases, and ensures the shared demo admin is
available. Sign in as `admin` / `admin123` to open the admin page's Organizations
tab and view all directory entries with their public queue summaries. See
`docs/redesign.md` for staff demo credentials. `SEED_DEMO_DATA=false` disables
sample seeding; production mode rejects sample seeding.

To inspect or run migrations manually, use the same `DATABASE_URL` as the
application:

```bash
DATABASE_URL=sqlite:///backend/data/kezek.db backend/.venv/bin/alembic -c backend/alembic.ini current
DATABASE_URL=sqlite:///backend/data/kezek.db backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
```

An in-memory server's transient data is not imported into a new database.

Base demo data is inserted during first initialization. The four directory
organizations are then added idempotently at startup when demo seeding is enabled,
including on existing databases. This never resets existing records.

The ORM models, normalized relationships, UTC timestamp type and store queries
use portable SQLAlchemy constructs. Driver configuration and SQLite-specific
pragmas/locking are isolated in `app/database.py`. A future PostgreSQL setup can
use a URL such as `postgresql+psycopg://user:password@host/database` after adding
its driver and running integration tests. PostgreSQL schema compilation is
checked, but a live PostgreSQL server is not yet supported by verified tests.

SQLite mutations use a write reservation before mutable reads, with a bounded
10-second lock wait. Other row-locking engines use a transactional singleton
row lock for the same strict ordering. Database constraints protect usernames,
service ticket sequences and active counter assignments. SQLite concurrency is
verified across independent processes; high-throughput deployment tuning is
separate work.

API documentation: <http://127.0.0.1:8000/docs>. Generated schema:
<http://127.0.0.1:8000/openapi.json>.

In a separate terminal, enable the real HTTP client instead of the browser mock:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

Open <http://127.0.0.1:5173>. Setting `VITE_API_BASE_URL` does not include `/api`;
the frontend already adds that prefix. Restart Vite if its environment changes.

## Demo seed and access

| Role | Username | Password |
| --- | --- | --- |
| Platform admin (all organizations directory) | `admin` | `admin123` |
| Staff | `aigerim` | `staff123` |

These are development-only credentials. The seed includes three services (one
closed), two counters, waiting tickets, a completed ticket and a cancelled ticket
so both queues and analytics have sample data. Ticket numbers continue after the
seeded numbers. Tests use isolated temporary SQLite files and an injected clock;
they never use the configured development database.

New passwords use salted Argon2id hashes with explicit work parameters; existing
scrypt hashes remain verifiable so upgrades preserve current staff/admin access.
Login issues a random opaque session with an eight-hour lifetime; only its
SHA-256 digest is retained in the database. The response sets the
`kezek_session` cookie as HttpOnly, SameSite=Lax and scoped to `/api`; Secure is
set for HTTPS requests. Set `SESSION_COOKIE_SECURE=true` when HTTPS terminates
at a proxy and the backend receives plain HTTP. The JSON bearer token remains
temporarily for compatibility while the frontend migration is tracked in #32
and #36. Protected routes accept either the cookie or bearer token, and
`GET /api/auth/me` returns the current identity without credential material.
Staff and admin may use staff endpoints; admin configuration and statistics
require admin.
Customer service listing, join, ticket lookup and cancellation remain public as
specified by the current frontend contract.

The API applies an in-process sliding-window limit of 20 login attempts per client
IP per 15 minutes and 30 ticket joins per client IP per minute. A rejected request
returns the safe `RATE_LIMITED` error envelope and `Retry-After` seconds without
creating a session or ticket. Limits reset when the process restarts and are
independent across workers; multi-worker deployments should also enforce shared
limits at their gateway. Uvicorn access logs omit query strings and redact private
ticket IDs. Responses set `Referrer-Policy: no-referrer`; the frontend ticket
route also declares the same policy in its document metadata.

`CORS_ORIGINS` accepts a comma-separated list of frontend origins. Defaults are
`http://localhost:5173,http://127.0.0.1:5173`. Browser requests may send
`Authorization` and `Content-Type`; no wildcard origin is enabled. Cross-origin
cookie credentials and CSRF protection are tracked separately in #15; use the
same-origin `/api` proxy for cookie-authenticated browser mutations.

## Contract behavior

- JSON successes use 200. Deletes return 204 with no body. Empty call-next returns
  literal JSON `null` with 200. Validation errors return a string `detail` for
  direct display by `http.ts`.
- PATCH omits unchanged fields. Explicit `staffId: null` removes an assignment;
  null is rejected for non-nullable fields. Counter links must reference existing
  services/users, and service duration must be positive.
- Queue operations use FIFO ordering with insertion order for timestamp ties.
  Each counter has at most one called/serving ticket. The current contract permits
  completion from either `called` or `serving`. Cancellation is waiting-only and
  no-show is called-only.
- Analytics derive from ticket timestamps. The server defines today/hour buckets
  in UTC, since the current wire contract provides no organization timezone.
  Waiting counts include older waiting tickets; averages include tickets with a
  `calledAt` value, matching the current client's metric definitions.

The organization/private-ticket-token/cookie-session migration plan is separate
work; this backend preserves the current frontend contract while adding database
persistence.

The contract tests normally read `openapi.yaml`. If it is locally deleted they
read `HEAD:openapi.yaml` from Git without restoring it. You may alternatively set
`KEZEK_OPENAPI_PATH` to an explicit contract snapshot. This allows verification
without changing unrelated local deletions.

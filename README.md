# Kezek — virtual queues for Kazakhstan

Kezek helps visitors discover participating organizations, check service queues,
join without an account, and follow a private digital ticket. The customer
experience and staff queue workflow use the existing React/TanStack frontend,
FastAPI API and SQLAlchemy-backed database. PostgreSQL is the container runtime;
SQLite remains the local development default. Development startup includes clearly
labeled demo organizations; they are examples, not real service providers.

See the [customer journey and demo credentials](docs/redesign.md),
[current implementation and known limitations](docs/issue-audit.md),
[architecture](docs/architecture.md), and [product plan](docs/plan.md).

## Local setup

Use Linux/WSL with Bash, `make`, `setsid` (util-linux), Python 3.12+ with pip/venv,
and Node.js 22.12+ with npm. From the repository root:

```sh
make install
make dev
```

Open the customer site at <http://127.0.0.1:5173>. Staff/admin sign-in is served
at <http://localhost:5173>. These hostnames resolve to this machine locally but
use separate browser cookie jars. `make dev` prints both addresses. API docs:
<http://127.0.0.1:8000/docs>.
Ctrl+C stops both servers. `make help` lists commands; custom ports work with
`make dev BACKEND_PORT=8001 FRONTEND_PORT=5174`.

For separate terminals and all configuration details, see
[backend setup](backend/README.md) and [frontend development](frontend/README.md).
Vite proxies same-origin `/api` requests to `http://127.0.0.1:8000` by default.
Set `VITE_API_BASE_URL` only when connecting directly to a separately hosted
backend with explicit credentialed CORS. Browser-local mock mode requires
explicit `VITE_USE_MOCK=true` for isolated UI development.

`DATABASE_URL` selects the database, defaulting to `backend/data/kezek.db`.
Export environment settings from [the example](backend/.env.example); it is not
automatically loaded. Both SQLite and PostgreSQL are supported. Startup applies Alembic migrations without resetting existing data. With
`APP_ENV=development` and `SEED_DEMO_DATA=true`, startup adds any missing Demo
organizations and staff accounts to new and existing databases.

The customer-first redesign adds Explore, organization services, confirmed joining,
digital tickets and browser-local My Tickets. See [redesign setup and verification](docs/redesign.md).
To add the four-category demo directory to your development database manually:

```sh
cd backend
.venv/bin/python seed_directory.py
```

All sample organizations are labeled Demo. Existing organizations and tickets remain intact. Staff demo accounts are listed in [the local demo guide](docs/redesign.md).

## Docker with PostgreSQL

The Compose stack builds the frontend and Python API into one application image
and runs PostgreSQL as its persistent database. Choose a URL-safe password for
this Compose configuration and export it before starting:

```sh
export POSTGRES_PASSWORD='choose-a-long-url-safe-password'
docker compose up -d --build
```

By default, open the customer site at <http://127.0.0.1:8000> and staff/admin at
<http://localhost:8000>. For use from other devices, assign two DNS names (or
host aliases on every client device) to the server's IP, then build with those
browser-visible origins. For example, if the server IP is `172.22.159.149` and
the aliases `kezek.local` and `kezek-admin.local` both resolve to it:

```sh
export CUSTOMER_ORIGIN='http://kezek.local:8000'
export ADMIN_ORIGIN='http://kezek-admin.local:8000'
docker compose up -d --build
```

The frontend origins are build arguments, so rebuild after changing them. Make
the admin hostname available to intended staff. FastAPI serves the generated
frontend and `/api` from the same origin. The named `postgres-data` volume
survives app and database
container recreation; `docker compose down -v` intentionally deletes it. Set
`APP_ENV=production` and `SEED_DEMO_DATA=false` for production deployments, and
run the secure first-time catalog/account bootstrap with the production database
URL before opening the site to visitors. The command creates the requested
Almaty University and City Health Clinic records and prompts for account
passwords without echoing them. For this Compose image, run
`docker compose exec -it app python provision_production.py`; for a remotely
hosted database, run `backend/provision_production.py` from a trusted checkout
with the database URL supplied through a private environment setting. See the
[production bootstrap details](backend/README.md#production-organization-and-account-bootstrap).

## Render deployment

Render deploys the application image from `Dockerfile` and PostgreSQL as a
separate managed service. In Render, create a Blueprint from this repository and
select `render.yaml`; it configures both resources on the Free plans and uses
the app's Render-provided `onrender.com` hostname. Do not upgrade either
resource if you want to keep this deployment free. Free web services sleep
after 15 minutes without requests, and free Render Postgres is limited to 1 GB,
has no backups, and expires 30 days after creation. This is suitable for a
short demo, not durable production data.

After the first deploy is healthy, copy the database's **External Database
URL** from the Render dashboard. Render Free web services do not provide shell
access, so run the bootstrap from a trusted local checkout, entering that URL
at a hidden prompt:

```sh
read -rsp 'Render external DATABASE_URL: ' DATABASE_URL; echo
export DATABASE_URL APP_ENV=production SEED_DEMO_DATA=false
backend/.venv/bin/python backend/provision_production.py
unset DATABASE_URL
```

The script then prompts privately for the initial account passwords. See the
[Render free plan limits](https://render.com/docs/free) and the [production
bootstrap instructions](backend/README.md#production-organization-and-account-bootstrap).

To change the password of an existing Render admin, use the same hidden
External Database URL prompt and run
`backend/.venv/bin/python backend/update_admin_password.py`. Set
`APP_ENV=production` and `SEED_DEMO_DATA=false` first. The command verifies
that the target is an existing active account with the `admin` role in
Render's PostgreSQL database named `kezek`. It prints only account IDs,
usernames, roles, and active status; if there is more than one candidate, it
requires an exact username or ID selection. It updates only the selected
account's password hash and revokes that account's sessions. It refuses to
create an account or change its role/status.

### Import an existing SQLite database

The importer takes a consistent SQLite online-backup snapshot, migrates that
snapshot, validates its integrity and foreign keys, then copies all application
records in a transaction to an empty PostgreSQL database. It never writes to or
deletes the original SQLite file. Keep a separate backup before migration.
Import before starting the app for the first time, because the importer refuses
to merge into a database that already has application records:

```sh
export POSTGRES_PASSWORD='choose-a-long-url-safe-password'
docker compose up -d db
docker compose run --build --rm \
  -v "$PWD/backend/data/kezek.db:/import/kezek.db:ro" \
  --entrypoint python app -m app.sqlite_import --source /import/kezek.db
docker compose up -d app
```

After verifying the new deployment, retain the SQLite database and its backup
according to your data-retention policy. Do not use `docker compose down -v` on
a volume containing data you need.

The backend has a live PostgreSQL integration test. The dedicated Playwright
workflow starts an isolated Compose project, creates a customer ticket through
the served frontend, recreates the app and PostgreSQL containers, and confirms
the private ticket still loads. Run it with `bash scripts/test-postgres-e2e.sh`;
it removes only the uniquely named test project's volume when it exits.

## Verification and contributor workflow

```sh
make test
npm --prefix frontend run lint
npm --prefix frontend run typecheck
make build
python3 -m unittest discover -s scripts/tests -v
```

Tests isolate their SQLite files from development data. Frontend route/mock tests
and API tests do not replace required browser workflows. See
[process and actual results](docs/process.md) and [decisions](docs/decisions.md).

The hosted [GitHub Actions workflow](https://github.com/dooloe/backend-ready-frontend/actions/workflows/ci.yml)
installs locked dependencies on a clean runner, checks migrations and API
contracts, runs frontend/backend checks, and exercises the real-backend visitor
journey in desktop and mobile Chromium. The customer-first pages are also shown
in the [redesign previews](docs/redesign-previews/).

Read [AGENTS.md](AGENTS.md) first. Find an existing
[MVP issue](https://github.com/dooloe/backend-ready-frontend/issues?q=is%3Aopen+label%3Amvp)
before implementation, work in dependency order, and verify every acceptance
criterion, including rejected actions. Record exact commands, outcomes and any
limitations in `docs/process.md`; commit scoped changes with the issue number,
push normal commits, and post evidence before closing. Incomplete work stays open.
[Issue workflow](docs/issue-automation.md) describes approved direct GitHub access;
the manual scripts are retained only as a fallback. Never repeat authentication
or force-push shared history.

The selected routing deviation keeps TanStack instead of replacing it with React
Router. Preserve the existing `frontend/`, `backend/`, `docs/` layout. Current API
documentation is [openapi.yaml](openapi.yaml). The [planned MVP contract](openapi.yml)
is design work until implemented; [the migration map](docs/api-migration.md)
explains the differences. See [discussion notes](docs/chat-brainstorm.md).

## Build with Lovable

This project was built with [Lovable](https://lovable.dev). Continue developing in
[the Lovable editor](https://lovable.dev/projects/0ed83b3b-7020-468a-9cd1-e86f39874079).
Commits pushed to the connected branch sync to its editor. Preserve published
history; do not force-push or amend/rebase published commits.

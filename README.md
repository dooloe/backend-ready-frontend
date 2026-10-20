# Backend Ready Frontend — Kezek

Virtual queue demo with a React/TypeScript frontend, TanStack Router/Start,
FastAPI and SQLAlchemy. SQLite persists tickets, configuration and hashed bearer
sessions. The current client contract works; the full organization/private-ticket/
cookie-session MVP is still being implemented. See [requirements](docs/plan.md),
[architecture](docs/architecture.md) and [verified issue audit](docs/issue-audit.md).

## Local setup

Use Linux/WSL with Bash, `make`, `setsid` (util-linux), Python 3.12+ with pip/venv,
and Node.js 22.12+ with npm. From the repository root:

```sh
make install
make dev
```

Open <http://127.0.0.1:5173>. API docs: <http://127.0.0.1:8000/docs>.
Ctrl+C stops both servers. `make help` lists commands; custom ports work with
`make dev BACKEND_PORT=8001 FRONTEND_PORT=5174`.

For separate terminals and all configuration details, see
[backend setup](backend/README.md) and [frontend development](frontend/README.md).
The combined Makefile command sets `VITE_API_BASE_URL`; launching Vite without
that variable still uses the separate browser-local mock data.

`DATABASE_URL` selects the database, defaulting to `backend/data/kezek.db`.
Export environment settings from [the example](backend/.env.example); it is not
automatically loaded. SQLite is tested; PostgreSQL driver integration is future
work. Existing databases are not reset at startup. Development-only seed accounts:
`admin / admin123` and `aigerim / staff123`; seeding happens once for a new DB.
Current schema initialization uses SQLAlchemy; Alembic migration work is #10.

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

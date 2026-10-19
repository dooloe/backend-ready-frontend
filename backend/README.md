# Kezek in-memory backend

Implements the current frontend's 20 operations from repository-root
`openapi.yaml`, using FastAPI with modules for `routers`, `models`, `store` and
`auth`. This is a single-process demo: restarting the application resets all
records and sessions. Run one Uvicorn worker so every request shares the store.

## Install, test and start

Use Python 3.12+ with pip/venv support. From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
```

For runtime dependencies alone, install `backend/requirements.txt`. The `.in`
files declare direct dependencies; the `.txt` files pin the tested resolution.

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
| Admin | `admin` | `admin123` |
| Staff | `aigerim` | `staff123` |

These are development-only credentials. The seed includes three services (one
closed), two counters, waiting tickets, a completed ticket and a cancelled ticket
so both queues and analytics have sample data. Ticket numbers continue after the
seeded numbers. Tests use separate app/store instances and an injected clock.

Passwords use salted scrypt hashes. Login returns a random bearer token with an
eight-hour lifetime; only its SHA-256 digest is retained in the store. Staff and
admin may use staff endpoints; admin configuration and statistics require admin.
Customer service listing, join, ticket lookup and cancellation remain public as
specified by the current frontend contract. No cookie session is used.

`CORS_ORIGINS` accepts a comma-separated list of frontend origins. Defaults are
`http://localhost:5173,http://127.0.0.1:5173`. Browser requests may send
`Authorization` and `Content-Type`; no wildcard origin is enabled.

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

The older SQLite/organization/private-ticket-token/cookie-session plan is separate
work; this task implements the explicitly requested current-client in-memory API.

The contract tests normally read `openapi.yaml`. If it is locally deleted they
read `HEAD:openapi.yaml` from Git without restoring it. You may alternatively set
`KEZEK_OPENAPI_PATH` to an explicit contract snapshot. This allows verification
without changing unrelated local deletions.

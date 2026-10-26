# Customer-first Kezek redesign

The existing TanStack React application, API facade, FastAPI routers, SQLAlchemy
store and SQLite database remain in use. Explore is now the customer entry point.
This work is tracked in [issue #53](https://github.com/dooloe/backend-ready-frontend/issues/53).

## Customer journey

- `/`: search organizations, services and cities; filter the four organization categories.
  Cards display backend availability and minimum available wait estimates.
- `/organizations/$id`: organization description, category, location, timezone,
  service hours, waiting counts, estimates and open/closed join actions.
- `/join/$organizationId/$serviceId`: live availability and an explicit confirmation.
  No name form or account is required. The existing API still requires a name, so
  the client sends the non-identifying label `Visitor` for compatibility.
- `/ticket/$id`: all six existing ticket states, people ahead (backend position
  minus one), approximate wait, assigned counter, timestamp updates, private-link
  copy and confirmed cancellation. Active tickets poll every five seconds;
  terminal tickets stop polling. Failed refreshes retain labeled stale data.
- `/tickets`: only capabilities saved by this browser after issuance or opening a
  working ticket link. No public list of tickets or account-based history exists.
  Clearing browser storage removes this index; saved private URLs still work.

Staff retain their assigned/unassigned-counter permissions and server-selected FIFO
order. The interface highlights the current ticket, waiting count and next ticket;
completion appears after service starts. No-show requires confirmation. Admin
services/queues are the initial tab; counters, analytics and existing staff setup
remain accessible. Deletes require confirmation. Signing in/out clears query data.

## API and database changes

`KezekApi`, the HTTP adapter, development mock and implemented `openapi.yaml` now
include `listOrganizations` (`GET /api/organizations`) and `getOrganization`
(`GET /api/organizations/{id}`). Public responses contain organization metadata and
per-service aggregates, never ticket IDs, ticket records, customer names or staff
information. The previous services and lifecycle endpoints are retained.

Migration `e48f901cd256` follows the already-present local organization ownership
migration `d0dce8f73d88`. It adds organization category and nullable location with
safe defaults. Existing descriptions, configuration, ticket records and sessions
remain intact. Hours derive from persisted service schedules; missing hours and
locations are displayed as unavailable rather than invented.

The real HTTP backend is the default at `http://localhost:8000`. Override with
`VITE_API_BASE_URL`. Mock mode now requires explicit `VITE_USE_MOCK=true`; it is
only for isolated development. All UI operations still pass through `api`.

## Development directory

Normal `make dev` startup automatically and idempotently adds four explicitly
labeled Demo organizations to both fresh and already initialized development
databases when `SEED_DEMO_DATA=true`. It preserves existing records. To seed
manually after installation, run from `backend/`:

```sh
.venv/bin/python seed_directory.py
```

Production startup refuses demo seeding. They represent universities, clinics, government services and service centers,
not actual participating providers. Each has its own staff login:

| Organization | Staff username | Development password |
| --- | --- | --- |
| Almaty University · Demo | demo-staff-university | staff123 |
| City Health Clinic · Demo | demo-staff-clinic | staff123 |
| Citizen Service Office · Demo | demo-staff-government | staff123 |
| Community Service Center · Demo | demo-staff-center | staff123 |

Existing seeded default-organization credentials remain `admin / admin123` and
`aigerim / staff123`. Demo seeding is intended for development databases only.
Seeded passwords are stored as salted Argon2id hashes; existing scrypt hashes
remain verifiable for accounts created before this change.

## Verification

```sh
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider
cd frontend
npx playwright install chromium --only-shell
npm run test:e2e
```

The Playwright fixture launches the real frontend and API on ports 15173 and
18765, migrates a fresh temporary SQLite database, adds demo organizations, and
removes the temporary database on shutdown. It does not reuse a running server
or developer database. Desktop and mobile Chromium cover discovery/search,
confirmation/join, FIFO position changes, staff call/start/complete, cancellation,
no-show, local history isolation, private-link recovery, login rejection, admin
service creation/closure/deletion, closed states and keyboard navigation.
Screenshots/traces are generated under ignored `frontend/test-results/`.
Actual results are recorded in `docs/process.md`.

## Existing limitations retained

Private links currently use existing high-entropy random ticket IDs (144 random
bits), which function as bearer capabilities. They must be kept private. This
redesign does not claim the separately planned hash-only access-token migration,
cookie-session authentication, join idempotency, daily queue numbering, rate
limiting or complete organization-scoped administration are implemented. Those
backlog issues stay open. No account-wide history or notification delivery is
promised. Live updates require keeping a ticket page open.

The existing queue `isOpen` flag controls availability; this change displays
configured hours but does not introduce automatic schedule enforcement. Wait
estimates are approximate and unavailable without eligible active counters.
Demo organizations have distinct staff accounts so their queues can be served
without bypassing existing organization checks.

Reviewed previews: [desktop Explore](redesign-previews/explore-desktop.png),
[mobile Explore](redesign-previews/explore-mobile.png),
[mobile ticket](redesign-previews/ticket-mobile.png).

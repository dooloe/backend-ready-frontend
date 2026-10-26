# Frontend development

Use Node.js 22.12 or newer and npm. Run these commands from `frontend/`:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm ci` installs the committed lockfile. `typecheck` checks the whole application
with the strict settings in `tsconfig.json`; the Vite build alone does not check
TypeScript. `npm test` runs the existing route and mock API tests once. Lint also
checks Prettier formatting. Existing Fast Refresh warnings are
non-failing and remain visible.

For local development against the running FastAPI backend:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Set `VITE_API_BASE_URL` for builds too when connecting a built frontend to the
backend. The default backend origin is `http://localhost:8000`. Browser-local mocks
require explicit `VITE_USE_MOCK=true` and have separate data and login state.
See [backend setup](../backend/README.md) for the API, SQLite connection settings
and development accounts.

The tests above do not provide browser verification against the real backend.
The remaining MVP requirements and browser coverage are tracked in GitHub issues
and [the project plan](../docs/plan.md).


## Customer-first redesign

The customer routes are `/`, `/organizations/$id`, `/join/$organizationId/$serviceId`,
`/ticket/$id` and `/tickets`. Staff/admin routes retain existing operations.
The real HTTP client is the default (`http://localhost:8000`); set
`VITE_API_BASE_URL` for another backend or `VITE_USE_MOCK=true` for explicit UI-only
mock development. Never use mock results as evidence for backend functionality.

`npm run test:e2e` runs desktop and mobile Chromium workflows with both servers,
a freshly migrated temporary SQLite file and the seeded demo directory. Install
Chromium first with `npx playwright install chromium --only-shell` and ensure its
OS dependencies are installed. Ports 15173 and 18765 must be free. The fixture
never opens the development database. Screenshots and traces are in ignored
`test-results/`; see `../docs/redesign.md` for scope and limitations.

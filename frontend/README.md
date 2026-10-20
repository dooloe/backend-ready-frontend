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
checks Prettier formatting. Existing Fast Refresh and staff hook warnings are
non-failing and remain visible.

For local development against the running FastAPI backend:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Set `VITE_API_BASE_URL` for builds too when connecting a built frontend to the
backend. Without this setting the application uses browser-local mocks, including
their separate data and login state. See [backend setup](../backend/README.md) for
the API, SQLite connection settings and development accounts.

The tests above do not provide browser verification against the real backend.
The remaining MVP requirements and browser coverage are tracked in GitHub issues
and [the project plan](../docs/plan.md).

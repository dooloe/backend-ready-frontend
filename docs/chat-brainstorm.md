# Product discussion and implementation notes

These are decisions from the recorded project work, not a verbatim transcript.

- Keep the existing React/TypeScript frontend, TanStack routing and repository
  layout. FastAPI plus SQLAlchemy and SQLite is the selected backend stack;
  [architecture](architecture.md) records the intended full MVP.
- The original [mock-only specification](spec.md) was followed by explicit user
  requests for a real API, authentication, local commands and database persistence.
  Those current-client features were verified in #49–#52. Broader organization,
  daily queue, private token and cookie session requirements remain in
  [the plan](plan.md) and the open issue backlog.
- Use approved direct outside-sandbox GitHub CLI operations. Do not repeatedly
  request authentication. Read full issue acceptance criteria, work in dependency
  order, record actual checks in [process.md](process.md), and close only verified
  completed work. Do not generate extra issues to inflate counts.
- `DATABASE_URL` selects the database. SQLite is the verified local/demo choice;
  PostgreSQL needs a driver and live integration tests. Preserve working data and
  use isolated test databases. Alembic is planned for schema evolution.
- Investigate locally deleted contributor/setup/contract files before repairing
  them. The follow-up audit found intact committed versions and no replacements;
  restoring required files is reversible. Preserve unrelated local changes.

Upcoming design questions are tracked as existing issues: issuance response-loss
recovery (#4), public/auth/admin API reconciliation (#5–#7), page states (#8),
organization-local scheduling (#17) and active-work configuration changes
(#27–#29). Their resolution belongs in [decisions.md](decisions.md), with concrete
request examples and rejected cases before implementing dependent behavior.

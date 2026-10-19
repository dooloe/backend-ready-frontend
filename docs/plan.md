# Kezek — AI-Agent Implementation Plan

**Project:** Kezek — Virtual Queue Management System  
**Status:** MVP planning  
**Primary goal:** Deliver a tested, working full-stack web application for virtual queue management.  
**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui; FastAPI + Python + SQLAlchemy + SQLite; REST/OpenAPI; Pytest + Vitest + Playwright.  
**Source of truth:** This plan defines the intended MVP. Record justified deviations in `docs/decisions.md` before implementation. Never claim an unimplemented feature is complete.

## 1. Mission and success criteria

Kezek allows customers to join service queues without an account, receive a private digital ticket, see their position and estimated wait, and cancel before being served. Authenticated staff manage tickets at assigned service counters. Administrators configure services, counters, and staff and inspect basic operational analytics.

**MVP is successful only when:**
1. A customer selects an active service, joins its open daily queue, and receives a unique ticket link and human-readable number.
2. The customer ticket view refreshes automatically and shows authoritative status, people ahead, and an estimated wait or an explicit unavailable state.
3. Staff can safely call the next ticket, start service, mark completed, or mark a called ticket no-show.
4. Admins can manage services, counters, counter-service associations, and staff assignments, and see analytics based on stored timestamps.
5. Role and organization permissions are enforced on the backend.
6. Data persists through restarts; concurrent calls never assign the same waiting ticket twice; ticket numbers never collide within a queue.
7. Required automated and browser smoke tests pass, and all actual MVP issues are closed only after verification.

## 2. MVP boundaries and assumptions

### In scope
- Multiple organizations supported **in the database model**, with seeded demo organization(s); no public organization signup flow.
- Three roles: anonymous customer; authenticated `staff`; authenticated `admin`.
- Customer service directory, join queue, private ticket link, status polling, cancellation.
- One queue per service per local business date; admin-configurable queue opening and closing hours (simple daily schedule; use organization's timezone).
- Staff assigned to counters; counters can serve one or more services. Each counter handles at most one `CALLED` or `SERVING` ticket at once.
- Queue-first FIFO ordering within a service; skip inactive/finalized tickets. No priority queues, appointment booking, or ticket transfers.
- Basic statistics: issued today, waiting, completed, mean completed-ticket waiting time, mean service duration, counts per service.
- Local/demo deployment with a reproducible setup, seeded accounts, and documented environment variables.

### Out of scope (post-MVP)
- SMS, WhatsApp, email or push notifications; QR scanning; appointment scheduling; payments; complex predictive analytics; multi-branch UI; kiosk hardware; customer accounts; multi-language localization; hosted production operations.

### Clarifying product decisions to implement consistently
- **Anonymous tickets:** return a high-entropy random ticket access token **once** on creation. Store only its hash in the database. The private URL contains the raw token. Never expose ticket ID/status by a guessable public URL. Customer cancellation uses the same token.
- **Ticket numbering:** prefix + sequential daily service number, e.g. `A-023`. Sequence must be unique within a *queue* and created in the same transaction as the ticket.
- **Customer identity:** with anonymous access there is no reliable global deduplication. Prevent rapid repeat submissions in the client and support a server-side idempotency key on join. Do not promise absolute same-person deduplication.
- **Live updates:** polling every ~5 seconds for MVP, not WebSockets. Display last refresh/failure state; stop needless polling for terminal tickets.
- **Wait estimates:** an approximation, not a promise. Use number of waiting tickets ahead × typical service duration ÷ available service-capable active counters, round to a reasonable whole minute. If no available/active counters or insufficient duration data, return `null` and display “Currently unavailable.” The UI must label the result as estimated.
- **Organization-local dates:** store timestamps in UTC and convert to the organization's IANA timezone for daily queues and reporting. Default seed timezone `Asia/Almaty`.
- **Status lifecycle:** `WAITING -> CALLED -> SERVING -> COMPLETED`; alternatives `WAITING -> CANCELLED` and `CALLED -> NO_SHOW`. No other transitions in MVP. Staff cannot call a second ticket at the same counter while one is `CALLED` or `SERVING`.
- **Queue closed:** reject new joins when queue is outside its service hours or manually closed. Existing tickets remain viewable; staff can finish outstanding work.

## 3. Architecture and engineering standards

- **Frontend:** React, TypeScript strict mode, Vite, React Router, Tailwind, shadcn/ui; feature-oriented modules (`customer`, `staff`, `admin`, `auth`). Central typed API client. Accessible, mobile-first UI.
- **Backend:** FastAPI; Pydantic request/response models; SQLAlchemy 2.x ORM; Alembic migrations; SQLite with foreign keys enabled. Separate router → service → repository layers. Authorization and state transitions in services, never trusted to the frontend.
- **API:** `/api` prefix, versioning decision documented; keep `openapi.yml` synchronized with FastAPI-generated schema. Stable structured errors (code, message, details). Validate all mutations.
- **Authentication:** staff/admin login with securely hashed passwords (Argon2id preferred); use secure server-managed sessions with HttpOnly SameSite cookies and CSRF protection for cookie-authenticated mutations, or a carefully documented secure token approach. No hard-coded production secrets. Rate-limit login where practical.
- **Data security:** never log private ticket tokens/passwords. Mask personally identifying data (MVP should not collect customer names or phone numbers). Validate and sanitize inputs; enforce organization boundaries and roles in every protected route.
- **Concurrency:** use SQLite transactions with appropriate locking/writer serialization and database uniqueness constraints for atomic join/call operations. Add parallel-request tests. SQLite is appropriate for MVP demos, not a high-throughput multi-instance production deployment.
- **Quality:** formatting/linting, TypeScript checks, backend typing where practical, unit/integration/E2E tests. No mock frontend API in the final integrated app. Seed deterministic demo data.
- **Test safety:** isolated temporary SQLite database per test suite or test, never staging/production data.

## 4. Data model (minimum)

| Entity | Required fields / notes |
|---|---|
| `organizations` | `id`, `name`, `slug` unique, `description`, `timezone` |
| `users` | `id`, `organization_id`, `email` unique, `password_hash`, `role` (`staff`/`admin`), `is_active` |
| `services` | `id`, `organization_id`, `name`, `description`, `prefix`, `duration_minutes`, `opens_at`, `closes_at`, `is_active` |
| `counters` | `id`, `organization_id`, `name`, `is_active` |
| `counter_services` | `counter_id`, `service_id`, unique pair; validate same organization |
| `staff_assignments` | `user_id`, `counter_id`, unique pair; validate same organization |
| `queues` | `id`, `service_id`, `queue_date` (organization-local), `is_open`, `next_sequence`; unique (`service_id`, `queue_date`) |
| `tickets` | `id`, `queue_id`, `sequence_number`, `ticket_number`, `access_token_hash` unique, `status`, `counter_id` nullable, `created_at`, `called_at`, `started_at`, `completed_at`, `cancelled_at`, `no_show_at`, `idempotency_key` nullable; unique (`queue_id`, `sequence_number`) and (`queue_id`, `ticket_number`) |
| `ticket_events` | `id`, `ticket_id`, `event_type`, `actor_user_id` nullable, `occurred_at`, `metadata_json` optional |

Use indexes for (`queue_id`, `status`, `sequence_number`) and ticket lookup by token hash. Prefer explicit constraints. Define deletion behavior so historical tickets are never accidentally cascade-deleted with services/users. Record relevant decisions in `docs/decisions.md`.

## 5. API contract (MVP)

These paths are the starting contract. Document request/response examples, roles, status codes and error bodies in `openapi.yml` before integrating frontend and backend.

| Method | Path | Role | Result |
|---|---|---|---|
| GET | `/api/organizations` | Public | Organization directory |
| GET | `/api/organizations/{org_id}/services` | Public | Active service catalog and queue summary |
| POST | `/api/queues/{queue_id}/tickets` | Public | Create ticket, return private token/link; idempotent by client key |
| GET | `/api/tickets/{token}` | Token holder | Ticket status, position, approximate wait |
| POST | `/api/tickets/{token}/cancel` | Token holder | Cancel `WAITING` ticket |
| GET | `/api/queues/{queue_id}/status` | Public | Aggregate current queue state without private data |
| POST | `/api/auth/login` | Public | Authenticated staff/admin session |
| POST | `/api/auth/logout` | Authenticated | End session |
| GET | `/api/auth/me` | Authenticated | Role and organization identity |
| GET | `/api/staff/queues` | Staff | Assigned queues/counter info |
| POST | `/api/staff/queues/{queue_id}/call-next` | Assigned staff | Atomically call oldest waiting ticket at specified authorized counter |
| POST | `/api/staff/tickets/{ticket_id}/start` | Assigned staff | `CALLED -> SERVING` |
| POST | `/api/staff/tickets/{ticket_id}/complete` | Assigned staff | `SERVING -> COMPLETED` |
| POST | `/api/staff/tickets/{ticket_id}/no-show` | Assigned staff | `CALLED -> NO_SHOW` |
| GET | `/api/admin/services` | Admin | List organization services |
| POST | `/api/admin/services` | Admin | Create service |
| PATCH | `/api/admin/services/{service_id}` | Admin | Update service / daily schedule |
| GET/POST/PATCH | `/api/admin/counters[/{counter_id}]` | Admin | List/create/update counter |
| GET/POST/DELETE | `/api/admin/staff-assignments` | Admin | Manage assignments; exact DELETE representation in OpenAPI |
| GET | `/api/admin/analytics` | Admin | Date-filterable real metrics |

Provide an explicit API operation to open/close a queue if the UI supports it. Avoid inconsistent front-end-only toggles. Return `401` for not logged in, `403` for wrong role or organization, `404` for not found, `409` for invalid state/conflict, `422` for validation failures, and a safe error for rate limiting where implemented. Never leak valid private token existence through verbose error details.

## 6. Frontend pages and UX

1. **Customer landing `/`** — browse organizations and services, see open/closed state, number waiting and join action.
2. **Ticket `/ticket/:token`** — number, service, status, people ahead, estimated wait or unavailable, cancel confirmation, periodic refresh and graceful network error/retry.
3. **Login `/login`** — staff/admin authentication; no customer login.
4. **Staff `/staff`** — assigned queue/counter selection, current ticket and ticket actions; protect route and server APIs.
5. **Admin `/admin`** — summary cards and basic charts/tables based on backend data.
6. **Admin configuration `/admin/services`, `/admin/counters`, `/admin/staff`** — create/edit and assignment workflows; provide empty/loading/error/validation states.
7. **Optional public display `/display/:queueId`** — only if time remains after all required MVP tests pass.

Avoid fake buttons and hardcoded metrics. Use one shared design system with responsive layouts, keyboard access, contrast, clear loading state, and meaningful confirmation/errors. Display local service times in organization timezone.

## 7. Step-by-step implementation phases

### Phase 0 — Repository, planning and issue setup (P0)
- [ ] Inspect existing repo and preserve working code; do not overwrite without reason.
- [ ] Create `docs/decisions.md`, `docs/process.md`, `docs/chat-brainstorm.md`, `AGENTS.md`, `README.md` (or update existing equivalents).
- [ ] Convert phases below into appropriately sized GitHub Issues **before coding**, with `mvp` label, owner (if available), dependencies and objective acceptance criteria. Prefer 25–50 useful issues rather than fake issue inflation; split further only when it improves traceability.
- [ ] Set up frontend/backend project structure, local `.env.example`, dependency lockfiles, lint/typecheck/test commands, and CI if practical.

**Exit gate:** Both apps start locally; setup instructions work; a real MVP issue backlog exists.

### Phase 1 — API and UX contracts (P0)
- [ ] Define page map and reusable UI component list.
- [ ] Define status lifecycle, error codes, access rules, ticket token mechanism and data shapes.
- [ ] Write `openapi.yml` with actual request/response schemas, validation, and authentication.
- [ ] Agree on seed services and demo actors (example: university Student Office and Finance Desk).

**Exit gate:** Agent can build frontend or backend using the same stable contract.

### Phase 2 — Frontend mock implementation (P0)
- [ ] Customer service catalog / join dialog / ticket page with realistic mock service layer.
- [ ] Staff login screen and staff dashboard interactions.
- [ ] Admin dashboard, services, counters and assignments UI.
- [ ] Empty/loading/error states, responsive mobile layout, accessibility checks.
- [ ] Basic component tests for high-risk flows.

**Exit gate:** All main screens are navigable and usable against deterministic mocks. Mock state must be clearly isolated from production API.

### Phase 3 — Backend domain and auth (P0)
- [ ] Implement FastAPI app, models/schemas, domain services, repositories.
- [ ] Implement login/logout/current user and enforce roles, organizations and counter assignment.
- [ ] Create organization/service/queue directory and queue open/closed calculation.
- [ ] Implement unique ticket generation + idempotent join; opaque token + hashed storage.
- [ ] Implement authorized ticket read/cancel and queue-position calculation.
- [ ] Implement transactional call-next, start, complete, no-show, and event log.
- [ ] Unit and API tests for status rules, permissions, and concurrency.

**Exit gate:** API follows contract and passes domain/integration tests using isolated in-memory or temporary storage.

### Phase 4 — Persistent data and administration (P0)
- [ ] Add SQLAlchemy models and Alembic migrations for SQLite.
- [ ] Implement persistent repositories without changing service contracts.
- [ ] Enforce database uniqueness, foreign keys, indexes and transaction integrity.
- [ ] Implement admin service/counter management and staff assignments.
- [ ] Add seeded organization, admin/staff demo users and sample services.
- [ ] Implement analytics queries from ticket timestamps, plus persistence/restart tests.

**Exit gate:** Data survives restart; database constraints and concurrent operations pass tests; admin routes enforce permissions.

### Phase 5 — End-to-end integration (P0)
- [ ] Replace mocks with typed API client matching OpenAPI.
- [ ] Implement 5-second ticket/status polling, request cancellation, retries and UI feedback.
- [ ] Verify customer → staff → admin data flow on one real database.
- [ ] Remove/deactivate fake controls, fake charts and placeholder metrics.
- [ ] Handle closed queue, no staff/counters, invalid token, duplicate submissions, and role restrictions.

**Exit gate:** Browser workflow functions end-to-end without manual database edits.

### Phase 6 — Verification, fixes and delivery (P0)
- [ ] Run formatter, lint, typecheck, backend tests, frontend tests and E2E smoke tests.
- [ ] Manually test at least one full scenario and at least three failures/edge cases.
- [ ] Open `bug` + `user-test-bug` issues for manual discoveries, reproduce, fix and add regression tests.
- [ ] Confirm project README includes prerequisites, setup/run/test commands, migrations, seeded credentials, screenshots/demo flow and known limitations.
- [ ] Update `docs/process.md` with actual agent actions, checks, outcomes and blockers.
- [ ] Close only issues whose acceptance criteria are verified; produce final backlog/test summary.

**Exit gate:** MVP acceptance checklist passes and a clean-clone setup is reproducible.

## 8. Required automated tests

### Backend unit/integration
- Valid/invalid login; staff/admin role separation; cross-organization isolation.
- Service open/closed scheduling in organization timezone.
- Join creates correct sequential numbering, unique tokens and event records.
- Parallel joins receive distinct sequence numbers; repeated join with same idempotency key returns same logical ticket.
- Token holder can read/cancel own waiting ticket; invalid token denied; called/served ticket cannot be cancelled.
- Position updates when earlier tickets leave waiting state; no counter/duration yields no estimated wait.
- Oldest waiting ticket selected by call-next; unauthorized counter rejected; two simultaneous calls never assign same ticket.
- Invalid transitions rejected with appropriate `409`; audit events saved.
- Actual analytics from timestamps; persistence after restart.

### Frontend
- Service cards render queue state; successful join navigates to ticket page.
- Ticket page displays waiting, called, serving, completed and cancelled states; polling error recoverable.
- Staff call-next updates UI; unauthorized users redirected/blocked; admin forms validate input.

### E2E (Playwright)
- Customer joins → staff calls → starts → completes → customer sees completed.
- Customer joins → cancels → staff cannot call cancelled ticket.
- Admin creates a service/counter and assigns staff → staff sees it.
- Unauthorized access and invalid/expired token UI behavior.

## 9. GitHub issue protocol for AI agents

For each substantial unit of work:
1. Find or create its issue **before editing code**; mark it `mvp`, priority (`P0`/`P1`), area, and dependencies.
2. Add a short issue description with **Given/When/Then** acceptance criteria and expected files/tests.
3. Implement only the scoped change; create small reviewable commits and reference the issue number.
4. Run the nearest applicable checks; record exact commands and results in the issue/PR or `docs/process.md`.
5. Verify acceptance criteria against running code. Close only after success. If blocked, keep open, label `blocked`, document cause and next action.
6. If manually found bugs require new work, file a reproducible `user-test-bug` issue and add regression coverage.

**Agent collaboration:** Parallelize independent tasks (UI screens, API schemas, tests) only when interface contracts are stable. Avoid two agents changing the same files or migrations concurrently. Merge by dependency order; review diffs before integration. Never mark tests as passing without execution.

## 10. Suggested dependency graph and priorities

```text
Repository & issues
      ↓
UX + OpenAPI + domain decisions
      ├───────────→ Frontend mock screens ───────┐
      ↓                                        │
Backend auth + domain + in-memory repos       │
      ↓                                        │
SQLAlchemy + migrations + admin + analytics   │
      └───────────→ API integration ←──────────┘
                         ↓
             E2E, security, concurrency
                         ↓
               Docs + MVP issue closure
```

**P0 = release-blocking:** customer ticket issuance/view/cancel; staff lifecycle; role protection; persistent database; counter conflicts; baseline admin configuration; end-to-end test.  
**P1 = after P0 works:** refined analytics charts, optional public display, additional polish.  
**Post-MVP:** messaging, appointments, QR, predictions, multi-branch management.

## 11. Definition of done for each issue

- Relevant acceptance criteria verified, including negative cases.
- Backend/API contract and frontend types remain consistent.
- Tests added/updated for behavioral changes; applicable checks pass.
- No user secrets committed, no sensitive tokens logged, no hardcoded dashboard metrics.
- User-facing errors, empty states and loading behavior considered.
- Docs updated for externally visible changes; issue linked to code/commit and closed only after verification.

## 12. Final delivery checklist

- [ ] `README.md` documents environment setup, separate frontend/backend startup, migration, seed and test commands.
- [ ] `.env.example` exists; `.env` and database files excluded from Git.
- [ ] Frontend builds; backend starts; API docs available.
- [ ] Fresh install + migrations + seed + browser workflow succeed.
- [ ] Automated tests and at least one full E2E pass.
- [ ] Staff/admin credentials are seeded for development **only** and clearly labeled as demo credentials.
- [ ] All genuine MVP issues are closed, or remaining blockers explicitly reported (never falsely closed).
- [ ] `docs/decisions.md` and `docs/process.md` reflect implementation reality.

## 13. First instruction for a coding agent

> Read `docs/plan.md` completely, then inspect the repository and existing documentation. Do not rewrite working code or assume the project is empty. Identify missing MVP features and create/refine GitHub Issues with dependencies and acceptance criteria **before implementation**. Begin with Phase 0 and implement in dependency order. Preserve the API contract, enforce backend permissions, write tests for ticket concurrency/state changes, and keep `docs/process.md` current. After each issue, run relevant checks and only close verified work. If a choice is unclear, choose the smallest safe MVP behavior, record the decision in `docs/decisions.md`, and proceed.

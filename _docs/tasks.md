# Kezek MVP backlog

This backlog implements [the plan](../docs/plan.md) using [the selected architecture](../docs/architecture.md): the existing React/TypeScript/TanStack frontend, FastAPI, SQLAlchemy, Alembic and SQLite. Paths are relative to the repository root containing `frontend/`, `backend/` and `docs/`; preserve the existing frontend.

Each task is intended for one focused session. Prerequisites identify required artifacts, not required reading of other task descriptions; each assignee should use the current repository, plan, architecture and agreed API contract. Before implementation, find or create the task's GitHub issue as required by the plan; record verification in `docs/process.md` and close only verified work. These are planned tasks, not completed features; optional public displays and other post-MVP features are excluded.


The acceptance criteria below are proposed verification targets, not passing results. `_docs/mvp-backlog.json` is the machine-readable issue source; keep its task text and criteria synchronized with this document. GitHub issue numbers are discovered through approved direct CLI operations and recorded in `docs/issue-map.json`; never infer them from task numbers.

## 1. Set up an empty project with a passing test
Goal: Establish a minimal runnable backend with one passing automated test.
Description: Initialize the empty `backend/` directory as a Python/FastAPI project with dependency configuration, an application entry point and a Pytest smoke test that imports or starts the application. Keep this task free of product features and preserve the existing React application; document and run the exact setup and test commands.

Task ID: `KEZEK-001` · Priority: P0 · Area: backend

Dependencies: None

Expected files: `backend/`

Acceptance criteria:

- [ ] **AC-1:** A fresh Python environment can install the declared backend dependencies.
- [ ] **AC-2:** The empty FastAPI application starts without product features or frontend changes.
- [ ] **AC-3:** The documented Pytest smoke command exits successfully.

## 2. Establish frontend verification commands
Goal: Make the existing frontend build and test reproducibly.
Description: Inspect the existing React/TypeScript/TanStack application and preserve its screens while standardizing installation, lint, typecheck, build and Vitest commands in `frontend/package.json`. Verify the existing application can render under its test setup and record any existing failures separately from new changes.

Task ID: `KEZEK-002` · Priority: P0 · Area: frontend

Dependencies: None

Expected files: `frontend/package.json`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** A locked frontend install succeeds.
- [ ] **AC-2:** Documented lint, strict typecheck, build and Vitest commands exist and run.
- [ ] **AC-3:** Existing route and mock tests remain intact and failures are recorded.

## 3. Document project workflow and decisions
Goal: Give contributors a reliable implementation and verification workflow.
Description: Create or update `docs/decisions.md`, `docs/process.md`, `docs/chat-brainstorm.md`, `README.md` and `AGENTS.md` without discarding existing guidance. Record the selected SQLite/FastAPI stack, retention of TanStack routing, issue workflow and how to record actual commands and outcomes; review links and paths for consistency.

Task ID: `KEZEK-003` · Priority: P0 · Area: docs

Dependencies: None

Expected files: `docs/`, `README.md`, `AGENTS.md`

Acceptance criteria:

- [ ] **AC-1:** Workflow documents describe issue-first implementation and verified closure.
- [ ] **AC-2:** The TanStack routing deviation and selected stack are recorded.
- [ ] **AC-3:** Contributor commands and relative documentation links resolve.

## 4. Resolve ticket issuance and retry semantics
Goal: Define recoverable anonymous ticket issuance without storing raw ticket tokens.
Description: Document the exact join request, queue-scoped idempotency key behavior and private-token lifecycle, including duplicate requests, simultaneous retries and a lost creation response. Resolve how the customer can recover access while retaining hash-only token storage and avoiding another issued ticket; record any necessary product deviation and concrete request/response examples before coding issuance.

Task ID: `KEZEK-004` · Priority: P0 · Area: contract

Dependencies: None

Expected files: `docs/decisions.md`

Acceptance criteria:

- [ ] **AC-1:** Join request examples define queue-scoped idempotency and private-token ownership.
- [ ] **AC-2:** Lost-response recovery does not create a second ticket or store raw access tokens.
- [ ] **AC-3:** Simultaneous retry and key-reuse behavior is explicitly specified.

## 5. Define the public API contract
Goal: Specify anonymous organization, service, queue and ticket operations.
Description: Using the issuance decision, write the public section of `openapi.yml` for organization and service directories, queue summaries, join, private ticket read and cancellation under `/api`. Include schemas, token access rules, status casing, null wait estimates, idempotency behavior and examples for closed queues, invalid tokens, validation errors and conflicts; reconcile these with the current `frontend/src/lib/api` contract.

Task ID: `KEZEK-005` · Priority: P0 · Area: contract

Dependencies: KEZEK-004

Expected files: `openapi.yml`, `frontend/src/lib/api/`

Acceptance criteria:

- [ ] **AC-1:** Public operations have request, response and structured error schemas.
- [ ] **AC-2:** Closed queues, invalid tokens, duplicate joins and null estimates have examples.
- [ ] **AC-3:** Schemas reconcile anonymous access and organization-scoped directories with the existing client.

## 6. Define the authentication and staff API contract
Goal: Specify cookie authentication and counter-authorized ticket actions.
Description: Extend `openapi.yml` with login, logout, current identity, CSRF handling, assigned queue listing, call-next, start, complete and no-show operations. Define counter selection, session expiry, empty queues, structured errors and organization/assignment rules, including `401`, `403` and `409` examples; document the migration from the current bearer-token frontend contract.

Task ID: `KEZEK-006` · Priority: P0 · Area: contract

Dependencies: None

Expected files: `openapi.yml`, `docs/decisions.md`

Acceptance criteria:

- [ ] **AC-1:** Login, logout, current identity and CSRF exchange are specified.
- [ ] **AC-2:** Staff operations define counter authorization, empty queues and lifecycle conflicts.
- [ ] **AC-3:** Cookie settings and 401/403/409 response examples are documented.

## 7. Define the administration API contract
Goal: Specify all administrator configuration and reporting operations.
Description: Extend `openapi.yml` with service and counter management, counter-service associations, staff creation/editing, staff assignments, manual daily queue opening/closing and date-filtered analytics. Define organization scoping, deactivation instead of destructive history deletion, schedule validation and concrete mutation paths; validate the full OpenAPI document and record metric definitions.

Task ID: `KEZEK-007` · Priority: P0 · Area: contract

Dependencies: None

Expected files: `openapi.yml`, `docs/decisions.md`

Acceptance criteria:

- [ ] **AC-1:** Admin operations cover services, counters, staff, associations, assignments and queue closure.
- [ ] **AC-2:** Analytics define local date filters, wait durations and service durations.
- [ ] **AC-3:** The entire OpenAPI document validates with examples for rejected configuration changes.

## 8. Define page contracts and shared UI states
Goal: Make each required screen implementable against agreed API examples.
Description: Document customer directory, private ticket, login, staff dashboard and admin configuration routes using the existing TanStack router. Map each screen to API operations and specify loading, empty, validation, authorization, refresh-failure and success states, including mobile layouts and the removal of customer-name inputs.

Task ID: `KEZEK-008` · Priority: P0 · Area: frontend

Dependencies: KEZEK-005, KEZEK-006, KEZEK-007

Expected files: `docs/`, `frontend/src/routes/`

Acceptance criteria:

- [ ] **AC-1:** Each required page maps to named contract operations.
- [ ] **AC-2:** Loading, empty, validation, unauthorized and refresh-error states are defined.
- [ ] **AC-3:** Mobile behavior, private-token routes and removal of customer-name inputs are specified.

## 9. Add backend configuration and safe error responses
Goal: Provide a configurable FastAPI foundation with predictable errors.
Description: With the backend scaffold and API contracts available, add environment-backed settings, non-secret `.env.example`, router registration and a consistent `code`, `message`, `details` error envelope. Test configuration validation and representative validation/conflict responses, keeping secrets and database files out of source control.

Task ID: `KEZEK-009` · Priority: P0 · Area: backend

Dependencies: KEZEK-001, KEZEK-005, KEZEK-006, KEZEK-007

Expected files: `backend/app/core/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Environment settings validate required secrets without exposing them.
- [ ] **AC-2:** Validation, conflict and unexpected errors use safe contracted envelopes.
- [ ] **AC-3:** The app starts with documented non-secret example configuration.

## 10. Configure SQLite sessions and migrations
Goal: Establish isolated, migration-managed database access.
Description: Using the backend foundation, configure SQLAlchemy request sessions, Alembic, foreign keys, WAL, a bounded busy timeout and service-owned transaction boundaries. Add temporary file-backed test databases and verify connection settings, rollback behavior and migration startup without touching the development database.

Task ID: `KEZEK-010` · Priority: P0 · Area: database

Dependencies: KEZEK-009

Expected files: `backend/app/core/`, `backend/migrations/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Every SQLite connection enables foreign keys and the configured busy timeout.
- [ ] **AC-2:** File-backed tests exercise WAL, transaction rollback and isolated sessions.
- [ ] **AC-3:** Alembic can initialize a fresh test database without using development data.

## 11. Add organization and configuration models
Goal: Persist organizations, users, services, counters and assignments.
Description: Using the SQLite foundation, add SQLAlchemy models and an Alembic migration for organizations, users, services, counters, counter-service links and staff assignments with the fields in `docs/plan.md`. Test uniqueness, foreign keys and historical-data-preserving deletion rules; identify cross-organization checks that services must enforce.

Task ID: `KEZEK-011` · Priority: P0 · Area: database

Dependencies: KEZEK-010

Expected files: `backend/app/models/`, `backend/migrations/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Organizations, users, services, counters and association tables match required fields.
- [ ] **AC-2:** Uniqueness and foreign key violations are covered by database tests.
- [ ] **AC-3:** Deletion behavior preserves history and cross-organization service checks are identified.

## 12. Add queue, ticket, event and session models
Goal: Persist queue activity and authentication with database constraints.
Description: Extend the migrated schema with daily queues, tickets, ticket events and hashed server-session records, following the agreed issuance contract. Test unique service/date queues, daily ticket numbering, token hashes, queue-scoped idempotency keys and at most one `CALLED` or `SERVING` ticket per counter, including rollback on constraint failures.

Task ID: `KEZEK-012` · Priority: P0 · Area: database

Dependencies: KEZEK-004, KEZEK-011

Expected files: `backend/app/models/`, `backend/migrations/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Daily queues, tickets, events and hashed sessions migrate successfully.
- [ ] **AC-2:** Duplicate daily numbers, token hashes and scoped idempotency keys are rejected.
- [ ] **AC-3:** A database constraint prevents two called/serving tickets at one counter.

## 13. Add deterministic development seed data
Goal: Make a fresh database usable for local testing.
Description: With all schema migrations available, provide a repeatable seed command for an `Asia/Almaty` organization, example services, counters, assignments and Argon2id-hashed demo admin/staff accounts. Document development-only credentials and verify rerunning the seed does not duplicate configuration or destroy existing tickets.

Task ID: `KEZEK-013` · Priority: P0 · Area: backend

Dependencies: KEZEK-012

Expected files: `backend/app/`, `backend/tests/`, `README.md`

Acceptance criteria:

- [ ] **AC-1:** Seed produces the documented organization, services, counters and assignments.
- [ ] **AC-2:** Demo passwords are Argon2id hashes and credentials are labeled development-only.
- [ ] **AC-3:** A second seed run neither duplicates configuration nor removes tickets.

## 14. Implement login and server-managed sessions
Goal: Authenticate active staff and admins using secure cookies.
Description: Using persisted users and sessions plus the authentication contract, implement Argon2id password verification, opaque session issuance, expiry and current-identity lookup. Test valid and invalid credentials, inactive users, expired sessions and HttpOnly/SameSite cookie settings, enabling Secure cookies under HTTPS without logging credentials.

Task ID: `KEZEK-014` · Priority: P0 · Area: auth

Dependencies: KEZEK-006, KEZEK-012

Expected files: `backend/app/services/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Valid active users receive an opaque session and correct current identity.
- [ ] **AC-2:** Invalid credentials, inactive users and expired sessions are denied.
- [ ] **AC-3:** Database session tokens are hashed and cookies have the contracted security attributes.

## 15. Add CSRF protection, logout and browser connectivity
Goal: Make cookie-authenticated browser mutations safe and usable.
Description: With login implemented, add the contracted CSRF mechanism, logout invalidation and same-origin development API proxying, with explicit credentialed CORS only if separate origins are required. Test rejected missing/invalid CSRF tokens, successful authenticated mutations, logout revocation and allowed/disallowed origins.

Task ID: `KEZEK-015` · Priority: P0 · Area: auth

Dependencies: KEZEK-014

Expected files: `backend/app/`, `frontend/vite.config.ts`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Cookie-authenticated mutations reject missing or invalid CSRF proof.
- [ ] **AC-2:** Logout invalidates the session and subsequent requests are denied.
- [ ] **AC-3:** Same-origin proxying works and any cross-origin requests use an explicit credentialed allowlist.

## 16. Implement reusable authorization checks
Goal: Enforce roles, organization ownership and counter assignments on the backend.
Description: Using current-identity lookup and persisted configuration, add service-level checks for active staff/admin users, organization-scoped records and authorized active counters. Test anonymous access, wrong roles, another organization's records, inactive assignments and forged counter IDs; apply these checks as each protected endpoint is introduced.

Task ID: `KEZEK-016` · Priority: P0 · Area: auth

Dependencies: KEZEK-014, KEZEK-011

Expected files: `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Anonymous and wrong-role access return the contracted denial.
- [ ] **AC-2:** Cross-organization resources cannot be read or mutated through protected operations.
- [ ] **AC-3:** Inactive or unassigned counters are rejected by service-level checks.

## 17. Implement organization-local queue scheduling
Goal: Determine the correct daily queue and whether joining is allowed.
Description: Using service and daily-queue models, implement UTC-to-IANA-timezone date selection, simple daily opening hours, inactive-service handling and manual-closure precedence. Ensure daily queues can be created safely on demand and test midnight boundaries, opening/closing edges and simultaneous first access; document the supported behavior for overnight schedules.

Task ID: `KEZEK-017` · Priority: P0 · Area: backend

Dependencies: KEZEK-012

Expected files: `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Queue date and opening hours use the organization IANA timezone.
- [ ] **AC-2:** Opening/closing boundaries, midnight and manual closure have deterministic tests.
- [ ] **AC-3:** Concurrent first access creates only one daily queue and overnight behavior is documented.

## 18. Implement public organization and service directories
Goal: Let anonymous customers discover services and current queue availability.
Description: With scheduling available, implement `GET /api/organizations` and `GET /api/organizations/{org_id}/services` using the public contract. Return active services, current daily queue identifiers and availability without private ticket data, and test unknown organizations, empty catalogs and closed services.

Task ID: `KEZEK-018` · Priority: P0 · Area: backend

Dependencies: KEZEK-005, KEZEK-017

Expected files: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Public organizations and active service catalogs match contract schemas.
- [ ] **AC-2:** Service entries expose current queue IDs and authoritative availability.
- [ ] **AC-3:** Unknown organizations, empty catalogs and closed services have tests without private data.

## 19. Implement transactional ticket issuance
Goal: Create one private, sequentially numbered ticket per logical join.
Description: Using the issuance decision, queue scheduling and migrated ticket schema, implement `POST /api/queues/{queue_id}/tickets` with an appropriate SQLite write reservation before mutable reads. Atomically validate availability, resolve idempotency, allocate the sequence, hash the access token, insert the ticket and append its event; test duplicates, lost-response recovery, closed queues and rollback.

Task ID: `KEZEK-019` · Priority: P0 · Area: backend

Dependencies: KEZEK-004, KEZEK-005, KEZEK-012, KEZEK-017

Expected files: `backend/app/services/`, `backend/app/repositories/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** A join atomically saves its daily number, token hash and event.
- [ ] **AC-2:** Same-key retries and lost-response recovery follow the agreed contract.
- [ ] **AC-3:** Closed-queue rejection and rollback leave no ticket or sequence collision.

## 20. Implement private ticket lookup and wait estimates
Goal: Return authoritative ticket status, people ahead and an honest wait estimate.
Description: With persisted tickets and the public contract, implement `GET /api/tickets/{token}` using hashed-token lookup and FIFO waiting-position queries. Calculate estimates from waiting tickets ahead, typical duration and eligible active counters, returning `null` when unavailable; test invalid tokens, every lifecycle state and position changes without exposing internal IDs as access credentials.

Task ID: `KEZEK-020` · Priority: P0 · Area: backend

Dependencies: KEZEK-005, KEZEK-019

Expected files: `backend/app/services/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Only a valid private token can retrieve the customer ticket view.
- [ ] **AC-2:** People ahead change correctly when earlier waiting tickets leave the queue.
- [ ] **AC-3:** Wait is estimated from eligible counters and duration data or is explicitly null.

## 21. Implement anonymous ticket cancellation
Goal: Allow token holders to cancel only waiting tickets.
Description: Using private token lookup and transaction support, implement `POST /api/tickets/{token}/cancel` with atomic state validation, cancellation timestamp and event insertion. Test successful cancellation, invalid tokens, repeated cancellation and cancellation racing with call-next, ensuring a ticket cannot be both cancelled and called.

Task ID: `KEZEK-021` · Priority: P0 · Area: backend

Dependencies: KEZEK-019, KEZEK-020

Expected files: `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** A waiting token-holder ticket can be cancelled with timestamp and event.
- [ ] **AC-2:** Called, serving and terminal tickets cannot be cancelled.
- [ ] **AC-3:** Cancellation racing with call-next cannot leave contradictory state.

## 22. Implement public aggregate queue status
Goal: Expose current queue summaries without private ticket data.
Description: With daily queues and tickets available, implement `GET /api/queues/{queue_id}/status` according to the public contract, including open/closed state and relevant aggregate counts. Test unknown queues and changes after join, cancel and completion, and assert responses contain no access tokens, customer information or staff-only details.

Task ID: `KEZEK-022` · Priority: P0 · Area: backend

Dependencies: KEZEK-005, KEZEK-019

Expected files: `backend/app/routers/`, `backend/app/repositories/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Queue summaries expose correct contracted availability and aggregate counts.
- [ ] **AC-2:** Unknown queue IDs return the contracted error.
- [ ] **AC-3:** Responses exclude private tokens, credentials and staff-only data.

## 23. Implement staff queue discovery
Goal: Show staff only the queues and counters they can operate.
Description: Using session authorization and counter-service assignments, implement `GET /api/staff/queues` with authorized counters, eligible service queues and current counter tickets. Test multiple services per counter, multiple assignments, inactive configuration, empty results and cross-organization isolation.

Task ID: `KEZEK-023` · Priority: P0 · Area: backend

Dependencies: KEZEK-006, KEZEK-016, KEZEK-017

Expected files: `backend/app/services/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Staff receive only queues eligible for their active assigned counters.
- [ ] **AC-2:** Multiple services and assignments produce correct current-ticket data.
- [ ] **AC-3:** Inactive configuration, empty assignments and cross-organization attempts have tests.

## 24. Implement atomic call-next
Goal: Assign the oldest waiting ticket to one authorized idle counter.
Description: With staff authorization and transactional ticket models, implement `POST /api/staff/queues/{queue_id}/call-next` using a SQLite write reservation before checking the counter and selecting a ticket. Atomically set `CALLED`, the counter and timestamp plus its event; test FIFO, empty queues, busy counters, closed queues with outstanding tickets and unauthorized counter/service combinations.

Task ID: `KEZEK-024` · Priority: P0 · Area: backend

Dependencies: KEZEK-019, KEZEK-023

Expected files: `backend/app/services/`, `backend/app/repositories/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** An idle authorized counter receives the oldest waiting ticket and an event atomically.
- [ ] **AC-2:** Busy counters, unsupported services and unauthorized counters are rejected.
- [ ] **AC-3:** Empty queues are handled and closed queues still allow existing work to proceed.

## 25. Implement start, complete and no-show actions
Goal: Enforce the staff ticket lifecycle with timestamps and audit events.
Description: Using the staff API contract and authorization checks, implement `CALLED -> SERVING`, `SERVING -> COMPLETED` and `CALLED -> NO_SHOW` as atomic service operations. Test every invalid transition, wrong-counter actions and cross-organization access, confirming completion/no-show releases counter capacity and records the correct timestamp and actor.

Task ID: `KEZEK-025` · Priority: P0 · Area: backend

Dependencies: KEZEK-024

Expected files: `backend/app/services/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Only called-to-serving, serving-to-completed and called-to-no-show staff transitions succeed.
- [ ] **AC-2:** Successful transitions persist actor, event and the appropriate timestamp.
- [ ] **AC-3:** Wrong-counter and cross-organization actions fail and terminal actions free counter capacity.

## 26. Verify queue concurrency and lock contention
Goal: Prove parallel requests cannot duplicate numbers or counter assignments.
Description: With join, cancellation and staff mutations available, add parallel API tests against temporary file-backed SQLite databases using independent sessions and the actual transaction configuration. Cover concurrent joins and same-key retries, competing counters, two calls at one counter, cancellation races and bounded lock contention; fix failures and document the supported single-worker demo setup.

Task ID: `KEZEK-026` · Priority: P0 · Area: tests

Dependencies: KEZEK-019, KEZEK-021, KEZEK-024, KEZEK-025

Expected files: `backend/tests/`, `docs/process.md`

Acceptance criteria:

- [ ] **AC-1:** Parallel distinct joins and same-key retries preserve numbering and idempotency.
- [ ] **AC-2:** Competing counters and simultaneous same-counter calls never double-assign.
- [ ] **AC-3:** Cancellation races and lock contention are tested with independent file-backed database sessions.

## 27. Implement admin service management
Goal: Let organization admins configure services and schedules.
Description: Using the administration contract and authorization layer, implement service list/create/update operations for names, prefixes, durations, opening hours and activation. Test validation, organization isolation and deactivation without deleting history, and define behavior when changing a prefix or schedule for a service with an existing daily queue.

Task ID: `KEZEK-027` · Priority: P0 · Area: backend

Dependencies: KEZEK-007, KEZEK-016, KEZEK-017

Expected files: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Organization admins can list, create and update valid services and schedules.
- [ ] **AC-2:** Invalid duration, schedule, role and organization requests are rejected.
- [ ] **AC-3:** Deactivation preserves history and prefix/schedule changes for existing daily queues have defined tests.

## 28. Implement admin counter and service associations
Goal: Let organization admins configure counters and the services they support.
Description: Using the administration contract, implement counter list/create/update and counter-service association operations with same-organization validation. Test duplicate links, unsupported services, deactivation and changes while a counter has a called/serving ticket, preserving the ability to finish existing work safely.

Task ID: `KEZEK-028` · Priority: P0 · Area: backend

Dependencies: KEZEK-007, KEZEK-016, KEZEK-011, KEZEK-025

Expected files: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Admins can maintain counters and their supported service links.
- [ ] **AC-2:** Duplicate and cross-organization associations are rejected.
- [ ] **AC-3:** Activation and association changes cannot strand an active counter ticket.

## 29. Implement admin staff and assignment management
Goal: Let organization admins maintain staff access to counters.
Description: Using user/session models and the administration contract, implement staff listing, creation, supported edits and assignment creation/removal without exposing password hashes. Test password hashing, duplicate identities, inactive users, cross-organization links and assignment changes during active service, including the agreed session-revocation behavior.

Task ID: `KEZEK-029` · Priority: P0 · Area: backend

Dependencies: KEZEK-007, KEZEK-016, KEZEK-014, KEZEK-025

Expected files: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Admins can create and edit staff and maintain same-organization assignments.
- [ ] **AC-2:** Passwords are hashed and never included in read responses.
- [ ] **AC-3:** Duplicate identities, deactivation, session revocation and active-service reassignment are tested.

## 30. Implement manual daily queue opening and closing
Goal: Make queue availability controls authoritative on the backend.
Description: Using queue scheduling and admin authorization, implement the contracted operation for changing a daily queue's manual open/closed state. Test organization ownership, interaction with service hours, rejected joins after closure and continued viewing and staff processing of existing tickets.

Task ID: `KEZEK-030` · Priority: P0 · Area: backend

Dependencies: KEZEK-007, KEZEK-016, KEZEK-017, KEZEK-024

Expected files: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Authorized admins can persist a daily manual open/closed setting.
- [ ] **AC-2:** Opening cannot bypass configured service-hour restrictions.
- [ ] **AC-3:** Closing rejects new joins while private lookup and existing staff work remain available.

## 31. Implement date-filtered operational analytics
Goal: Calculate dashboard metrics from stored queue activity.
Description: Using persisted ticket timestamps and the analytics contract, implement organization-scoped issued, waiting and completed counts, mean completed-ticket wait, mean service duration and per-service totals. Test organization-local date boundaries, empty datasets, incomplete tickets and known timestamp fixtures so all averages and filters have verifiable meanings.

Task ID: `KEZEK-031` · Priority: P0 · Area: backend

Dependencies: KEZEK-007, KEZEK-016, KEZEK-025

Expected files: `backend/app/repositories/`, `backend/app/routers/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Stored timestamps produce issued/waiting/completed counts and per-service totals.
- [ ] **AC-2:** Mean completed-ticket wait and service duration match fixed timestamp fixtures.
- [ ] **AC-3:** Empty data, organization isolation and local-date filter boundaries have tests.

## 32. Align the frontend API facade with the real contract
Goal: Give every screen one typed, cookie-aware backend interface.
Description: With the agreed OpenAPI document and authentication flow available, update `frontend/src/lib/api/types.ts`, `http.ts` and the exported facade for all required operations, credentials, CSRF and structured errors. Preserve compatible screen behavior through focused adapter changes, isolate deterministic mocks for UI work and test representative HTTP failures, aborts and private-token requests.

Task ID: `KEZEK-032` · Priority: P0 · Area: frontend

Dependencies: KEZEK-005, KEZEK-006, KEZEK-007, KEZEK-015

Expected files: `frontend/src/lib/api/`, `frontend/src/lib/session.ts`

Acceptance criteria:

- [ ] **AC-1:** All required operations have typed methods matching the agreed OpenAPI contract.
- [ ] **AC-2:** HTTP calls send session credentials and CSRF proof and parse structured errors.
- [ ] **AC-3:** Mocks are isolated and tests cover aborts, network failures and token-bearing requests.

## 33. Integrate the customer service directory
Goal: Display real organizations, services and join availability.
Description: Using the API facade and public directory endpoints, adapt the existing customer landing page to organization selection, queue summaries and timezone-labeled service hours. Add focused component tests for open/closed services, empty organizations, loading and retryable errors, with all calls going through the central facade.

Task ID: `KEZEK-033` · Priority: P0 · Area: frontend

Dependencies: KEZEK-008, KEZEK-018, KEZEK-022, KEZEK-032

Expected files: `frontend/src/routes/index.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Customers can select organizations and see real active service queues.
- [ ] **AC-2:** Availability and displayed service hours reflect backend data and organization timezone.
- [ ] **AC-3:** Component tests cover loading, empty, closed and retryable error states.

## 34. Integrate the customer join flow
Goal: Issue an anonymous ticket and navigate to its private link.
Description: Using the real issuance endpoint and typed client, remove customer-name collection, submit the contracted idempotency data and navigate to `/ticket/:token` after a successful join. Prevent rapid repeat submissions and test closed-queue errors, uncertain/lost responses and recovery according to the issuance decision without creating another logical ticket.

Task ID: `KEZEK-034` · Priority: P0 · Area: frontend

Dependencies: KEZEK-019, KEZEK-032, KEZEK-033

Expected files: `frontend/src/routes/index.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Join sends no customer name and navigates to the returned private token route.
- [ ] **AC-2:** Pending joins suppress rapid repeat submissions.
- [ ] **AC-3:** Uncertain responses and closed queues recover without creating another logical ticket.

## 35. Integrate ticket viewing, polling and cancellation
Goal: Keep the private ticket page accurate throughout its lifecycle.
Description: Using ticket read/cancel endpoints and the API facade, adapt the existing ticket route to token authorization, all six states, people ahead and estimated/unavailable wait text. Add five-second polling with abort cleanup, terminal-state stopping, last-refresh feedback and cancellation confirmation; test invalid links, recovery from network errors and rejected late cancellation.

Task ID: `KEZEK-035` · Priority: P0 · Area: frontend

Dependencies: KEZEK-020, KEZEK-021, KEZEK-032, KEZEK-034

Expected files: `frontend/src/routes/ticket.$id.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** All six ticket states and estimated/unavailable wait are rendered correctly.
- [ ] **AC-2:** Five-second polling stops on terminal states and aborts obsolete requests.
- [ ] **AC-3:** Cancellation confirmation, invalid links, last-refresh feedback and network recovery have tests.

## 36. Integrate login, logout and protected navigation
Goal: Give staff and admins session-aware access to their screens.
Description: Using the cookie-aware API client, replace bearer-token assumptions with login, current-user restoration, logout and CSRF handling in the existing login flow and TanStack route guards. Test failed login, reload, expiry, role-based navigation and logout, ensuring unauthorized screens do not expose cached protected data.

Task ID: `KEZEK-036` · Priority: P0 · Area: frontend

Dependencies: KEZEK-014, KEZEK-015, KEZEK-032

Expected files: `frontend/src/lib/session.ts`, `frontend/src/routes/login.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Cookie session identity survives reload without bearer-token storage.
- [ ] **AC-2:** Login, logout, expiry and role-based navigation are tested.
- [ ] **AC-3:** Logout and access denial clear protected cached data.

## 37. Integrate the staff dashboard
Goal: Let assigned staff operate real queues and current tickets.
Description: Using staff endpoints and authenticated navigation, adapt the dashboard to counter/service selection, queue refresh and call-next/start/complete/no-show actions. Show only valid actions for the current state and handle empty queues, busy-counter conflicts, expired sessions and stale data, with component tests for successful updates and rejected mutations.

Task ID: `KEZEK-037` · Priority: P0 · Area: frontend

Dependencies: KEZEK-023, KEZEK-024, KEZEK-025, KEZEK-032, KEZEK-036

Expected files: `frontend/src/routes/staff.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Staff can select only authorized counters and eligible service queues.
- [ ] **AC-2:** Call/start/complete/no-show update the dashboard with only valid state actions.
- [ ] **AC-3:** Tests cover successful refresh, busy conflicts, empty queues, expiry and rejected mutations.

## 38. Integrate admin service and queue controls
Goal: Let admins edit services and daily queue availability through real APIs.
Description: Using admin service and manual queue endpoints, implement or adapt `/admin/services` with validated create/edit forms, activation, schedule inputs and authoritative queue open/close controls. Test successful saves, field errors, closure outside service hours and failed mutations without misleading local toggles, displaying times in the organization's timezone.

Task ID: `KEZEK-038` · Priority: P0 · Area: frontend

Dependencies: KEZEK-027, KEZEK-030, KEZEK-032, KEZEK-036

Expected files: `frontend/src/routes/`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Admin service forms persist activation, duration, schedule and other contracted fields.
- [ ] **AC-2:** Manual queue controls reflect server responses and service-hour constraints.
- [ ] **AC-3:** Validation failures and rejected saves do not appear successful.

## 39. Integrate admin counter configuration
Goal: Let admins maintain counters and supported services.
Description: Using counter and association endpoints, implement or adapt `/admin/counters` with counter create/edit, activation and service-link controls. Test empty configuration, same-organization service selection, rejected active-counter changes and failed saves, keeping loading and validation states accessible.

Task ID: `KEZEK-039` · Priority: P0 · Area: frontend

Dependencies: KEZEK-028, KEZEK-032, KEZEK-036

Expected files: `frontend/src/routes/`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Admin counter forms persist counter configuration and service associations.
- [ ] **AC-2:** Only same-organization services are offered and backend failures remain visible.
- [ ] **AC-3:** Tests cover empty configuration, invalid inputs and changes affecting active tickets.

## 40. Integrate admin staff configuration
Goal: Let admins create staff and manage counter assignments.
Description: Using staff and assignment endpoints, implement or adapt `/admin/staff` with staff forms, activation and assignment creation/removal. Test field validation, duplicate identities, empty assignment lists and rejected changes during active service; never display or retain submitted passwords after the operation.

Task ID: `KEZEK-040` · Priority: P0 · Area: frontend

Dependencies: KEZEK-029, KEZEK-032, KEZEK-036

Expected files: `frontend/src/routes/`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Admins can create/edit staff and add/remove counter assignments.
- [ ] **AC-2:** Submitted passwords are cleared and not exposed after save.
- [ ] **AC-3:** Tests cover duplicate identities, empty assignments, invalid inputs and rejected active-work changes.

## 41. Integrate real admin analytics
Goal: Replace placeholder metrics with date-filtered backend results.
Description: Using the analytics endpoint, adapt `/admin` cards and basic tables/charts to issued, waiting, completed, mean wait, mean service duration and per-service counts. Test date changes, empty results, unavailable averages and request failures, and remove hardcoded values or controls without a backend operation.

Task ID: `KEZEK-041` · Priority: P0 · Area: frontend

Dependencies: KEZEK-031, KEZEK-032, KEZEK-036

Expected files: `frontend/src/routes/admin.tsx`, `frontend/src/test/`

Acceptance criteria:

- [ ] **AC-1:** Dashboard counts and duration metrics come from the real analytics endpoint.
- [ ] **AC-2:** Date filters and per-service results update together.
- [ ] **AC-3:** Empty data, null averages and network errors render without fabricated metrics.

## 42. Add token privacy and basic abuse protection
Goal: Prevent accidental credential disclosure and bound abusive requests.
Description: With auth and ticket endpoints available, redact token-bearing paths and credentials from application/server logs, set suitable referrer policy for private ticket pages and configure practical login/join rate limits. Test that captured logs contain no raw tokens or passwords and that throttled requests return the contracted safe error without issuing extra tickets.

Task ID: `KEZEK-042` · Priority: P0 · Area: security

Dependencies: KEZEK-015, KEZEK-019, KEZEK-020

Expected files: `backend/app/`, `frontend/src/routes/`, `backend/tests/`

Acceptance criteria:

- [ ] **AC-1:** Application and server logs do not contain raw ticket/session tokens or passwords.
- [ ] **AC-2:** Private ticket pages use a suitable referrer policy.
- [ ] **AC-3:** Login and join rate limits return safe errors without creating unintended sessions or tickets.

## 43. Verify migrations and persistence across restart
Goal: Prove a fresh install and restarted backend retain valid data.
Description: With all models and endpoints implemented, run migrations and seed on a fresh temporary database, create tickets and configuration, then restart the application against that same file. Verify ticket access, numbering, events, configuration and analytics survive, and test foreign keys and history preservation after configuration deactivation.

Task ID: `KEZEK-043` · Priority: P0 · Area: tests

Dependencies: KEZEK-013, KEZEK-025, KEZEK-027, KEZEK-028, KEZEK-029, KEZEK-031

Expected files: `backend/tests/`, `docs/process.md`

Acceptance criteria:

- [ ] **AC-1:** Fresh migrations and repeated seed succeed on an isolated database.
- [ ] **AC-2:** After application restart ticket access, numbering, configuration and events persist.
- [ ] **AC-3:** Analytics and historical records survive configuration deactivation.

## 44. Add customer and staff browser workflows
Goal: Verify real customer-to-staff interactions in the browser.
Description: With customer and staff screens integrated, configure Playwright to start both applications against an isolated migrated and seeded SQLite database with mocks disabled. Add scenarios for join/call/start/complete and join/cancel, asserting the customer sees updated status and cancelled tickets cannot be called.

Task ID: `KEZEK-044` · Priority: P0 · Area: tests

Dependencies: KEZEK-013, KEZEK-035, KEZEK-037

Expected files: `frontend/`, `docs/process.md`

Acceptance criteria:

- [ ] **AC-1:** Playwright uses real applications and an isolated migrated/seeded SQLite database.
- [ ] **AC-2:** Customer join through staff call/start/complete ends in a visible completed ticket.
- [ ] **AC-3:** Cancelled customer tickets are never called by staff.

## 45. Add admin and access-control browser workflows
Goal: Verify configuration and unauthorized access end to end.
Description: Using the isolated real-backend Playwright setup, test an admin creating a service and counter, assigning staff and that staff seeing the assigned queue. Add anonymous protected-route access, wrong-role access, expired sessions and invalid private-ticket links, verifying browser feedback and backend denials.

Task ID: `KEZEK-045` · Priority: P0 · Area: tests

Dependencies: KEZEK-038, KEZEK-039, KEZEK-040, KEZEK-044

Expected files: `frontend/`, `docs/process.md`

Acceptance criteria:

- [ ] **AC-1:** Admin browser flow creates service/counter/assignment visible to the assigned staff.
- [ ] **AC-2:** Anonymous, wrong-role and expired-session requests are denied in UI and API.
- [ ] **AC-3:** Invalid private-ticket links show safe recoverable feedback.

## 46. Review responsive and accessible interaction states
Goal: Make required workflows usable on mobile and with a keyboard.
Description: With required screens integrated, review customer, login, staff and admin workflows for keyboard focus, labels, contrast, dialog behavior and mobile layout. Fix a bounded set of discovered UI defects and verify loading, empty, network-error and conflict states, filing additional session-sized issues for any remaining defects.

Task ID: `KEZEK-046` · Priority: P0 · Area: frontend

Dependencies: KEZEK-035, KEZEK-036, KEZEK-037, KEZEK-038, KEZEK-039, KEZEK-040, KEZEK-041

Expected files: `frontend/src/`, `docs/process.md`

Acceptance criteria:

- [ ] **AC-1:** Required screens are usable on mobile and with keyboard-only navigation.
- [ ] **AC-2:** Labels, focus, dialog behavior and contrast are reviewed and defects recorded.
- [ ] **AC-3:** Loading, empty, error and conflict states are manually verified or have focused regression tests.

## 47. Add continuous integration and API consistency checks
Goal: Run the required verification automatically on repository changes.
Description: Using established local commands and browser fixtures, configure CI to install locked dependencies and run frontend lint/typecheck/build/tests, backend checks/tests, fresh migrations and required Playwright workflows against isolated databases. Add a check that the documented OpenAPI contract matches the implemented schema and fix only pipeline/configuration failures within this task, recording product failures as focused issues.

Task ID: `KEZEK-047` · Priority: P0 · Area: ci

Dependencies: KEZEK-002, KEZEK-026, KEZEK-043, KEZEK-044, KEZEK-045

Expected files: `.github/workflows/`, `frontend/package.json`, `backend/`, `openapi.yml`

Acceptance criteria:

- [ ] **AC-1:** CI installs locked dependencies and runs documented frontend/backend checks.
- [ ] **AC-2:** Fresh migrations and required real-backend browser workflows run in isolated databases.
- [ ] **AC-3:** A failing OpenAPI consistency check blocks unnoticed contract drift.

## 48. Verify clean setup and complete delivery documentation
Goal: Make the MVP reproducible and report completion from evidence.
Description: Using the integrated application, test a clean install, migrations, seed, startup and one full manual workflow plus at least three failure cases, then update `README.md`, environment examples, demo instructions/screenshots and known limitations. Record exact results in `docs/process.md`, reconcile `docs/decisions.md` and issue acceptance criteria, and file reproducible `bug`/`user-test-bug` issues for unresolved findings rather than claiming the MVP complete.

Task ID: `KEZEK-048` · Priority: P0 · Area: docs

Dependencies: KEZEK-003, KEZEK-026, KEZEK-041, KEZEK-042, KEZEK-043, KEZEK-044, KEZEK-045, KEZEK-046, KEZEK-047

Expected files: `README.md`, `docs/`, `.env.example`

Acceptance criteria:

- [ ] **AC-1:** Clean install, migration, seed, startup and a complete manual workflow are verified.
- [ ] **AC-2:** At least three failure cases and all required check outcomes are recorded.
- [ ] **AC-3:** Documentation and issue status reflect unresolved bugs and actual acceptance evidence.

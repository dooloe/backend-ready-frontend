# Kezek MVP backlog

This backlog implements [the plan](../docs/plan.md) using [the selected architecture](../docs/architecture.md): the existing React/TypeScript/TanStack frontend, FastAPI, SQLAlchemy, Alembic and SQLite. Paths are relative to the repository root containing `frontend/`, `backend/` and `docs/`; preserve the existing frontend.

Each task is intended for one focused session. Prerequisites identify required artifacts, not required reading of other task descriptions; each assignee should use the current repository, plan, architecture and agreed API contract. Before implementation, find or create the task's GitHub issue as required by the plan; record verification in `docs/process.md` and close only verified work. These are planned tasks, not completed features; optional public displays and other post-MVP features are excluded.

## 1. Set up an empty project with a passing test
Goal: Establish a minimal runnable backend with one passing automated test.
Description: Initialize the empty `backend/` directory as a Python/FastAPI project with dependency configuration, an application entry point and a Pytest smoke test that imports or starts the application. Keep this task free of product features and preserve the existing React application; document and run the exact setup and test commands.

## 2. Establish frontend verification commands
Goal: Make the existing frontend build and test reproducibly.
Description: Inspect the existing React/TypeScript/TanStack application and preserve its screens while standardizing installation, lint, typecheck, build and Vitest commands in `frontend/package.json`. Verify the existing application can render under its test setup and record any existing failures separately from new changes.

## 3. Document project workflow and decisions
Goal: Give contributors a reliable implementation and verification workflow.
Description: Create or update `docs/decisions.md`, `docs/process.md`, `docs/chat-brainstorm.md`, `README.md` and `AGENTS.md` without discarding existing guidance. Record the selected SQLite/FastAPI stack, retention of TanStack routing, issue workflow and how to record actual commands and outcomes; review links and paths for consistency.

## 4. Resolve ticket issuance and retry semantics
Goal: Define recoverable anonymous ticket issuance without storing raw ticket tokens.
Description: Document the exact join request, queue-scoped idempotency key behavior and private-token lifecycle, including duplicate requests, simultaneous retries and a lost creation response. Resolve how the customer can recover access while retaining hash-only token storage and avoiding another issued ticket; record any necessary product deviation and concrete request/response examples before coding issuance.

## 5. Define the public API contract
Goal: Specify anonymous organization, service, queue and ticket operations.
Description: Using the issuance decision, write the public section of `openapi.yml` for organization and service directories, queue summaries, join, private ticket read and cancellation under `/api`. Include schemas, token access rules, status casing, null wait estimates, idempotency behavior and examples for closed queues, invalid tokens, validation errors and conflicts; reconcile these with the current `frontend/src/lib/api` contract.

## 6. Define the authentication and staff API contract
Goal: Specify cookie authentication and counter-authorized ticket actions.
Description: Extend `openapi.yml` with login, logout, current identity, CSRF handling, assigned queue listing, call-next, start, complete and no-show operations. Define counter selection, session expiry, empty queues, structured errors and organization/assignment rules, including `401`, `403` and `409` examples; document the migration from the current bearer-token frontend contract.

## 7. Define the administration API contract
Goal: Specify all administrator configuration and reporting operations.
Description: Extend `openapi.yml` with service and counter management, counter-service associations, staff creation/editing, staff assignments, manual daily queue opening/closing and date-filtered analytics. Define organization scoping, deactivation instead of destructive history deletion, schedule validation and concrete mutation paths; validate the full OpenAPI document and record metric definitions.

## 8. Define page contracts and shared UI states
Goal: Make each required screen implementable against agreed API examples.
Description: Document customer directory, private ticket, login, staff dashboard and admin configuration routes using the existing TanStack router. Map each screen to API operations and specify loading, empty, validation, authorization, refresh-failure and success states, including mobile layouts and the removal of customer-name inputs.

## 9. Add backend configuration and safe error responses
Goal: Provide a configurable FastAPI foundation with predictable errors.
Description: With the backend scaffold and API contracts available, add environment-backed settings, non-secret `.env.example`, router registration and a consistent `code`, `message`, `details` error envelope. Test configuration validation and representative validation/conflict responses, keeping secrets and database files out of source control.

## 10. Configure SQLite sessions and migrations
Goal: Establish isolated, migration-managed database access.
Description: Using the backend foundation, configure SQLAlchemy request sessions, Alembic, foreign keys, WAL, a bounded busy timeout and service-owned transaction boundaries. Add temporary file-backed test databases and verify connection settings, rollback behavior and migration startup without touching the development database.

## 11. Add organization and configuration models
Goal: Persist organizations, users, services, counters and assignments.
Description: Using the SQLite foundation, add SQLAlchemy models and an Alembic migration for organizations, users, services, counters, counter-service links and staff assignments with the fields in `docs/plan.md`. Test uniqueness, foreign keys and historical-data-preserving deletion rules; identify cross-organization checks that services must enforce.

## 12. Add queue, ticket, event and session models
Goal: Persist queue activity and authentication with database constraints.
Description: Extend the migrated schema with daily queues, tickets, ticket events and hashed server-session records, following the agreed issuance contract. Test unique service/date queues, daily ticket numbering, token hashes, queue-scoped idempotency keys and at most one `CALLED` or `SERVING` ticket per counter, including rollback on constraint failures.

## 13. Add deterministic development seed data
Goal: Make a fresh database usable for local testing.
Description: With all schema migrations available, provide a repeatable seed command for an `Asia/Almaty` organization, example services, counters, assignments and Argon2id-hashed demo admin/staff accounts. Document development-only credentials and verify rerunning the seed does not duplicate configuration or destroy existing tickets.

## 14. Implement login and server-managed sessions
Goal: Authenticate active staff and admins using secure cookies.
Description: Using persisted users and sessions plus the authentication contract, implement Argon2id password verification, opaque session issuance, expiry and current-identity lookup. Test valid and invalid credentials, inactive users, expired sessions and HttpOnly/SameSite cookie settings, enabling Secure cookies under HTTPS without logging credentials.

## 15. Add CSRF protection, logout and browser connectivity
Goal: Make cookie-authenticated browser mutations safe and usable.
Description: With login implemented, add the contracted CSRF mechanism, logout invalidation and same-origin development API proxying, with explicit credentialed CORS only if separate origins are required. Test rejected missing/invalid CSRF tokens, successful authenticated mutations, logout revocation and allowed/disallowed origins.

## 16. Implement reusable authorization checks
Goal: Enforce roles, organization ownership and counter assignments on the backend.
Description: Using current-identity lookup and persisted configuration, add service-level checks for active staff/admin users, organization-scoped records and authorized active counters. Test anonymous access, wrong roles, another organization's records, inactive assignments and forged counter IDs; apply these checks as each protected endpoint is introduced.

## 17. Implement organization-local queue scheduling
Goal: Determine the correct daily queue and whether joining is allowed.
Description: Using service and daily-queue models, implement UTC-to-IANA-timezone date selection, simple daily opening hours, inactive-service handling and manual-closure precedence. Ensure daily queues can be created safely on demand and test midnight boundaries, opening/closing edges and simultaneous first access; document the supported behavior for overnight schedules.

## 18. Implement public organization and service directories
Goal: Let anonymous customers discover services and current queue availability.
Description: With scheduling available, implement `GET /api/organizations` and `GET /api/organizations/{org_id}/services` using the public contract. Return active services, current daily queue identifiers and availability without private ticket data, and test unknown organizations, empty catalogs and closed services.

## 19. Implement transactional ticket issuance
Goal: Create one private, sequentially numbered ticket per logical join.
Description: Using the issuance decision, queue scheduling and migrated ticket schema, implement `POST /api/queues/{queue_id}/tickets` with an appropriate SQLite write reservation before mutable reads. Atomically validate availability, resolve idempotency, allocate the sequence, hash the access token, insert the ticket and append its event; test duplicates, lost-response recovery, closed queues and rollback.

## 20. Implement private ticket lookup and wait estimates
Goal: Return authoritative ticket status, people ahead and an honest wait estimate.
Description: With persisted tickets and the public contract, implement `GET /api/tickets/{token}` using hashed-token lookup and FIFO waiting-position queries. Calculate estimates from waiting tickets ahead, typical duration and eligible active counters, returning `null` when unavailable; test invalid tokens, every lifecycle state and position changes without exposing internal IDs as access credentials.

## 21. Implement anonymous ticket cancellation
Goal: Allow token holders to cancel only waiting tickets.
Description: Using private token lookup and transaction support, implement `POST /api/tickets/{token}/cancel` with atomic state validation, cancellation timestamp and event insertion. Test successful cancellation, invalid tokens, repeated cancellation and cancellation racing with call-next, ensuring a ticket cannot be both cancelled and called.

## 22. Implement public aggregate queue status
Goal: Expose current queue summaries without private ticket data.
Description: With daily queues and tickets available, implement `GET /api/queues/{queue_id}/status` according to the public contract, including open/closed state and relevant aggregate counts. Test unknown queues and changes after join, cancel and completion, and assert responses contain no access tokens, customer information or staff-only details.

## 23. Implement staff queue discovery
Goal: Show staff only the queues and counters they can operate.
Description: Using session authorization and counter-service assignments, implement `GET /api/staff/queues` with authorized counters, eligible service queues and current counter tickets. Test multiple services per counter, multiple assignments, inactive configuration, empty results and cross-organization isolation.

## 24. Implement atomic call-next
Goal: Assign the oldest waiting ticket to one authorized idle counter.
Description: With staff authorization and transactional ticket models, implement `POST /api/staff/queues/{queue_id}/call-next` using a SQLite write reservation before checking the counter and selecting a ticket. Atomically set `CALLED`, the counter and timestamp plus its event; test FIFO, empty queues, busy counters, closed queues with outstanding tickets and unauthorized counter/service combinations.

## 25. Implement start, complete and no-show actions
Goal: Enforce the staff ticket lifecycle with timestamps and audit events.
Description: Using the staff API contract and authorization checks, implement `CALLED -> SERVING`, `SERVING -> COMPLETED` and `CALLED -> NO_SHOW` as atomic service operations. Test every invalid transition, wrong-counter actions and cross-organization access, confirming completion/no-show releases counter capacity and records the correct timestamp and actor.

## 26. Verify queue concurrency and lock contention
Goal: Prove parallel requests cannot duplicate numbers or counter assignments.
Description: With join, cancellation and staff mutations available, add parallel API tests against temporary file-backed SQLite databases using independent sessions and the actual transaction configuration. Cover concurrent joins and same-key retries, competing counters, two calls at one counter, cancellation races and bounded lock contention; fix failures and document the supported single-worker demo setup.

## 27. Implement admin service management
Goal: Let organization admins configure services and schedules.
Description: Using the administration contract and authorization layer, implement service list/create/update operations for names, prefixes, durations, opening hours and activation. Test validation, organization isolation and deactivation without deleting history, and define behavior when changing a prefix or schedule for a service with an existing daily queue.

## 28. Implement admin counter and service associations
Goal: Let organization admins configure counters and the services they support.
Description: Using the administration contract, implement counter list/create/update and counter-service association operations with same-organization validation. Test duplicate links, unsupported services, deactivation and changes while a counter has a called/serving ticket, preserving the ability to finish existing work safely.

## 29. Implement admin staff and assignment management
Goal: Let organization admins maintain staff access to counters.
Description: Using user/session models and the administration contract, implement staff listing, creation, supported edits and assignment creation/removal without exposing password hashes. Test password hashing, duplicate identities, inactive users, cross-organization links and assignment changes during active service, including the agreed session-revocation behavior.

## 30. Implement manual daily queue opening and closing
Goal: Make queue availability controls authoritative on the backend.
Description: Using queue scheduling and admin authorization, implement the contracted operation for changing a daily queue's manual open/closed state. Test organization ownership, interaction with service hours, rejected joins after closure and continued viewing and staff processing of existing tickets.

## 31. Implement date-filtered operational analytics
Goal: Calculate dashboard metrics from stored queue activity.
Description: Using persisted ticket timestamps and the analytics contract, implement organization-scoped issued, waiting and completed counts, mean completed-ticket wait, mean service duration and per-service totals. Test organization-local date boundaries, empty datasets, incomplete tickets and known timestamp fixtures so all averages and filters have verifiable meanings.

## 32. Align the frontend API facade with the real contract
Goal: Give every screen one typed, cookie-aware backend interface.
Description: With the agreed OpenAPI document and authentication flow available, update `frontend/src/lib/api/types.ts`, `http.ts` and the exported facade for all required operations, credentials, CSRF and structured errors. Preserve compatible screen behavior through focused adapter changes, isolate deterministic mocks for UI work and test representative HTTP failures, aborts and private-token requests.

## 33. Integrate the customer service directory
Goal: Display real organizations, services and join availability.
Description: Using the API facade and public directory endpoints, adapt the existing customer landing page to organization selection, queue summaries and timezone-labeled service hours. Add focused component tests for open/closed services, empty organizations, loading and retryable errors, with all calls going through the central facade.

## 34. Integrate the customer join flow
Goal: Issue an anonymous ticket and navigate to its private link.
Description: Using the real issuance endpoint and typed client, remove customer-name collection, submit the contracted idempotency data and navigate to `/ticket/:token` after a successful join. Prevent rapid repeat submissions and test closed-queue errors, uncertain/lost responses and recovery according to the issuance decision without creating another logical ticket.

## 35. Integrate ticket viewing, polling and cancellation
Goal: Keep the private ticket page accurate throughout its lifecycle.
Description: Using ticket read/cancel endpoints and the API facade, adapt the existing ticket route to token authorization, all six states, people ahead and estimated/unavailable wait text. Add five-second polling with abort cleanup, terminal-state stopping, last-refresh feedback and cancellation confirmation; test invalid links, recovery from network errors and rejected late cancellation.

## 36. Integrate login, logout and protected navigation
Goal: Give staff and admins session-aware access to their screens.
Description: Using the cookie-aware API client, replace bearer-token assumptions with login, current-user restoration, logout and CSRF handling in the existing login flow and TanStack route guards. Test failed login, reload, expiry, role-based navigation and logout, ensuring unauthorized screens do not expose cached protected data.

## 37. Integrate the staff dashboard
Goal: Let assigned staff operate real queues and current tickets.
Description: Using staff endpoints and authenticated navigation, adapt the dashboard to counter/service selection, queue refresh and call-next/start/complete/no-show actions. Show only valid actions for the current state and handle empty queues, busy-counter conflicts, expired sessions and stale data, with component tests for successful updates and rejected mutations.

## 38. Integrate admin service and queue controls
Goal: Let admins edit services and daily queue availability through real APIs.
Description: Using admin service and manual queue endpoints, implement or adapt `/admin/services` with validated create/edit forms, activation, schedule inputs and authoritative queue open/close controls. Test successful saves, field errors, closure outside service hours and failed mutations without misleading local toggles, displaying times in the organization's timezone.

## 39. Integrate admin counter configuration
Goal: Let admins maintain counters and supported services.
Description: Using counter and association endpoints, implement or adapt `/admin/counters` with counter create/edit, activation and service-link controls. Test empty configuration, same-organization service selection, rejected active-counter changes and failed saves, keeping loading and validation states accessible.

## 40. Integrate admin staff configuration
Goal: Let admins create staff and manage counter assignments.
Description: Using staff and assignment endpoints, implement or adapt `/admin/staff` with staff forms, activation and assignment creation/removal. Test field validation, duplicate identities, empty assignment lists and rejected changes during active service; never display or retain submitted passwords after the operation.

## 41. Integrate real admin analytics
Goal: Replace placeholder metrics with date-filtered backend results.
Description: Using the analytics endpoint, adapt `/admin` cards and basic tables/charts to issued, waiting, completed, mean wait, mean service duration and per-service counts. Test date changes, empty results, unavailable averages and request failures, and remove hardcoded values or controls without a backend operation.

## 42. Add token privacy and basic abuse protection
Goal: Prevent accidental credential disclosure and bound abusive requests.
Description: With auth and ticket endpoints available, redact token-bearing paths and credentials from application/server logs, set suitable referrer policy for private ticket pages and configure practical login/join rate limits. Test that captured logs contain no raw tokens or passwords and that throttled requests return the contracted safe error without issuing extra tickets.

## 43. Verify migrations and persistence across restart
Goal: Prove a fresh install and restarted backend retain valid data.
Description: With all models and endpoints implemented, run migrations and seed on a fresh temporary database, create tickets and configuration, then restart the application against that same file. Verify ticket access, numbering, events, configuration and analytics survive, and test foreign keys and history preservation after configuration deactivation.

## 44. Add customer and staff browser workflows
Goal: Verify real customer-to-staff interactions in the browser.
Description: With customer and staff screens integrated, configure Playwright to start both applications against an isolated migrated and seeded SQLite database with mocks disabled. Add scenarios for join/call/start/complete and join/cancel, asserting the customer sees updated status and cancelled tickets cannot be called.

## 45. Add admin and access-control browser workflows
Goal: Verify configuration and unauthorized access end to end.
Description: Using the isolated real-backend Playwright setup, test an admin creating a service and counter, assigning staff and that staff seeing the assigned queue. Add anonymous protected-route access, wrong-role access, expired sessions and invalid private-ticket links, verifying browser feedback and backend denials.

## 46. Review responsive and accessible interaction states
Goal: Make required workflows usable on mobile and with a keyboard.
Description: With required screens integrated, review customer, login, staff and admin workflows for keyboard focus, labels, contrast, dialog behavior and mobile layout. Fix a bounded set of discovered UI defects and verify loading, empty, network-error and conflict states, filing additional session-sized issues for any remaining defects.

## 47. Add continuous integration and API consistency checks
Goal: Run the required verification automatically on repository changes.
Description: Using established local commands and browser fixtures, configure CI to install locked dependencies and run frontend lint/typecheck/build/tests, backend checks/tests, fresh migrations and required Playwright workflows against isolated databases. Add a check that the documented OpenAPI contract matches the implemented schema and fix only pipeline/configuration failures within this task, recording product failures as focused issues.

## 48. Verify clean setup and complete delivery documentation
Goal: Make the MVP reproducible and report completion from evidence.
Description: Using the integrated application, test a clean install, migrations, seed, startup and one full manual workflow plus at least three failure cases, then update `README.md`, environment examples, demo instructions/screenshots and known limitations. Record exact results in `docs/process.md`, reconcile `docs/decisions.md` and issue acceptance criteria, and file reproducible `bug`/`user-test-bug` issues for unresolved findings rather than claiming the MVP complete.

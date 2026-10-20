# Kezek QA test plan

This is the release-gate checklist for the current frontend and FastAPI backend. Run automated checks against a fresh, isolated test database; do not use the developer or production database for test mutations. A case passes only when every expected result is observed. Record the date, build/commit, environment, evidence, and Pass/Fail/Blocked result beside each run.

## Test environment and commands

From the repository root, install dependencies once and run the automated baseline:

```sh
make install
make test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
make build
```

For browser checks, start the integrated local application with `make dev`, use the seeded demo accounts shown in `backend/README.md`, and verify that `VITE_API_BASE_URL` points to that local API. Start with a clean browser profile or reset mock data before exercising the mock. For persistence checks, use a disposable SQLite file and restart the backend against that same file.

## Release-blocking test cases (P0)

### QA-001 — Service catalog loads and recovers from API failure

**Preconditions:** Open the customer home page with the API available, then repeat with the API unavailable during the initial request.

**Steps:** Load `/`; verify the seeded services; stop or block the API and reload; restore it and use the page's retry action.

**Expected:** The page shows a loading indicator while fetching, lists active and closed services after success, and clearly displays a recoverable error with a retry action after failure. Closed services cannot be submitted. No failed request leaves a blank, unexplained service area.

**Current result:** **Automated regression passes; browser case not run.** The catalog component test forces a failed request, retries, and verifies recovery. Manual API-outage verification remains outstanding.

### QA-002 — Customer joins an open queue and receives a usable ticket

**Preconditions:** A service is open and the backend is seeded or reset.

**Steps:** Submit a valid customer name for an open service; join again; inspect each ticket page and the stored tickets.

**Expected:** Each successful submission gets a unique sequential ticket number and navigates to its ticket page. The page shows the service, ticket code, waiting status, position and estimated wait (or a clear unavailable state). A failed submission gives actionable feedback and does not create a duplicate ticket.

### QA-003 — Ticket status and position update as the queue changes

**Preconditions:** At least two customers have joined the same open service; a staff user can operate its counter.

**Steps:** Keep the second customer's ticket page open; have staff call and serve the first customer; observe the second page through at least one refresh interval and through completion.

**Expected:** Ticket status and position come from the server and update without manual reload. The displayed wait is labeled as an estimate. Terminal tickets stop unnecessary polling. A temporary polling failure is visible and recovers on a later successful refresh.

**Current result:** **Polling-policy regression passes; browser case not run.** Terminal states now disable the query interval; active and not-yet-loaded tickets retain the three-second interval.

### QA-004 — Customer cancellation is safe and final

**Preconditions:** A customer has a waiting ticket and a staff user can call next.

**Steps:** Cancel the ticket from its private page; attempt to cancel it again; have staff call the next ticket.

**Expected:** The ticket becomes cancelled, no longer appears in the waiting queue, cannot be called or cancelled a second time, and its terminal page remains readable.

### QA-005 — Staff completes the ticket lifecycle and respects counter occupancy

**Preconditions:** An authenticated staff account is assigned to a counter serving the target service; at least two tickets wait.

**Steps:** Call next, attempt another call while the first ticket is called, start service, attempt another call while it is serving, then complete the ticket and call the next one.

**Expected:** FIFO order is preserved; the counter cannot hold two active tickets; only valid `WAITING → CALLED → SERVING → COMPLETED` transitions succeed; the queue and customer ticket views reflect each transition and timestamps.

### QA-006 — Staff marks a called ticket as no-show

**Preconditions:** A waiting ticket can be called at an active counter.

**Steps:** Call the ticket and mark it no-show; try the no-show action on a waiting and then on a completed ticket.

**Expected:** Only the called ticket transitions to `NO_SHOW`; it leaves the active queue, records its finish time, and invalid transitions return a conflict without changing stored state.

### QA-007 — Authentication and role checks are enforced by the backend

**Preconditions:** Have anonymous, staff, and admin sessions.

**Steps:** Call protected staff/admin operations without a token, with an invalid/expired token, with a staff token against admin operations, and with an admin token against permitted operations. Also try to read/call a counter and transition a ticket outside the staff member's assignment.

**Expected:** Anonymous and invalid sessions receive 401; staff receive 403 for admin-only operations; allowed users can proceed. Staff cannot access or mutate counters/tickets outside their assignment. UI route messaging is not treated as authorization—the API must enforce every restriction. Responses do not expose passwords, bearer tokens, stack traces, or database details.

**Current result:** **Backend regression passes.** An unassigned staff account is denied access to another user's counter and its tickets; an unassigned counter remains available to staff, matching the dashboard behavior.

### QA-008 — Admin service, counter, assignment, and analytics workflow

**Preconditions:** An authenticated admin account and disposable test data.

**Steps:** Create a service; create a counter; associate the counter with that service and a staff account; verify the staff dashboard; close the service; inspect analytics; delete test configuration where allowed.

**Expected:** Valid changes persist and appear in the corresponding views; invalid associations and inputs are rejected without partial writes; a closed service rejects new joins while existing work remains manageable; analytics agree with ticket timestamps and status counts.

### QA-009 — SQLite data survives a backend restart

**Preconditions:** A disposable SQLite path configured through `DATABASE_URL`.

**Steps:** Start the backend, create a ticket and an admin-managed record, stop the process cleanly, restart it with the same URL, and retrieve those records.

**Expected:** Records and ticket lifecycle state survive restart; foreign keys remain enforced; the process does not silently switch to a different/default database.

### QA-010 — Concurrent queue operations do not corrupt state

**Preconditions:** Use an isolated SQLite database and multiple queued tickets; run requests through independent clients/processes.

**Steps:** Submit concurrent joins for the same service; then submit simultaneous call-next requests against the same counter and, separately, different eligible counters.

**Expected:** Ticket numbers are unique and sequential; no ticket is assigned twice; a counter never has multiple active tickets; transaction conflicts produce a bounded, safe error and leave consistent state.

## Additional release cases (P1)

### QA-011 — Validation and server errors are safe and understandable

Submit malformed bodies, missing fields, unknown service/ticket/counter IDs, illegal status transitions, and trigger a controlled unexpected server error in a test-only route. Expect stable structured errors, useful field details, no secret/input leakage in responses or logs, and no partial database mutation.

### QA-012 — Frontend forms preserve input after server-side failure

Cause a service, counter, staff, or login request to fail validation or return an API error. Expect an inline/toast message and the user's entered values to remain available for correction. No form should report success or clear data before the server confirms the mutation.

**Current result:** **Service-form regression passes.** Form values now clear only after successful service, counter, and staff creation responses; the automated component test forces a service-create failure and verifies values remain. Counter/staff error paths have not been exercised in a browser.

### QA-013 — Responsive and keyboard-accessible core flows

At narrow mobile width and desktop width, complete customer join/cancel and staff login/call flows using keyboard navigation. Expect no clipped controls or horizontal overflow, visible focus, labeled inputs, logical heading order, and operable buttons/selects.

### QA-014 — Clean local setup and service startup

Follow the documented clean-checkout setup with supported Node.js and Python versions, configure a fresh database URL, install dependencies, start both services, open the UI and API docs, and run all checks. Expect setup to complete without undocumented manual edits and the frontend to use the configured local API.

## Current verification record

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend unit tests | Pass | `npm --prefix frontend test` — 15 tests passed across 5 files, including catalog recovery, polling policy, and service form preservation. |
| Frontend production build | Pass | `npm --prefix frontend run build` — client, SSR, and Nitro builds completed. Existing Vite config emitted advisory warnings about `vite-tsconfig-paths` and `inlineDynamicImports`. |
| Backend suite | Pass | `backend/.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider` — 119 passed in 64.98s. One Starlette/httpx deprecation warning. |
| Typecheck | Pass | `npm --prefix frontend run typecheck` — passed with the new regression tests included. |
| Lint | Pass with warnings | `npm --prefix frontend run lint` — exit 0, 7 warnings (6 UI fast-refresh warnings and one staff hook dependency warning). |
| Manual browser/E2E cases | Not run | Cases QA-001 through QA-014 require interactive browser and/or an integrated live application. |

## Defects found and current disposition

| ID | Severity | Defect | Disposition / evidence |
| --- | --- | --- | --- |
| BUG-001 | P0 | Customer service catalog request failure had no visible error or retry state, leaving the home page apparently empty. | Fixed. `service-catalog.test.tsx` verifies error, retry, and recovery. |
| BUG-002 | P1 | Ticket page continued polling every three seconds after the ticket reached a terminal state. | Fixed. `ticket-polling.test.ts` covers all terminal and active statuses. |
| BUG-003 | P0 | Staff API operations did not enforce counter/staff assignment; any authenticated staff account could access and operate counters by ID. | Fixed. Backend regression covers counter list, queue read, call-next, and ticket transition authorization. |
| BUG-004 | P1 | Service/counter/staff creation forms cleared user input before the API mutation succeeded. | Fixed. Service form regression verifies preserving values on error and clearing on success; counter/staff browser paths remain unrun. |

**Release gate:** all P0 cases must pass; P1 cases must pass before declaring the MVP ready for general use. Do not mark a case Pass based only on a successful build or an unrelated unit test. Update the verification record with actual run evidence, and keep failed or unrun cases explicit.

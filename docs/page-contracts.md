# Planned page and interaction contracts (#8)

These are implementable UX contracts, not verified UI features. Operation names
refer to [planned OpenAPI](../openapi.yml), with [current-client migration](api-migration.md).
Keep TanStack Router/Start and the existing design system; all calls go through
the typed API facade. Do not relocate the application.

## Shared interaction states

- Loading: named skeleton/status with aria-live=polite; disable dependent actions,
  retain page heading and navigation. Do not show a fake empty queue before data.
- Empty: explain an empty catalog/assignment/report and provide a meaningful
  action, such as changing organization/date or opening admin configuration.
- Validation: keep entered values on failure, associate field errors with labels
  using aria-describedby, focus the first invalid field; show safe server message.
- Unauthorized: 401 clears protected cached data and routes to login with a safe
  internal return path. 403 displays access denied and never renders stale admin
  data. The backend remains authoritative for every action.
- Refresh/network failure: retain prior successful data with a visible stale
  label and last-successful-refresh time, display retry, and do not claim a
  mutation succeeded. Abort obsolete reads on navigation/selection change.
- Conflict: preserve user input; display the server message, refresh relevant
  state and allow a new explicit action. Never replay an uncertain join with a
  new key. Pending mutations disable double submission and announce progress.
- Success: show returned authoritative data, invalidate affected query keys and
  announce a concise outcome. A successful save alone clears sensitive input.

On narrow screens stack cards/forms, keep buttons at least comfortable touch
size, and allow labelled table scrolling without horizontal page overflow.
Provide visible focus rings, persistent labels (not placeholders alone), semantic
headings and live status announcements. Dialogs trap focus, close with Escape,
and restore focus to the invoking button. Do not rely on status color alone.

## Customer directory `/`

Operations: `listOrganizations`, `listOrganizationServices`, `getQueueStatus`, `issueTicket`.

Organization selection loads active services with local hours, timezone, current
daily queue, authoritative open/closed status and approximate/unavailable wait.
Display empty organizations/services and retryable load failures separately.
Closed service cards explain hours and disable joining. Never collect customer
name, phone or other identity; remove the current name input during integration.

Before the first join request, save independent Web Crypto access/key proofs
scoped to queue in sessionStorage. Pending joins disable the action immediately.
On success navigate to returned ticketUrl; on uncertain network/503 outcome retain
the pair and offer recovery with the same queue/key/token, including after midnight.
On 409 closure refresh availability and explain; do not silently join a new queue.
Use a stacked one-column organization selector/cards on mobile; focus the ticket
heading after navigation. Follow [issuance semantics](ticket-issuance.md).

## Private ticket `/ticket/:token`

Operations: `readPrivateTicket`, `cancelPrivateTicket`.

The existing TanStack `/ticket/$id` parameter may carry the token; it is never an
internal ticket ID. Show number/service, all six lowercase states, people ahead
and explicitly estimated wait; null renders “Currently unavailable.” Called or
serving states show the assigned counter; terminal states show a clear outcome.
Do not show customer names or echo the token in DOM, telemetry, logs or referrers.

Poll every five seconds while waiting/called/serving; stop at completed/cancelled/
no_show and abort on unmount/token change. Display last successful refresh and
recoverable stale/error state. Invalid token gets a safe not-found panel and link
back to the directory; unknown status must not enable actions.

Waiting-only cancel opens a labelled confirmation dialog. Disable while pending;
use returned state on success. A call racing with cancellation yields a conflict
message and refresh, never an optimistic cancelled status. One centered card
fits mobile width; updates use a polite live region and do not steal focus.

## Login `/login` and protected navigation

Operations: `loginSession`, `currentIdentity`, `sessionCsrf`, `logoutSession`.

Use labelled username/password fields with appropriate autocomplete and a real
submit button. Pending disables repeat login; invalid credentials stay inline
without exposing whether an account exists. On success store identity/proof in
memory, retain only the HttpOnly session cookie, and route staff/admin by role.
Reload bootstraps current identity/CSRF from the server, not localStorage bearer
JSON. Password is cleared after a definitive login result. Network errors permit
an explicit retry without claiming authentication succeeded.

Logout awaits confirmed server revocation, clears protected query caches and
identity, then navigates to login. Expiry/access denial clears stale private
data. Display all controls on a narrow layout; focus login error or page heading
appropriately. Never treat hiding a navigation link as authorization.

## Staff `/staff`

Operations: `listStaffQueues`, `callNextTicket`, `startTicket`, `finishTicket`, `noShowTicket`.

Select among server-returned assigned active counters and their supported queues.
Empty assignments show an explanation; no counter selector manufactured from
unfiltered frontend data. Display one current ticket and waiting queue state.
Call-next requires an idle eligible counter; called offers start/no-show, serving
offers complete only. Disable all conflicting pending actions. Empty call-next
is a normal 200 null outcome with feedback; busy/state conflicts refresh data.
Unauthorized counter selection and session expiry show the shared denial states.

Poll relevant queue/current state every five seconds with cancellation on changes.
Render stacked current-ticket and waiting panels on mobile, keyboard-operable
counter selection, and labelled live action outcomes. Avoid stale actions after
counter changes by binding mutations to the selected server identity/counter.

## Admin overview `/admin`

Operations: `currentIdentity`, `getAnalytics`.

Admin-only overview reads real counts, completed-ticket mean wait/service duration,
per-service and day buckets from one filtered response. Date controls use paired
inclusive organization-local dates (default today, maximum 31 dates). Explain
timezone/filter scope and null averages; render zeros and an honest empty state.
No hardcoded chart values. Loading/errors stay visible; failed refresh retains
previous data labelled stale. Stack cards/date inputs and provide an accessible
scroll container for wide tables. Changes to filters abort obsolete requests.

## Admin services `/admin/services`

Operations: `listAdminServices`, `createAdminServices`, `updateAdminServices`, `listOrganizationServices`, `setQueueOverride`.

Create/edit name, description, prefix, positive duration, activation and local
opening/closing times. Validate non-overnight opensAt < closesAt and required
fields. Explain that prefix changes apply to future daily queues. Daily open/close
uses the queue override operation, never a frontend-only toggle; opening outside
hours is rejected. Show active-work restrictions; deactivation preserves history.
Retain values/errors after failed saves and update only from successful responses.
On mobile forms stack; confirmation dialogs explain deactivation/closing effects.

## Admin counters `/admin/counters`

Operations: `listAdminCounters`, `createAdminCounters`, `updateAdminCounters`, `listAdminServices`.

Create/edit counter name, activation and unique same-organization service links
from the server's admin service catalog. Empty configuration shows setup guidance.
Reject changes that would strand an active ticket with a visible error and
refreshed state. Keep submitted values on network/validation/conflict failures.
Label multi-selects/checkboxes, allow keyboard toggles and stack rows on mobile.
Do not hide inactive counters needed for editing/history.

## Admin staff `/admin/staff`

Operations: `listAdminStaff`, `createAdminStaff`, `updateAdminStaff`, `listAdminCounters`, `listStaffAssignments`, `createStaffAssignment`, `removeStaffAssignment`.

Create/edit identity, role and activation; optional password update is write-only.
Never display persisted passwords/hashes, clear submitted secrets on confirmed
save, and revoke sessions through backend behavior on password/deactivation.
Add/remove explicit same-organization counter assignments; show an empty set.
Duplicate identities and changes affecting active work stay visible, preserve
non-secret input, and do not appear successful. Explain admin-preservation errors.
Use labelled controls, focusable assignment actions and a stacked mobile layout.

## Integration verification required later

Component/browser issues must cover loading/empty/error recovery, failed saves,
closed joins and uncertain response recovery, all ticket states and terminal
polling, cancel/call conflict, cookie expiry and protected-cache clearing, assigned
counter limits, real analytics/nulls and keyboard/mobile interactions. This
document closes page specification only; it does not close those implementation
or browser issues. Existing admin tabs may remain while dedicated TanStack child
routes are added without relocating components or changing repository layout.

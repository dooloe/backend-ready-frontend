# Kezek — UX and Queue Workflow Improvement Requirements

## Product Goal

Kezek allows visitors to get a queue ticket online, wait somewhere convenient, track their position, and arrive at the service location before being called.

The main visitor journey is:

Choose an organization → choose a service → get a ticket → track the queue → respond to the staff call → receive the service.

The application must clearly communicate what the visitor should do at every step. Estimated waiting time must never be presented as a guaranteed appointment time.

## Implementation Instructions

- Read `AGENTS.md` and inspect the existing implementation before making changes.
- Implement these requirements within the existing application.
- Preserve existing data, project structure, working features, and supported languages.
- Reuse existing components and dependencies where practical.
- Follow repository rules for issues, dependency approval, testing, and documentation.
- Distinguish existing functionality from functionality that needs implementation.
- Make routine layout and wording decisions independently.
- Ask for clarification before implementing unresolved rules that affect queue order, ticket validity, or missed calls.
- Do not replace real backend integration with mock data.
- Demonstration organizations must remain clearly identified as fictional.
- Do not stop at a plan: implement the changes and verify the resulting workflows.

---

## 1. Explain the Product on the Main Page

### Problem

Visitors need to understand the purpose of Kezek before browsing organizations.

### Requirements

Add a short introduction above the organization directory.

Suggested English copy:

**Heading:**  
“Get your ticket online. Wait where it suits you.”

**Description:**  
“Choose an organization and service, get a digital ticket, and follow your queue.”

Display three short steps:

1. Choose an organization and service.
2. Get a ticket and track your position.
3. Arrive at the service location before you are called.

Adapt this wording to each supported interface language.

### Constraints

- Do not promise an exact service time.
- Do not describe the ticket as an appointment reservation.
- Keep the introduction compact so the organization directory remains easy to reach.
- Avoid adding a separate introductory screen that blocks access to the directory.

### Acceptance Criteria

- A first-time visitor can understand what Kezek does without opening another page.
- The main page explains both remote waiting and the need to arrive before the call.
- The directory is easy to access on desktop and mobile.

---

## 2. Improve the Organization Directory

### Problem

Organization cards are too tall, repeat demonstration explanations, and may show queue information that is ambiguous at the organization level.

### Requirements

Each organization card should display:

- Organization name.
- A small “Demo” badge where applicable.
- Category.
- City and address, when available.
- Opening hours or current opening status, when available.
- Number of available services.
- One clear action: “View services” or its localized equivalent.

Remove repeated demonstration paragraphs from individual cards.

Add one clear notice near the directory:

“Demonstration organizations. Tickets are not valid at real institutions.”

Retain a visible Demo badge on organization detail pages and tickets where needed to prevent misunderstanding.

If organizations exist in multiple cities, provide a city filter alongside the existing category filters.

### Queue Information Rules

- Show waiting estimates at the service level.
- Do not show a single organization-wide waiting estimate unless its meaning is explicitly defined and supported by the backend.
- Distinguish organization opening hours from whether a particular service accepts new tickets.
- Do not label every service as open simply because the organization is open.

### Acceptance Criteria

- Cards are shorter and easier to scan.
- Demonstration information is clear without repeated paragraphs.
- Filters work together and provide a useful empty state.
- Missing addresses or hours are handled honestly without invented values.
- Queue availability is not confused with organization opening status.

---

## 3. Simplify the Organization Detail Page

### Problem

The organization introduction occupies too much space and pushes services below the main visible area.

### Requirements

Use a compact organization header containing:

- Organization name.
- Demo badge, when applicable.
- Address.
- Today’s opening hours, when available.
- A short description only when it helps visitors choose a service.
- A “Back to organizations” link.

Replace vague text such as “Opening hours are listed below” with the actual available hours.

Avoid displaying technical timezone identifiers such as `Asia/Almaty` in normal visitor-facing copy. Format times in the organization’s local timezone.

Place the service list immediately below the compact header.

### Constraints

- Do not invent opening hours or addresses.
- If information is missing, show an appropriate unavailable state or omit an optional field.
- Do not confuse organization hours with service-specific hours.

### Acceptance Criteria

- Visitors can reach the service list with minimal scrolling.
- Address and hours are easy to locate.
- Navigation back to the directory preserves relevant filters where practical.

---

## 4. Make Service Choices Specific and Useful

### Problem

Generic service names such as “Student services” do not explain which visitor needs are supported.

### Requirements

Use meaningful localized names and short descriptions for demonstration services.

Example university services:

- Enrollment certificate — request proof of student status.
- Tuition payment questions — discuss payment and outstanding balances.
- Dormitory support — ask about accommodation and residence procedures.

These are fictional demo examples and must not be represented as confirmed services of a real university.

Each service card should show:

- Service name.
- Short description.
- Current number of waiting visitors.
- Approximate waiting time, when available.
- Ticket availability.
- Service hours, when available.
- Room or service area, when known.
- A primary “Get a ticket” action.

Clearly distinguish:
- The number of visitors already waiting before a ticket is issued.
- The number of people ahead of a particular visitor after ticket issuance.

### Closed and Unavailable States

When tickets cannot be issued:

- Disable the ticket action.
- Explain the reason.
- Show the next opening time only when known.

Example reasons:

- “Ticket issuance has ended for today.”
- “The service is temporarily paused.”
- “The queue has reached its capacity.”

### Acceptance Criteria

- Visitors can choose a service without interpreting technical or generic labels.
- Availability and waiting information reflect real backend data.
- Unknown waiting time displays “Estimate unavailable,” not zero.
- Waiting-time ranges are used only if the calculation supports them.
- The backend also rejects ticket issuance when the service is unavailable.

---

## 5. Simplify Ticket Confirmation

### Problem

The confirmation page includes technical explanations and uses wording that implies a place has already been reserved.

### Requirements

Keep one concise confirmation step before creating a ticket.

Suggested title:

“Get your ticket”

Display:

- Organization.
- Service.
- Address, when available.
- Current queue length.
- Approximate waiting time, when available.
- A brief explanation of what happens next.

Suggested explanation:

“After receiving your ticket, you can track your queue position on the next page.”

Use a primary button:

“Get a ticket”

Provide a secondary “Back to services” link.

Remove normal-screen explanations about request retries, idempotency, and connection recovery.

### Submission Behavior

- While submitting, show “Getting your ticket…”
- Prevent repeated clicks while the request is pending.
- Preserve or implement backend protection against duplicate tickets caused by retries of the same issuance attempt.
- If the outcome is uncertain after a connection failure, retry or recover safely without silently issuing another ticket.
- Open the ticket page after successful issuance.

### Acceptance Criteria

- The ticket is created only after explicit confirmation.
- Repeated clicks or retries of the same operation do not create duplicate tickets.
- Errors are understandable and provide an appropriate recovery action.
- Queue information is revalidated by the backend during issuance.

---

## 6. Redesign the Ticket Page Around the Next Action

### Problem

The ticket number dominates the page, while visitors lack clear instructions.

### Requirements

Prioritize information in this order:

1. Current status.
2. What the visitor should do next.
3. People ahead and approximate waiting time.
4. Service location.
5. Ticket number and supporting details.

Keep the ticket number visible but reduce its oversized appearance.

Display:

- Status.
- A status-specific instruction.
- Ticket number.
- Organization and service.
- Address.
- Room, service area, or assigned counter when available.
- Number of people ahead while waiting.
- Approximate waiting time while relevant.
- Last successful update time.
- Cancellation action while cancellation is allowed.

### Example Waiting Copy

“You are in the queue.”

“There are 5 people ahead of you. Estimated wait: about 25 minutes.”

“Track the queue and arrive at the service location before you are called.”

### Zero-People-Ahead Behavior

If the ticket is waiting and nobody is ahead:

“You are next. Please wait for the staff call.”

Do not automatically claim that the visitor has been called.

### Acceptance Criteria

- The next action is immediately understandable.
- Zero people ahead is distinct from an actual staff call.
- Missing estimates are not displayed as zero minutes.
- The page fits comfortably on mobile without an oversized ticket number pushing important information down.

---

## 7. Present Ticket States Clearly

### Requirements

Map actual backend states to clear visitor-facing labels and instructions.

| State | Visitor-facing behavior |
|---|---|
| Waiting | Show queue position, estimate if available, and arrival guidance. |
| Next | For a waiting ticket with nobody ahead, show “You are next. Wait for the staff call.” |
| Called | Show “You are being called” and the assigned counter or location when available. |
| In service | Show “Your service has started.” |
| Completed | Show “Your service is complete.” |
| Cancelled | Show “Your ticket was cancelled. You no longer hold a place in the queue.” |
| Missed | Explain that the call was missed and show the next action supported by the agreed policy. |

“Next” may be a presentation of an existing waiting state. A new database state is not required unless justified by the application model.

### Additional Requirements

- Hide irrelevant queue estimates after completion or cancellation.
- Do not allow actions that are invalid for the current state.
- Enforce transitions on the backend.
- Handle a cancellation or update that races with a staff call.
- Do not use color alone to communicate status.
- Preserve the existing distinction between calling a visitor and starting service if the backend supports it.

### Acceptance Criteria

- Each supported state has a clear label and instruction.
- Terminal states no longer show misleading live waiting information.
- Invalid transitions are rejected and explained.
- Visitor screens reflect staff actions.

---

## 8. Define Arrival and Missed-Call Rules

### Problem

Remote waiting is confusing unless visitors know when to arrive and what happens if they miss their call.

### Proposed Baseline

- This is a live queue, not a fixed-time appointment.
- Waiting estimates may change.
- Visitors account for their own travel time.
- Visitors should be near the service location before being called.
- Cancellation releases the visitor’s place.
- Staff handle missed calls according to an explicitly agreed policy.

### Decisions Requiring Clarification

Before implementing new behavior, confirm any rules not already defined in the project:

- How long does a called visitor have to respond?
- Does that period vary by service?
- Is a ticket marked missed manually or automatically?
- Can a missed ticket be recalled or restored?
- Must a visitor obtain a new ticket after missing a call?
- What happens to waiting tickets at closing time?

Do not silently invent these policies.

### Constraints

- Do not implement travel-time advice without a supported travel-time feature.
- Do not show “Leave in 10 minutes” based only on queue estimates.
- Do not publish a response deadline unless the workflow actually enforces it.
- Communicate the agreed policy before ticket confirmation and on the ticket page where relevant.

### Acceptance Criteria

- Visitor instructions and staff behavior follow the same policy.
- Any unresolved policy is documented and raised for clarification.
- The interface makes no unsupported timing promises.

---

## 9. Make Updates and Notifications Honest

### Problem

Ticket persistence, live updates, and background notifications are different capabilities and must be explained separately.

### Requirements

Show the last successful update time.

During connection loss:

- Mark queue information as potentially outdated.
- Explain that the application is trying to reconnect.
- Retry safely.
- Offer a manual retry action when useful.
- Preserve the current ticket.

Suggested copy:

“Unable to update the queue. Last updated at 16:32. Reconnecting…”

After recovery, refresh the current ticket state.

### Ticket Persistence Copy

If tickets are stored in the current browser:

“Your ticket is saved in My Tickets in this browser.”

Do not imply cross-device access unless implemented.

### Notification Behavior

- Inspect existing notification support before changing it.
- Offer notification permission through an explicit user action.
- Distinguish unsupported, denied, enabled, and failed states.
- Do not claim that background alerts work unless verified.
- If notifications are unavailable, explain how to check the ticket manually.
- Avoid making notification setup block ticket access.

### Acceptance Criteria

- Old data is never presented as freshly updated.
- Connection recovery does not create another ticket.
- Denied or unsupported notifications do not break the queue workflow.
- The page accurately explains whether updates require it to remain open.

---

## 10. Improve My Tickets and Cancellation

### Requirements

Place “My Tickets” in the main navigation.

The list should show:

- Organization.
- Service.
- Ticket number.
- Current or last known status.
- An “Open ticket” action.

Distinguish active tickets from completed, cancelled, or missed tickets.

If the current browser already has an active ticket for the selected service, offer a clear way to open it.

Follow the existing agreed rules for whether multiple active tickets are allowed. Do not silently introduce a new restriction.

### Persistence

- Verify that tickets remain accessible after a page reload.
- Explain browser-local storage limitations where applicable.
- Handle unavailable or deleted tickets gracefully.
- Preserve the existing private ticket access mechanism.
- Do not expose private ticket credentials in directory pages, public lists, or logs.

### Cancellation

Ask for confirmation:

“Cancel this ticket? You will lose your place in the queue.”

Buttons:

- “Keep ticket”
- “Cancel ticket”

After successful cancellation:

- Update the ticket status.
- Stop showing it as active.
- Reflect the change in the staff queue.
- Prevent cancellation when the backend no longer allows it.

### Acceptance Criteria

- Visitors can return to an issued ticket.
- Cancellation works across visitor and staff views.
- Reloading does not lose access to a saved ticket.
- Race conditions produce a clear, current result.

---

## 11. Connect Staff Actions to the Visitor Experience

### Problem

The visitor workflow is incomplete unless staff can manage the same queue and visitors see those changes.

### Requirements

Inspect and improve the existing staff interface so authorized staff can:

- View the queue for their assigned services.
- Call the next eligible visitor.
- Assign or display the counter when supported.
- Start service.
- Complete service.
- Mark a missed call according to the agreed policy.
- Pause and resume new ticket issuance.

Distinguish pausing new ticket issuance from stopping service for existing tickets.

### Consistency and Authorization

- Staff actions must use the real backend.
- Restrict actions to authorized staff and their permitted services.
- Prevent two staff members from claiming the same waiting ticket concurrently.
- Keep ticket transitions consistent.
- Update visitor pages through the existing supported update mechanism.
- Show clear loading, success, and error states.

### Acceptance Criteria

Verify with separate visitor and staff browser sessions:

1. A visitor receives a ticket.
2. Staff see it in the correct queue.
3. Staff call the visitor.
4. The visitor sees the call and assigned counter, if available.
5. Staff start service.
6. Staff complete service.
7. The visitor sees the completed state.

Also verify:

- Visitor cancellation updates the staff queue.
- Paused issuance prevents new tickets according to policy.
- Existing tickets behave according to the pause policy.
- Concurrent staff actions do not call the same ticket twice.
- Unauthorized actions are rejected.

---

## 12. Unify Language, Visual Design, and Mobile Behavior

### Language

- Use the selected language consistently across interface text and demonstration content.
- Translate service names, demo descriptions, statuses, buttons, and errors.
- Preserve supported languages.
- Use consistent terminology for ticket issuance and cancellation.
- Avoid exposing raw technical errors to visitors.

### Visual Design

Preserve the existing blue accent, light background, and card-based layout.

Improve:

- Excessively tall cards.
- Oversized headings and ticket numbers.
- Large empty areas.
- Repeated descriptions.
- Weak information hierarchy.

Use:

- One clear primary action per step.
- Consistent spacing and typography.
- Visible keyboard focus.
- Readable text contrast.
- Status labels with text, not color alone.

Keep technical logs and detailed ticket history secondary to the visitor’s next action.

### Mobile Behavior

- Prevent horizontal scrolling.
- Allow long names and translated labels to wrap.
- Keep buttons comfortably usable by touch.
- Show ticket status and instructions before secondary details.
- Make filters usable on narrow screens.
- Ensure confirmation dialogs and navigation work on mobile.

### Acceptance Criteria

- The full visitor journey works at desktop and mobile widths.
- Long content does not break the layout.
- Core actions are keyboard accessible.
- Loading, empty, error, stale-data, and unavailable states are readable.
- Supported languages do not mix unintentionally.

---

## Implementation Priorities

### Priority 1 — Queue Behavior and Visitor Clarity

- Resolve arrival and missed-call policy questions.
- Verify staff-to-visitor state updates.
- Improve ticket states and next-action instructions.
- Handle unknown estimates and connection loss correctly.
- Verify ticket persistence and cancellation.

### Priority 2 — Simplify Ticket Issuance

- Improve service cards.
- Simplify confirmation.
- Shorten the organization header.
- Unify terminology and demo content.

### Priority 3 — Directory and Visual Polish

- Improve the main-page explanation.
- Compact organization cards.
- Add city filtering where applicable.
- Complete responsive and accessibility improvements.

## Final Verification and Delivery

Run the checks required by the repository and relevant checks for the changes.

Verify the real-backend workflow in separate visitor and staff browser sessions. Use isolated test data for automated tests.

At minimum, verify:

- Successful ticket issuance.
- Safe retries without duplicate issuance.
- Correct queue position.
- Waiting with zero people ahead.
- Staff call and counter display.
- Service start and completion.
- Cancellation.
- Missed-call behavior after policy confirmation.
- Page reload and saved ticket access.
- Connection loss and recovery.
- Closed or paused service behavior.
- Mobile layout.
- Supported-language consistency.

Finish with a report containing:

1. Implemented changes.
2. Checks and browser scenarios actually executed.
3. Remaining limitations.
4. Requirements that remain incomplete or blocked by a policy decision.

Do not report unexecuted checks as passed.
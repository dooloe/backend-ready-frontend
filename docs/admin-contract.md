# Planned administration and analytics (#7)

See the design-marked root [openapi.yml](../openapi.yml) for all bodies, status
codes and rejected configuration examples. All operations require an active
organization admin cookie; mutations additionally require CSRF proof. Never
accept organization ownership from request JSON.

| Resource | Operations | Rules |
| --- | --- | --- |
| /api/admin/services | GET/POST; PATCH /{serviceId} | Name, description, prefix, positive duration, local opensAt/closesAt, activation. Reject overnight/equal/reversed hours; only non-overnight daily schedules are supported. Prefix changes affect future daily queues; keep existing queue prefixes/numbers frozen. |
| /api/admin/counters | GET/POST; PATCH /{counterId} | Name, activation and unique supported service IDs. Every reference must exist in the actor organization. Empty associations allow initial setup. |
| /api/admin/staff | GET/POST; PATCH /{userId} | Name, username, email, role, activation and write-only password. Argon2id hash only; never return passwords or hashes. Duplicate identities conflict. Password change/deactivation revokes sessions. Keep an active organization admin. |
| /api/admin/staff-assignments | GET/POST; DELETE /{userId}/{counterId} | Active same-organization staff/counter pairs. Reject duplicate pairs and missing deletions. Multiple assignments are supported explicitly. |
| /api/admin/queues/{queueId} | PATCH | Daily manual gate; opening cannot bypass inactive service, local hours or an outdated date. Closing stops new joins but preserves customer tracking and existing staff work. |
| /api/admin/analytics | GET with paired dateFrom/dateTo | Real stored-timestamp metrics for inclusive local-date cohort; defaults to today. |

Service/counter/staff deactivation preserves ticket history. Reject changes that
strand active called/serving work: removing its supported service, deactivating
its counter/service/operator, or revoking the current operator's assignment.
Check these rules transactionally with the active claim. Historical-only changes
must not remove tickets/events. No destructive delete operation is planned.
Cross-organization access is 403, unknown resources 404, active-work/identity or
assignment conflicts 409, invalid field/schedule/date values 422. Error responses
contain stable code/message/details, with safe field names rather than raw input.

Analytics use the organization timezone and an issued-date cohort: both local
dates are inclusive; convert midnight(dateFrom) and midnight(dateTo + 1 day) to
UTC before filtering creation timestamps. Require both filters or neither,
dateFrom <= dateTo, at most 31 local dates. Do not assume every day is 24 UTC hours.

- issued: number created in the cohort.
- waiting/completed: cohort tickets currently in those statuses.
- meanWaitMinutes: mean calledAt − createdAt for completed cohort tickets with
  valid timestamps, rounded to one decimal minute.
- meanServiceMinutes: mean completedAt − startedAt for completed cohort tickets
  with valid timestamps, rounded to one decimal minute.
- byService and byDay use the identical filter; include inactive services with
  history and zero-count day buckets. Empty averages are null, not zero.

These definitions intentionally differ from the legacy `/api/admin/stats` UTC
average over every called ticket. Keep legacy behavior tested until the planned
backend and frontend analytics switch together. This contract does not complete
the administration, permissions or dashboard implementation issues.

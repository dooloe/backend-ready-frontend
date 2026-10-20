# Current client to planned MVP API

`openapi.yaml` documents the current 20-operation frontend API. `openapi.yml`
is the explicitly marked design contract for the full MVP; validate it separately
and never infer runtime endpoint availability from the document. Preserve the
working client while adding required backend behavior, then switch the facade
and pages together. No repository relocation is needed.

| Current client | Planned MVP operation | Integration change |
| --- | --- | --- |
| listServices | listOrganizations, listOrganizationServices, getQueueStatus | Select organization; show active service hours/timezone, current daily queue and server availability. |
| joinQueue(serviceId, customerName) | issueTicket(queueId, accessToken, idempotencyKey) | Remove names; persist independent random proofs before sending; retry same pair after uncertain results. |
| getTicket(id) | readPrivateTicket(token) | Route parameter is a private token, never an internal ticket ID. |
| cancelTicket(id) | cancelPrivateTicket(token) | Confirm waiting-only cancellation; authenticate by token hash. |
| login returning bearer/localStorage | Cookie login, identity, CSRF and logout (#6) | Remove localStorage bearer state only when cookie/session integration is implemented. |
| Counter/staff/admin adapter | Planned staff/admin operations (#6–#7) | Keep role and organization checks on the backend; adopt full configuration schemas. |

The existing TanStack `/ticket/$id` route can keep its source filename during
integration: its parameter value becomes the access token and it displays the
returned `ticketNumber`. Planned ticket fields use `queueId`, `startedAt`,
`completedAt`, `cancelledAt` and `noShowAt`; map or replace the current `code`,
`serviceId`, `servedAt` and `finishedAt` fields at the typed facade boundary.
All six statuses remain lowercase. Do not implement public ID fallback as a
compatibility shortcut once private-token integration is enabled.

Errors have `code`, `message`, `details`; clients act on codes and display safe
messages. Null estimates mean “Currently unavailable,” not zero. Terminal ticket
polling stops; active polling is approximately five seconds with abort/retry and
last-refresh feedback. Private URLs, tokens and customer credentials must not
enter logs or telemetry. See [issuance/retry semantics](ticket-issuance.md).

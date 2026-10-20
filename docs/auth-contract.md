# Planned session and staff authorization contract (#6)

The source of truth is the design-marked root [openapi.yml](../openapi.yml).
This describes the future cookie contract; current bearer behavior is not
silently treated as meeting it.

1. POST `/api/auth/login` with username/password. Active staff/admin receive
   identity and a CSRF proof plus `kezek_session` in an HttpOnly SameSite=Lax
   cookie, Path=/api, eight-hour expiry. Secure is mandatory under HTTPS;
   explicit local HTTP development is the only exception. Reject untrusted
   browser origins on login. Never return the session token in JSON.
2. On reload, GET `/api/auth/me` with credentials; GET `/api/auth/csrf` obtains
   a session-bound synchronizer proof. Read proofs into memory, not localStorage.
   Return no-store for authentication and private data. Store token/proof hashes,
   not raw values. Expired, inactive or missing sessions get the same safe 401.
3. Every protected mutation sends cookie plus `X-CSRF-Token`; missing or invalid
   proof is 403. Anonymous ticket operations use private proof, not staff session
   authority. Never accept frontend role flags as authorization.
4. POST `/api/auth/logout` revokes the persisted session and expires its cookie;
   return 204, no body. Later protected requests must return 401. Clear protected
   query caches on logout/access denial. Invalid/expired logout returns 401.

For separate origins use explicit credentialed CORS origins, permitted CSRF and
content headers, and fetch credentials=include. Prefer same-origin /api proxying.
Do not enable wildcard origins with credentials. Cookie SameSite is additional
protection, not a substitute for CSRF checks. Login rotates session identity.

`listStaffQueues` returns only eligible active counters in the actor organization:
assigned counters for staff, all active organization counters for admin. The
response is per counter, supports multiple service queues and has one nullable
current ticket. Empty assignments return an empty array.

`callNextTicket` requires queue ID and counterId, same organization, supported
service, active assigned counter and an empty active claim. It selects FIFO and
saves claim/timestamp/actor event atomically. Return 200 null for no waiting work;
409 for busy/inactive counter; 403 for unauthorized assignment/organization.
Closed queues may finish existing work. Queue lookup failure returns 404.

`startTicket`, `finishTicket`, `noShowTicket` require the owning assigned counter
and only allow called → serving, serving → completed, called → no_show. Save an
actor event/timestamp and release capacity only on terminal actions. Invalid state
is 409; wrong counter/organization is 403. OpenAPI contains 401/403/409 examples.

Migration replaces the bearer/localStorage branch only when both sides are
implemented: extend the typed facade, enable credentialed fetch and CSRF,
bootstrap server identity, remove bearer storage and update route guards. Keep
the legacy contract covered during implementation; a document alone is not
evidence for closing #14–#16 or #36–#37.

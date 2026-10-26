# Anonymous ticket issuance and retry contract (#4)

This is the agreed MVP design. The backend implementation is tracked in #19;
the current frontend's ID/name-based API remains a legacy flow pending coordinated
integration in #32/#34.

## Ownership and request

Before sending a join, the browser generates two independent 32-byte cryptographic
random values with Web Crypto, encoded as 43 unpadded base64url characters:
`accessToken` and `idempotencyKey`. Retain the pair in sessionStorage under the
selected queue ID until a definitive success or rejection; never include customer
names, phone numbers, session credentials or the token in telemetry. The customer
holds the access token; it authorizes private reads/cancellation. Internal IDs
and display numbers never authorize customer access.

```http
POST /api/queues/queue-example/tickets
Idempotency-Key: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
Content-Type: application/json

{"accessToken":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"}
```

The repeated characters above are schema examples only; real clients must use
independent random values. The server validates both as canonical 32-byte tokens.
Keys and tokens are case-sensitive. The queue in the URL is the idempotency scope.
Return 201 for creation and 200 for an authenticated replay of that creation:

```json
{
  "ticket": {
    "id": "ticket-internal-example",
    "queueId": "queue-example",
    "ticketNumber": "A-001",
    "status": "waiting",
    "position": 1,
    "estimatedWaitMinutes": 0
  },
  "ticketUrl": "/ticket/AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"
}
```

The complete ticket shape is defined by the public OpenAPI contract. Replays
return the same ticket identity/number/link with its **current** status, not a
stale saved response. The server constructs the link from the supplied proof;
the raw token is never read back from persistent storage. Responses containing
private data use Cache-Control: no-store. Never save response bodies containing
private URLs in idempotency/audit records.

## Atomic operation and rejection order

1. Validate format and hash the key and access token with SHA-256.
2. Acquire the database write reservation, then find the queue/key-hash record.
3. Existing key and matching token hash: return the existing logical ticket,
   even after closure, midnight or a terminal transition. Do not allocate another
   number or append another creation event.
4. Existing key with a different token hash: 409 IDEMPOTENCY_CONFLICT. Do not
   return ticket identity or disclose its owner. An idempotency key alone does
   not recover access.
5. New key: validate queue/service availability and organization-local date.
   Reject a closed or outdated queue with 409 QUEUE_CLOSED. A token hash already
   used anywhere is rejected with 409 TOKEN_REUSED, even under another key/queue.
6. In one transaction allocate the daily sequence, persist the ticket, unique
   access-token hash, queue-scoped key hash and issued event. Rollback on failure
   leaves no partial ticket, event or consumed committed sequence.

Database constraints enforce unique (queue_id, idempotency_key_hash),
(queue_id, sequence), (queue_id, ticket_number), and globally unique token hash.
Tickets and key hashes remain for the life of the ticket/history; keys are never
recycled while that history exists. No raw key or raw access token is stored.
Concurrent identical requests serialize or hit the uniqueness constraint and
re-read: exactly one 201 creation, other successful requests 200 with the same
ticket. A bounded contention response is 503 DATABASE_BUSY with Retry-After: 1;
the client retries the same pair. Different new keys get different daily numbers.

## Lost responses and key reuse

If the creation response is lost, keep the original pair and queue ID. Retry the
identical request after network/503 failures; do not generate another pair or
silently switch to tomorrow's queue. If the first transaction committed, recover
its existing ticket even if that queue is now closed; if it rolled back and the
queue subsequently closed, return QUEUE_CLOSED without creating a ticket.

Never reuse a pair for an intentional new join. Require an explicit new join
action to generate a new pair after a known terminal result. Changing the token
with an existing key fails; reusing a token with a new key fails; reusing a key
in a different queue with a fresh token is a distinct logical join. Queues may
therefore use the same key hash without conflating different business dates.

If the client loses both its saved token and the private link, anonymous ownership
cannot be recovered from a display number or an idempotency key alone. Show this
limit explicitly rather than claiming same-person duplicate prevention. Retain
uncertain pending state until the user resolves it or explicitly abandons it.

## Product deviation and migration

The plan initially says the server returns a newly minted token once. With
hash-only storage, a server-minted random token cannot be returned again after
a lost response without keeping a recoverable copy. Use a client-generated,
server-validated secret instead, echoed only as the creation/replay private URL.
This preserves hash-only storage and reliable retries without a signing secret,
deterministic derivation or plaintext-token recovery table. Customer read/cancel
responses never echo the token.

The current frontend's POST /api/tickets with customerName and its ID-based
private links remain the legacy contract until coordinated backend/frontend
integration (#19/#32/#34). New joins select an organization/service/current queue,
send no name, and navigate to the returned token URL. Public lookup/cancel paths
must then resolve token hashes only; do not keep a public ID fallback.

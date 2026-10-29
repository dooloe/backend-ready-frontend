import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApi } from "@/lib/api/http";
import { ApiError } from "@/lib/api/types";

afterEach(() => {
  document.cookie = "kezek_csrf=; Max-Age=0; path=/";
  vi.unstubAllGlobals();
});

describe("private ticket client", () => {
  it("uses the private token routes for canonical ticket reads and cancellation", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => null);

    await api.getPrivateTicket("a/b + token");
    await api.cancelPrivateTicket("a/b + token");
    await api.getPushConfig();
    await api.registerTicketPush("a/b + token", {
      endpoint: "https://fcm.googleapis.com/fcm/send/example",
      keys: { p256dh: "p256dh", auth: "auth" },
    });
    await api.removeTicketPush("a/b + token", "https://fcm.googleapis.com/fcm/send/example");

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["GET", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token"],
      ["POST", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token/cancel"],
      ["GET", "http://localhost:8000/api/push/config"],
      ["POST", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token/push-subscriptions"],
      ["DELETE", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token/push-subscriptions"],
    ]);
  });

  it("forwards query cancellation signals to private ticket reads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => null);
    const controller = new AbortController();

    await api.getPrivateTicket("A".repeat(43), controller.signal);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it("issues an anonymous ticket with the queue-scoped retry key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ticket: {}, ticketUrl: "/ticket/token" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => null);

    await api.issueTicket({
      queueId: "daily/queue",
      accessToken: "A".repeat(43),
      idempotencyKey: "B".repeat(43),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/queues/daily%2Fqueue/tickets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ accessToken: "A".repeat(43) }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": "B".repeat(43) },
      }),
    );
  });

  it("sends the selected counter with the queue-scoped call-next request", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("null", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => "staff-session");

    await api.callNextFromQueue("daily/queue", "counter 1");

    expect(fetchMock.mock.calls).toHaveLength(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:8000/api/staff/queues/daily%2Fqueue/call-next");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ counterId: "counter 1" }),
      headers: { "Content-Type": "application/json", Authorization: "Bearer staff-session" },
    });
  });

  it("encodes resource identifiers and normalizes a trailing backend origin slash", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000/", () => null);

    await api.updateCounter("counter/1", { name: "Front desk" });
    await api.markNoShow("ticket/1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8000/api/admin/counters/counter%2F1",
      "http://localhost:8000/api/tickets/ticket%2F1/no-show",
    ]);
  });

  it("requests date-filtered admin analytics from the contracted endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => "admin-session");

    await api.getAnalytics("2026-10-20", "2026-10-22");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/admin/analytics?dateFrom=2026-10-20&dateTo=2026-10-22",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("uses organization-scoped admin service and daily queue operations", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => "admin-session");

    await api.listAdminServices();
    await api.setQueueOverride("daily/queue", false);

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["GET", "http://localhost:8000/api/admin/services"],
      ["PATCH", "http://localhost:8000/api/admin/queues/daily%2Fqueue"],
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ body: JSON.stringify({ isOpen: false }) });
  });

  it("sends cookies and session-bound CSRF proof on cookie-authenticated mutations", async () => {
    document.cookie = "kezek_csrf=readable-cookie-proof; path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "session-bound-proof" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "queue-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("", () => null);

    await api.setQueueOverride("queue-1", false);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/csrf");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      headers: {},
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "session-bound-proof",
      },
    });
  });

  it("uses the in-memory CSRF proof for credentialed cross-origin mutations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "cross-origin-proof" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "queue-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("https://api.example.test", () => null);

    await api.getCsrfToken();
    await api.setQueueOverride("queue-1", false);

    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      credentials: "include",
      headers: { "X-CSRF-Token": "cross-origin-proof" },
    });
  });

  it("exposes the typed cookie-session identity, CSRF and logout operations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "staff-1", name: "Aida", username: "aida", role: "staff" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "session-proof" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("", () => null);

    await api.getCurrentIdentity();
    await expect(api.getCsrfToken()).resolves.toEqual({ csrfToken: "session-proof" });
    await api.logout();

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/auth/me", "GET"],
      ["/api/auth/csrf", "GET"],
      ["/api/auth/logout", "POST"],
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true);
  });

  it("preserves structured backend errors and rejects network failures", async () => {
    const structuredError = {
      code: "QUEUE_CLOSED",
      message: "This queue is closed",
      details: { queueId: "queue-1" },
      detail: "This queue is closed",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(structuredError), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("", () => null);

    await expect(api.setQueueOverride("queue-1", true)).rejects.toMatchObject({
      name: "Error",
      status: 409,
      code: "QUEUE_CLOSED",
      message: "This queue is closed",
      details: { queueId: "queue-1" },
    } satisfies Partial<ApiError>);
    await expect(api.getStats()).rejects.toThrow("Network unavailable");
  });
});

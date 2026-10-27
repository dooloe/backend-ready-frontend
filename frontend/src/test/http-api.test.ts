import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApi } from "@/lib/api/http";

afterEach(() => vi.unstubAllGlobals());

describe("legacy private ticket client compatibility", () => {
  it("keeps existing ticket links on the explicit legacy endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createHttpApi("http://localhost:8000", () => null);

    await api.getTicket("ticket/id with spaces");
    await api.cancelTicket("ticket/id with spaces");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8000/api/legacy/tickets/ticket%2Fid%20with%20spaces",
      "http://localhost:8000/api/legacy/tickets/ticket%2Fid%20with%20spaces/cancel",
    ]);
  });

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

    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["GET", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token"],
      ["POST", "http://localhost:8000/api/tickets/a%2Fb%20%2B%20token/cancel"],
    ]);
  });

  it("forwards query cancellation signals to private ticket reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
});

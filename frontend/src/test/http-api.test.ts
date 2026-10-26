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
});

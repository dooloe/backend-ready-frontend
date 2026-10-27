import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, resetMockDb, setTokenProvider } from "@/lib/api/mock";

let token: string | null = null;
setTokenProvider(() => token);

beforeEach(async () => {
  resetMockDb();
  token = null;
});

async function loginStaff() {
  token = (await mockApi.login("aigerim", "staff123")).token;
}

describe("Kezek mock API", () => {
  it("issues unique sequential ticket numbers", async () => {
    const [a, b] = await Promise.all([
      mockApi.joinQueue({ serviceId: "svc-reg", customerName: "A" }),
      mockApi.joinQueue({ serviceId: "svc-reg", customerName: "B" }),
    ]);
    expect([a.code, b.code].sort()).toEqual(["A-001", "A-002"]);
  });

  it("lists the four demo organizations and serves their queues through demo staff login", async () => {
    const organizations = await mockApi.listOrganizations();
    expect(organizations.map((organization) => organization.category).sort()).toEqual([
      "Clinics",
      "Government Services",
      "Service Centers",
      "Universities",
    ]);
    const university = await mockApi.getOrganization("mock-university");
    const service = university.services[0]!;
    expect(university.name).toContain("Demo");

    const ticket = await mockApi.joinQueue({
      serviceId: service.id,
      customerName: "Visitor",
    });
    token = (await mockApi.login("demo-staff-university", "staff123")).token;
    const counter = (await mockApi.listCounters()).find(
      (item) => item.staffId === "demo-staff-university",
    );
    expect(counter).toBeDefined();
    expect((await mockApi.callNext(counter!.id))?.id).toBe(ticket.id);
    await expect(mockApi.completeTicket(ticket.id)).rejects.toMatchObject({ status: 409 });
    expect((await mockApi.startService(ticket.id)).status).toBe("serving");
    expect((await mockApi.completeTicket(ticket.id)).status).toBe("completed");
  });

  it("issues and recovers an anonymous private ticket with an idempotent retry", async () => {
    const services = await mockApi.listOrganizationServices("mock-university");
    const queue = services[0]!.queue!;
    const proofs = { accessToken: "A".repeat(43), idempotencyKey: "B".repeat(43) };
    const first = await mockApi.issueTicket({ queueId: queue.id, ...proofs });
    const retry = await mockApi.issueTicket({ queueId: queue.id, ...proofs });

    expect(retry.ticket.id).toBe(first.ticket.id);
    expect(retry.ticketUrl).toBe(first.ticketUrl);
    expect(await mockApi.getPrivateTicket(proofs.accessToken)).toMatchObject({
      ticketNumber: first.ticket.ticketNumber,
      organizationName: "Almaty University · Demo",
    });
    expect(await mockApi.cancelPrivateTicket(proofs.accessToken)).toMatchObject({
      status: "cancelled",
    });
  });

  it("returns date-filtered analytics with real empty values and unavailable averages", async () => {
    token = (await mockApi.login("admin", "admin123")).token;

    await expect(mockApi.getAnalytics("2026-10-20", "2026-10-22")).resolves.toMatchObject({
      dateFrom: "2026-10-20",
      dateTo: "2026-10-22",
      timezone: "Asia/Almaty",
      issued: 0,
      waiting: 0,
      completed: 0,
      meanWaitMinutes: null,
      meanServiceMinutes: null,
      byService: [],
      byDay: [
        { date: "2026-10-20", issued: 0, completed: 0 },
        { date: "2026-10-21", issued: 0, completed: 0 },
        { date: "2026-10-22", issued: 0, completed: 0 },
      ],
    });
    await expect(mockApi.getAnalytics("2026-10-20")).rejects.toMatchObject({ status: 422 });
  });

  it("persists daily queue overrides and returns the authoritative mock status", async () => {
    token = (await mockApi.login("admin", "admin123")).token;
    const service = (await mockApi.listOrganizationServices("mock-university"))[0]!;
    const queueId = service.queue!.id;

    await expect(mockApi.setQueueOverride(queueId, false)).resolves.toMatchObject({
      id: queueId,
      isOpen: false,
    });
    expect((await mockApi.listOrganizationServices("mock-university"))[0]!.queue!.isOpen).toBe(
      false,
    );
    await mockApi.setQueueOverride(queueId, true);
    expect((await mockApi.listOrganizationServices("mock-university"))[0]!.queue!.isOpen).toBe(
      true,
    );
  });

  it("calls the oldest waiting ticket and never twice", async () => {
    const first = await mockApi.joinQueue({ serviceId: "svc-reg", customerName: "A" });
    await new Promise((r) => setTimeout(r, 5));
    await mockApi.joinQueue({ serviceId: "svc-reg", customerName: "B" });
    await loginStaff();
    const [c1, c2] = await Promise.all([mockApi.callNext("cnt-1"), mockApi.callNext("cnt-2")]);
    expect(c1?.id).toBe(first.id);
    expect(c2?.id).not.toBe(c1?.id);
  });

  it("has no wait estimate when the queue has no active counters", async () => {
    await mockApi.joinQueue({ serviceId: "svc-fin", customerName: "A" });
    token = (await mockApi.login("admin", "admin123")).token;
    await mockApi.updateCounter("cnt-2", { isActive: false });
    const t = await mockApi.joinQueue({ serviceId: "svc-fin", customerName: "B" });
    expect(t.estimatedWaitMinutes).toBeNull();
  });

  it("denies admin endpoints to staff and anonymous users", async () => {
    await expect(mockApi.getStats()).rejects.toMatchObject({ status: 401 });
    await loginStaff();
    await expect(mockApi.getStats()).rejects.toMatchObject({ status: 403 });
  });

  it("updates staff details and revokes disabled staff sessions", async () => {
    token = (await mockApi.login("admin", "admin123")).token;
    const created = await mockApi.createStaff({
      name: "Temporary staff",
      username: "temporary",
      role: "staff",
      password: "secret123",
    });
    expect(created.isActive).toBe(true);
    token = (await mockApi.login("temporary", "secret123")).token;

    token = (await mockApi.login("admin", "admin123")).token;
    const updated = await mockApi.updateStaff(created.id, { name: "Updated staff" });
    expect(updated.name).toBe("Updated staff");
    expect(updated).not.toHaveProperty("password");

    const staffSession = (await mockApi.login("temporary", "secret123")).token;
    token = (await mockApi.login("admin", "admin123")).token;
    await mockApi.updateStaff(created.id, { isActive: false });
    token = staffSession;
    await expect(mockApi.listCounters()).rejects.toMatchObject({ status: 401 });
    await expect(mockApi.login("temporary", "secret123")).rejects.toMatchObject({ status: 401 });
  });

  it("removes a cancelled ticket from the active queue", async () => {
    const t = await mockApi.joinQueue({ serviceId: "svc-reg", customerName: "A" });
    await mockApi.cancelTicket(t.id);
    await loginStaff();
    expect((await mockApi.getQueue("cnt-1")).waiting).toHaveLength(0);
  });
});

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
    expect((await mockApi.startService(ticket.id)).status).toBe("serving");
    expect((await mockApi.completeTicket(ticket.id)).status).toBe("completed");
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

  it("removes a cancelled ticket from the active queue", async () => {
    const t = await mockApi.joinQueue({ serviceId: "svc-reg", customerName: "A" });
    await mockApi.cancelTicket(t.id);
    await loginStaff();
    expect((await mockApi.getQueue("cnt-1")).waiting).toHaveLength(0);
  });
});

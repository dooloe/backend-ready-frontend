import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const organization = {
  id: "demo-university",
  name: "Almaty University",
  description: "Student services",
  category: "Universities",
  location: "Almaty",
  timezone: "Asia/Almaty",
  services: [],
};
const queue = {
  id: "queue-demo-university-2026-10-27",
  serviceId: "student-services",
  queueDate: "2026-10-27",
  isOpen: true,
  waiting: 2,
  activeCounters: 1,
  estimatedWaitMinutes: 12,
};
const serviceSummary = {
  id: "student-services",
  organizationId: organization.id,
  name: "Student services",
  description: "Student records and enrollment.",
  prefix: "U",
  durationMinutes: 6,
  opensAt: "09:00",
  closesAt: "17:00",
  timezone: "Asia/Almaty",
  queue,
};
const issuedTicket = {
  id: "internal-ticket-id",
  queueId: queue.id,
  organizationName: organization.name,
  ticketNumber: "U-001",
  serviceName: serviceSummary.name,
  status: "waiting" as const,
  position: 3,
  estimatedWaitMinutes: 12,
  counterId: null,
  counterName: null,
  createdAt: "2026-10-27T10:00:00Z",
  calledAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  noShowAt: null,
};

async function renderJoin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({
      initialEntries: ["/join/demo-university/student-services"],
    }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe("anonymous customer joining", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(api, "getOrganization").mockResolvedValue(organization);
    vi.spyOn(api, "listOrganizationServices").mockResolvedValue([serviceSummary]);
    vi.spyOn(api, "getPrivateTicket").mockResolvedValue(issuedTicket);
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends independent private proofs without customer details and opens the returned ticket link", async () => {
    const issueTicket = vi
      .spyOn(api, "issueTicket")
      .mockImplementation(async ({ accessToken }) => ({
        ticket: {} as never,
        ticketUrl: `/ticket/${accessToken}`,
      }));
    await renderJoin();

    fireEvent.click(await screen.findByRole("button", { name: "Confirm & join queue" }));
    await waitFor(() => expect(issueTicket).toHaveBeenCalledTimes(1));
    const request = issueTicket.mock.calls[0]![0];
    expect(request.queueId).toBe(queue.id);
    expect(request.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.accessToken).not.toBe(request.idempotencyKey);
    expect(localStorage.getItem("kezek-private-ticket-links-v2")).toContain(request.accessToken);
    expect(sessionStorage.getItem("kezek-pending-joins-v1")).toBeNull();
    expect(await screen.findByText("Your digital ticket")).toBeInTheDocument();
  });

  it("localizes the join confirmation while preserving API organization and service names", async () => {
    localStorage.setItem("kezek-customer-locale-v1", "kk");
    await renderJoin();

    expect(await screen.findByRole("button", { name: "Растау және кезекке қосылу" })).toBeVisible();
    expect(screen.getByText(organization.name)).toBeVisible();
    expect(screen.getByText(serviceSummary.name)).toBeVisible();
    expect(screen.getByText("2 адам күтуде · шамамен 12 мин күту")).toBeVisible();
  });

  it("disables repeat submissions while the first ticket request is pending", async () => {
    let completeRequest!: () => void;
    const issueTicket = vi.spyOn(api, "issueTicket").mockImplementation(
      ({ accessToken }) =>
        new Promise((resolve) => {
          completeRequest = () =>
            resolve({ ticket: issuedTicket, ticketUrl: `/ticket/${accessToken}` });
        }),
    );
    await renderJoin();

    fireEvent.click(await screen.findByRole("button", { name: "Confirm & join queue" }));
    const pendingButton = await screen.findByRole("button", { name: "Issuing your ticket…" });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(issueTicket).toHaveBeenCalledTimes(1);
    completeRequest();
    expect(await screen.findByText("Your digital ticket")).toBeInTheDocument();
  });

  it("retries an uncertain response with the same queue and credentials", async () => {
    let calls = 0;
    const issueTicket = vi.spyOn(api, "issueTicket").mockImplementation(async ({ accessToken }) => {
      calls += 1;
      if (calls === 1) throw new TypeError("Network disconnected");
      return { ticket: {} as never, ticketUrl: `/ticket/${accessToken}` };
    });
    await renderJoin();

    fireEvent.click(await screen.findByRole("button", { name: "Confirm & join queue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry ticket request" }));

    await waitFor(() => expect(issueTicket).toHaveBeenCalledTimes(2));
    expect(issueTicket.mock.calls[1]![0]).toEqual(issueTicket.mock.calls[0]![0]);
    expect(await screen.findByText("Your digital ticket")).toBeInTheDocument();
  });

  it("recovers an unresolved request from an older daily queue before allowing a new join", async () => {
    const accessToken = "C".repeat(43);
    sessionStorage.setItem(
      "kezek-pending-joins-v1",
      JSON.stringify({
        "queue-from-yesterday": { accessToken, idempotencyKey: "D".repeat(43) },
      }),
    );
    const issueTicket = vi.spyOn(api, "issueTicket").mockResolvedValue({
      ticket: issuedTicket,
      ticketUrl: `/ticket/${accessToken}`,
    });
    await renderJoin();

    expect(await screen.findByRole("button", { name: "Recover previous ticket" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirm & join queue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recover previous ticket" }));

    await waitFor(() =>
      expect(issueTicket).toHaveBeenCalledWith({
        queueId: "queue-from-yesterday",
        accessToken,
        idempotencyKey: "D".repeat(43),
      }),
    );
    expect(await screen.findByText("Your digital ticket")).toBeInTheDocument();
  });
});

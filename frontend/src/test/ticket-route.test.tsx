import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ticket-polling", () => ({
  ticketIsPollingActive: (status: string | undefined) =>
    !status || !["completed", "cancelled", "no_show"].includes(status),
  ticketRefetchInterval: () => false,
}));
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: { success: vi.fn(), error: vi.fn() } };
});
import { api } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const token = "A".repeat(43);
const queryClients: QueryClient[] = [];
const ticket = {
  id: "internal-id",
  queueId: "queue-1",
  organizationName: "Demo Organization",
  ticketNumber: "A-001",
  serviceName: "Consultation",
  status: "waiting" as const,
  position: 3,
  estimatedWaitMinutes: null,
  counterId: null,
  counterName: null,
  createdAt: "2026-10-27T10:00:00Z",
  calledAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  noShowAt: null,
};

async function renderTicket() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClients.push(queryClient);
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [`/ticket/${token}`] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return { queryClient, router };
}

describe("private ticket route", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, "getPrivateTicket").mockResolvedValue(ticket);
  });
  afterEach(() => {
    cleanup();
    queryClients.splice(0).forEach((queryClient) => queryClient.clear());
    vi.restoreAllMocks();
  });

  it.each(["waiting", "called", "serving", "completed", "cancelled", "no_show"] as const)(
    "renders the %s lifecycle state",
    async (status) => {
      vi.spyOn(api, "getPrivateTicket").mockResolvedValue({ ...ticket, status });
      await renderTicket();
      expect(await screen.findByText(status.replace("_", " "))).toBeInTheDocument();
    },
  );

  it.each([
    ["waiting", "ожидают", "Вы в очереди"],
    ["called", "вызван", "Ваша очередь!"],
    ["serving", "обслуживается", "Вас обслуживают"],
    ["completed", "завершён", "Готово. Хорошего дня!"],
    ["cancelled", "отменён", "Ваш талон отменён"],
    ["no_show", "не явился", "Вы пропустили очередь"],
  ] as const)("localizes the %s ticket state", async (status, badge, heading) => {
    localStorage.setItem("kezek-customer-locale-v1", "ru");
    vi.spyOn(api, "getPrivateTicket").mockResolvedValue({
      ...ticket,
      status,
      counterName: "Window 2",
    });
    await renderTicket();

    expect(await screen.findByText(badge)).toBeVisible();
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByText("Demo Organization")).toBeVisible();
    expect(screen.getByText("Consultation")).toBeVisible();
  });

  it("explains unavailable estimates and shows last refresh feedback", async () => {
    await renderTicket();
    expect(await screen.findByText("Estimate unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/Refreshes every 5 seconds/)).toBeInTheDocument();
  });

  it("shows a helpful invalid-link state without exposing ticket details", async () => {
    vi.spyOn(api, "getPrivateTicket").mockRejectedValue(new Error("Ticket not found"));
    await renderTicket();
    expect(await screen.findByText(/Ticket unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("A-001")).not.toBeInTheDocument();
  });

  it("recovers from a ticket read network error when retried", async () => {
    const read = vi
      .spyOn(api, "getPrivateTicket")
      .mockRejectedValueOnce(new TypeError("Network disconnected"))
      .mockResolvedValue(ticket);
    await renderTicket();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("A-001")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation and preserves a newer state after late cancellation is rejected", async () => {
    const cancel = vi
      .spyOn(api, "cancelPrivateTicket")
      .mockRejectedValue(new Error("Already called"));
    const read = vi
      .spyOn(api, "getPrivateTicket")
      .mockResolvedValueOnce(ticket)
      .mockResolvedValue({ ...ticket, status: "called", counterName: "Counter 2" });
    const { queryClient } = await renderTicket();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel Ticket" }));
    expect(await screen.findByText("Cancel your ticket?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.getByText("A-001")).toBeInTheDocument();
    expect(screen.getByText("called")).toBeInTheDocument();
    expect(queryClient.getQueryData(["ticket", token])).toMatchObject({ status: "called" });
  });
});

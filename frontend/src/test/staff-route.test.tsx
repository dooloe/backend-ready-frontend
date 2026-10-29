import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type TicketView } from "@/lib/api";
import { setSession } from "@/lib/session";
import { routeTree } from "@/routeTree.gen";

const user = { id: "staff-1", name: "Aida", username: "aida", role: "staff" as const };
const counter = {
  id: "counter-1",
  name: "Window 1",
  serviceIds: ["service-1"],
  isActive: true,
  staffId: user.id,
};
const waitingTicket = {
  id: "ticket-1",
  code: "A-001",
  serviceId: "service-1",
  serviceName: "Records",
  customerName: "Visitor",
  status: "waiting" as const,
  createdAt: "2026-10-27T10:00:00Z",
  calledAt: null,
  servedAt: null,
  finishedAt: null,
  counterId: null,
  counterName: null,
  position: 1,
  estimatedWaitMinutes: 5,
};

async function renderStaff() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: ["/staff"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("staff queue operations", () => {
  beforeEach(() => {
    localStorage.clear();
    setSession({ token: null, user });
  });
  afterEach(() => {
    cleanup();
    setSession(null);
    vi.restoreAllMocks();
  });

  it("explains when the staff member has no counter or waiting visitors", async () => {
    vi.spyOn(api, "listCounters").mockResolvedValueOnce([]);
    await renderStaff();
    expect(
      await screen.findByText("No counters available. Ask your administrator for access."),
    ).toBeVisible();

    cleanup();
    vi.spyOn(api, "listCounters").mockResolvedValue([counter]);
    vi.spyOn(api, "getQueue").mockResolvedValue({ current: null, waiting: [] });
    await renderStaff();
    expect(await screen.findByText("No one at this counter.")).toBeVisible();
    expect(screen.getByText("No visitors waiting")).toBeVisible();
    expect(screen.getByRole("button", { name: "Call Next" })).toBeDisabled();
  });

  it("disables Call Next while a request is in flight", async () => {
    vi.spyOn(api, "listCounters").mockResolvedValue([counter]);
    vi.spyOn(api, "getQueue").mockResolvedValue({ current: null, waiting: [waitingTicket] });
    let finishCall!: (value: TicketView) => void;
    const callNext = vi.spyOn(api, "callNext").mockReturnValue(
      new Promise((resolve) => {
        finishCall = resolve;
      }),
    );
    await renderStaff();

    const action = await screen.findByRole("button", { name: "Call Next" });
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    await waitFor(() => expect(callNext).toHaveBeenCalledWith(counter.id));
    expect(action).toBeDisabled();
    finishCall({ ...waitingTicket, status: "called" });
  });
});

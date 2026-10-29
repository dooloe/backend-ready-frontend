import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const token = "T".repeat(43);
const savedTicket = {
  id: "private-id",
  queueId: "queue-1",
  organizationName: "Private Clinic",
  ticketNumber: "C-019",
  serviceName: "Consultation",
  status: "waiting" as const,
  position: 2,
  estimatedWaitMinutes: 10,
  counterId: null,
  counterName: null,
  createdAt: "2026-10-27T10:00:00Z",
  calledAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  noShowAt: null,
};

async function renderTickets() {
  localStorage.setItem("kezek-private-ticket-links-v2", JSON.stringify([token]));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/tickets"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("private browser ticket history", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("retries a transient saved-ticket read and recovers", async () => {
    const read = vi
      .spyOn(api, "getPrivateTicket")
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValue(savedTicket);
    await renderTickets();

    expect(await screen.findByRole("alert")).toHaveTextContent("A saved ticket is unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("C-019")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps a denied private ticket unavailable without exposing ticket details", async () => {
    vi.spyOn(api, "getPrivateTicket").mockRejectedValue(new ApiError(403, "Forbidden"));
    await renderTickets();

    expect(await screen.findByRole("alert")).toHaveTextContent("A saved ticket is unavailable");
    expect(screen.queryByText("C-019")).not.toBeInTheDocument();
    expect(screen.queryByText("Private Clinic")).not.toBeInTheDocument();
  });
});

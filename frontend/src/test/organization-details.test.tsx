import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Organization } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const demoOrganization: Organization = {
  id: "demo-university",
  name: "Almaty University · Demo",
  description: "Sample services for students.",
  category: "Universities",
  location: "Almaty, Kazakhstan",
  timezone: "Asia/Almaty",
  services: [
    {
      id: "student-services",
      name: "Student services",
      description: "Student records and enrollment.",
      prefix: "U",
      isOpen: true,
      avgServiceMinutes: 6,
      waitingCount: 2,
      estimatedWaitMinutes: 12,
      operatingHours: "09:00–17:00",
    },
  ],
};

async function renderOrganization() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/organizations/demo-university"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("organization service details", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a loading status while fetching organization details", async () => {
    vi.spyOn(api, "getOrganization").mockReturnValue(new Promise(() => {}));
    await renderOrganization();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("shows an empty state when an organization has no services", async () => {
    vi.spyOn(api, "getOrganization").mockResolvedValue({ ...demoOrganization, services: [] });
    await renderOrganization();

    expect(
      await screen.findByText("No services are available at this organization yet."),
    ).toBeInTheDocument();
  });

  it("shows backend hours, organization timezone and a disabled action for a closed queue", async () => {
    vi.spyOn(api, "getOrganization").mockResolvedValue({
      ...demoOrganization,
      services: [{ ...demoOrganization.services[0]!, isOpen: false }],
    });
    await renderOrganization();

    expect(await screen.findByRole("heading", { name: "Almaty University · Demo" })).toBeVisible();
    expect(screen.getByText(/Asia\/Almaty/)).toBeInTheDocument();
    expect(screen.getByText("Hours: 09:00–17:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue closed" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Join Queue" })).not.toBeInTheDocument();
  });

  it("offers retry after a recoverable error", async () => {
    const getOrganization = vi
      .spyOn(api, "getOrganization")
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce(demoOrganization);
    await renderOrganization();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t load this organization",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(getOrganization).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Student services" })).toBeVisible();
  });
});

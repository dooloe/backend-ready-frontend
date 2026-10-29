import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Organization } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

const organizations: Organization[] = [
  {
    id: "university",
    name: "Almaty University",
    description: "Student services",
    category: "Universities",
    location: "Almaty, Kazakhstan",
    timezone: "Asia/Almaty",
    services: [
      {
        id: "records",
        name: "Student records",
        description: "Enrollment documents",
        prefix: "U",
        isOpen: true,
        avgServiceMinutes: 5,
        waitingCount: 2,
        estimatedWaitMinutes: 10,
        operatingHours: null,
      },
    ],
  },
  {
    id: "clinic",
    name: "Astana Clinic",
    description: "Community healthcare",
    category: "Clinics",
    location: "Astana, Kazakhstan",
    timezone: "Asia/Almaty",
    services: [
      {
        id: "family-care",
        name: "Family care",
        description: "General health appointments",
        prefix: "C",
        isOpen: true,
        avgServiceMinutes: 10,
        waitingCount: 0,
        estimatedWaitMinutes: null,
        operatingHours: null,
      },
    ],
  },
];

async function renderExplore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("Explore directory filters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("filters organizations by selected category", async () => {
    vi.spyOn(api, "listOrganizations").mockResolvedValue(organizations);
    await renderExplore();

    expect(await screen.findByRole("heading", { name: "Almaty University" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clinics" }));

    expect(screen.getByRole("heading", { name: "Astana Clinic" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Almaty University" })).not.toBeInTheDocument();
    expect(screen.getByText("1 organization")).toBeVisible();
  });

  it("searches organization names, service details, and locations", async () => {
    vi.spyOn(api, "listOrganizations").mockResolvedValue(organizations);
    await renderExplore();
    await screen.findByRole("heading", { name: "Almaty University" });
    const search = screen.getByRole("textbox", { name: "Search organizations and services" });

    fireEvent.change(search, { target: { value: "enrollment documents" } });
    expect(screen.getByRole("heading", { name: "Almaty University" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Astana Clinic" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Astana" } });
    expect(screen.getByRole("heading", { name: "Astana Clinic" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Almaty University" })).not.toBeInTheDocument();
  });

  it("resets both search and category after an empty result", async () => {
    vi.spyOn(api, "listOrganizations").mockResolvedValue(organizations);
    await renderExplore();
    await screen.findByRole("heading", { name: "Almaty University" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search organizations and services" }), {
      target: { value: "not found" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clinics" }));
    expect(await screen.findByText("No matching organizations")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByRole("textbox", { name: "Search organizations and services" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("button", { name: "All organizations" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Almaty University" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Astana Clinic" })).toBeVisible();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Organization } from "@/lib/api";
import { OrganizationsTab } from "@/routes/admin";

describe("admin organization directory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows every organization and a link to its services", async () => {
    vi.spyOn(api, "listOrganizations").mockResolvedValue([
      {
        id: "demo-university",
        name: "Almaty University · Demo",
        description: "A sample university.",
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
      },
      {
        id: "demo-clinic",
        name: "City Health Clinic · Demo",
        description: "A sample clinic.",
        category: "Clinics",
        location: "Astana, Kazakhstan",
        timezone: "Asia/Almaty",
        services: [],
      },
    ] satisfies Organization[]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OrganizationsTab />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Almaty University · Demo")).toBeInTheDocument();
    expect(screen.getByText("City Health Clinic · Demo")).toBeInTheDocument();
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "View organization" })
        .map((link) => link.getAttribute("href")),
    ).toContain("/organizations/demo-university");
  });
});

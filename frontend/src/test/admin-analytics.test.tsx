import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type Analytics } from "@/lib/api";
import { StatsTab } from "@/routes/admin";

const analytics: Analytics = {
  dateFrom: "2026-10-27",
  dateTo: "2026-10-27",
  timezone: "Asia/Almaty",
  issued: 8,
  waiting: 2,
  completed: 5,
  meanWaitMinutes: 6.4,
  meanServiceMinutes: 9.2,
  byService: [
    {
      serviceId: "service-1",
      serviceName: "Consultation",
      issued: 8,
      waiting: 2,
      completed: 5,
      meanWaitMinutes: 6.4,
      meanServiceMinutes: 9.2,
    },
  ],
  byDay: [{ date: "2026-10-27", issued: 8, completed: 5 }],
};

function renderStats() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatsTab />
    </QueryClientProvider>,
  );
}

describe("admin analytics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads real analytics and applies date filters to cards and service results", async () => {
    const getAnalytics = vi.spyOn(api, "getAnalytics").mockResolvedValue(analytics);
    renderStats();

    expect(await screen.findByText("Tickets issued")).toBeInTheDocument();
    expect(screen.getAllByText("9.2 min")).toHaveLength(2);
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(getAnalytics).toHaveBeenNthCalledWith(1, undefined, undefined);

    fireEvent.change(screen.getByLabelText("Analytics start date"), {
      target: { value: "2026-10-20" },
    });
    fireEvent.change(screen.getByLabelText("Analytics end date"), {
      target: { value: "2026-10-22" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));

    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith("2026-10-20", "2026-10-22"));
  });

  it("renders honest empty and unavailable metric states", async () => {
    vi.spyOn(api, "getAnalytics").mockResolvedValue({
      ...analytics,
      issued: 0,
      waiting: 0,
      completed: 0,
      meanWaitMinutes: null,
      meanServiceMinutes: null,
      byService: [],
      byDay: [{ date: "2026-10-27", issued: 0, completed: 0 }],
    });
    renderStats();

    expect(
      await screen.findByText("No tickets were issued during this date range."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("No service data for this range.")).toBeInTheDocument();
    expect(screen.getAllByText("0", { selector: "p.font-display" })).toHaveLength(3);
    expect(screen.getByTitle("2026-10-27: 0 issued, 0 completed")).toHaveStyle({ height: "0px" });
  });

  it("rejects incomplete date ranges without sending a malformed request", async () => {
    const getAnalytics = vi.spyOn(api, "getAnalytics").mockResolvedValue(analytics);
    renderStats();
    await screen.findByText("Tickets issued");

    fireEvent.change(screen.getByLabelText("Analytics start date"), {
      target: { value: "2026-10-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose both a start date and an end date");
    expect(getAnalytics).toHaveBeenCalledTimes(1);
  });

  it("keeps the error visible and allows a retry after network failure", async () => {
    const getAnalytics = vi
      .spyOn(api, "getAnalytics")
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValue(analytics);
    renderStats();

    expect(await screen.findByText(/Couldn’t load operational analytics/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Consultation")).toBeInTheDocument();
    expect(getAnalytics).toHaveBeenCalledTimes(2);
  });
});

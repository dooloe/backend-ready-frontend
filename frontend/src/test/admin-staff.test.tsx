import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { api, type Counter } from "@/lib/api";
import { StaffTab } from "@/routes/admin";

function renderStaff() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StaffTab />
    </QueryClientProvider>,
  );
}

describe("admin staff configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("edits staff identity and keeps rejected changes visible for correction", async () => {
    const staff = {
      id: "staff-1",
      name: "Aigerim",
      username: "aigerim",
      role: "staff" as const,
      isActive: true,
    };
    vi.spyOn(api, "listStaff").mockResolvedValue([staff]);
    vi.spyOn(api, "listCounters").mockResolvedValue([]);
    const updateStaff = vi
      .spyOn(api, "updateStaff")
      .mockRejectedValueOnce(new Error("Username already taken"))
      .mockResolvedValueOnce({ ...staff, name: "Aigerim K.", username: "aigerim-k" })
      .mockRejectedValueOnce(new Error("Finish active work before deactivating staff"));
    const toastError = vi.spyOn(toast, "error").mockImplementation(() => "toast-id");

    renderStaff();

    fireEvent.change(await screen.findByLabelText("Name for aigerim"), {
      target: { value: "Aigerim K." },
    });
    fireEvent.change(screen.getByLabelText("Username for aigerim"), {
      target: { value: "aigerim-k" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateStaff).toHaveBeenNthCalledWith(1, "staff-1", {
        name: "Aigerim K.",
        username: "aigerim-k",
      }),
    );
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Username already taken"));
    expect(screen.getByLabelText("Name for aigerim")).toHaveValue("Aigerim K.");
    expect(screen.getByLabelText("Username for aigerim")).toHaveValue("aigerim-k");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith("staff-1", { isActive: false }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Finish active work before deactivating staff"),
    );
  });

  it("clears the write-only password only after staff creation succeeds", async () => {
    vi.spyOn(api, "listStaff").mockResolvedValue([]);
    vi.spyOn(api, "listCounters").mockResolvedValue([]);
    const createStaff = vi
      .spyOn(api, "createStaff")
      .mockRejectedValueOnce(new Error("Username already taken"))
      .mockResolvedValueOnce({
        id: "staff-2",
        name: "New visitor guide",
        username: "guide",
        role: "staff",
        isActive: true,
      });

    renderStaff();

    fireEvent.change(await screen.findByLabelText("Full name"), {
      target: { value: "New visitor guide" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "guide" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "one-time-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));

    await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Password")).toHaveValue("one-time-secret");

    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveValue(""));
    expect(screen.queryByText("one-time-secret")).not.toBeInTheDocument();
  });

  it("adds and removes a counter assignment and shows the unassigned state", async () => {
    const staff = {
      id: "staff-3",
      name: "Queue guide",
      username: "guide",
      role: "staff" as const,
      isActive: true,
    };
    let counters: Counter[] = [
      { id: "counter-1", name: "Counter 1", serviceIds: [], isActive: true, staffId: null },
    ];
    vi.spyOn(api, "listStaff").mockResolvedValue([staff]);
    vi.spyOn(api, "listCounters").mockImplementation(async () => counters);
    const updateCounter = vi.spyOn(api, "updateCounter").mockImplementation(async (id, patch) => {
      counters = counters.map((counter) =>
        counter.id === id ? { ...counter, ...patch } : counter,
      );
      return counters[0]!;
    });

    renderStaff();

    expect(await screen.findByText("None")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Counter to assign to Queue guide"), {
      target: { value: "counter-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign counter" }));
    await waitFor(() =>
      expect(updateCounter).toHaveBeenCalledWith("counter-1", { staffId: "staff-3" }),
    );
    const removeAssignment = await screen.findByRole("button", {
      name: "Remove Counter 1 assignment from Queue guide",
    });
    fireEvent.click(removeAssignment);
    await waitFor(() => expect(updateCounter).toHaveBeenCalledWith("counter-1", { staffId: null }));
    expect(await screen.findByText("None")).toBeVisible();
  });
});

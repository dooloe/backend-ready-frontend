import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { CountersTab } from "@/routes/admin";

const registrar = {
  id: "svc-reg",
  name: "Registrar Office",
  description: "Documents",
  prefix: "A",
  isOpen: true,
  avgServiceMinutes: 6,
};

function renderCounters() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CountersTab />
    </QueryClientProvider>,
  );
}

describe("admin counter configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers only admin-owned services and reports rejected changes", async () => {
    vi.spyOn(api, "listCounters").mockResolvedValue([
      {
        id: "counter-1",
        name: "Counter 1",
        serviceIds: ["svc-reg"],
        isActive: true,
        staffId: null,
      },
    ]);
    const listAdminServices = vi.spyOn(api, "listAdminServices").mockResolvedValue([registrar]);
    const listServices = vi
      .spyOn(api, "listServices")
      .mockResolvedValue([
        registrar,
        { ...registrar, id: "svc-other", name: "Other organization service" },
      ]);
    const updateCounter = vi
      .spyOn(api, "updateCounter")
      .mockResolvedValueOnce({
        id: "counter-1",
        name: "Renamed counter",
        serviceIds: ["svc-reg"],
        isActive: true,
        staffId: null,
      })
      .mockRejectedValue(new Error("Finish active service before changing this counter"));
    const toastError = vi.spyOn(toast, "error").mockImplementation(() => "toast-id");

    renderCounters();

    const serviceButton = await screen.findByRole("button", { name: "A · Registrar Office" });
    expect(screen.queryByText("Other organization service")).not.toBeInTheDocument();
    expect(listAdminServices).toHaveBeenCalledOnce();
    expect(listServices).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Counter name for Counter 1"), {
      target: { value: "Renamed counter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(updateCounter).toHaveBeenCalledWith("counter-1", { name: "Renamed counter" }),
    );

    fireEvent.click(serviceButton);
    await waitFor(() =>
      expect(updateCounter).toHaveBeenCalledWith("counter-1", { serviceIds: [] }),
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Finish active service before changing this counter"),
    );
  });

  it("prevents blank counter names from being created or saved", async () => {
    vi.spyOn(api, "listCounters").mockResolvedValue([
      {
        id: "counter-1",
        name: "Counter 1",
        serviceIds: [],
        isActive: true,
        staffId: null,
      },
    ]);
    vi.spyOn(api, "listAdminServices").mockResolvedValue([]);
    vi.spyOn(api, "listStaff").mockResolvedValue([]);
    const createCounter = vi.spyOn(api, "createCounter");
    const updateCounter = vi.spyOn(api, "updateCounter");
    renderCounters();

    const newName = screen.getByRole("textbox", { name: "Counter name" });
    fireEvent.change(newName, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Add counter" })).toBeDisabled();
    expect(createCounter).not.toHaveBeenCalled();

    const existingName = await screen.findByRole("textbox", { name: "Counter name for Counter 1" });
    fireEvent.change(existingName, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(updateCounter).not.toHaveBeenCalled();
  });

  it("shows a useful empty state when no counters are configured", async () => {
    vi.spyOn(api, "listCounters").mockResolvedValue([]);
    vi.spyOn(api, "listAdminServices").mockResolvedValue([]);
    vi.spyOn(api, "listStaff").mockResolvedValue([]);

    renderCounters();

    expect(
      await screen.findByText("No counters configured. Add a service counter above."),
    ).toBeVisible();
  });
});

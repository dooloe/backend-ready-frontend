import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { ServicesTab } from "@/routes/admin";

describe("admin service form", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps entered values after a failed request and clears only after success", async () => {
    vi.spyOn(api, "listAdminServices").mockResolvedValue([]);
    vi.spyOn(api, "listOrganizations").mockResolvedValue([]);
    const createService = vi
      .spyOn(api, "createService")
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce({
        id: "svc-new",
        name: "Registrar",
        description: "Documents",
        prefix: "R",
        isOpen: true,
        avgServiceMinutes: 5,
      });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ServicesTab />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Registrar" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "Documents" },
    });
    fireEvent.change(screen.getByPlaceholderText("Prefix"), { target: { value: "r" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => expect(createService).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText("Name")).toHaveValue("Registrar");
    expect(screen.getByPlaceholderText("Description")).toHaveValue("Documents");
    expect(screen.getByPlaceholderText("Prefix")).toHaveValue("r");

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(createService).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByPlaceholderText("Name")).toHaveValue(""));
    expect(screen.getByPlaceholderText("Description")).toHaveValue("");
    expect(screen.getByPlaceholderText("Prefix")).toHaveValue("");
  });

  it("validates schedule pairs and reports rejected service edits without clearing fields", async () => {
    vi.spyOn(api, "listAdminServices").mockResolvedValue([
      {
        id: "svc-reg",
        name: "Registrar Office",
        description: "Documents",
        prefix: "A",
        isOpen: true,
        isActive: true,
        avgServiceMinutes: 6,
      },
    ]);
    vi.spyOn(api, "listOrganizations").mockResolvedValue([]);
    const updateService = vi
      .spyOn(api, "updateService")
      .mockRejectedValue(new Error("Service hours conflict with an active queue"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ServicesTab />
      </QueryClientProvider>,
    );

    const name = await screen.findByLabelText("Name for Registrar Office");
    fireEvent.change(name, { target: { value: "Registrar services" } });
    fireEvent.change(screen.getByLabelText("Opens at for Registrar Office"), {
      target: { value: "09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save service" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Set both opening and closing times, or leave both blank.",
    );
    expect(updateService).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Closes at for Registrar Office"), {
      target: { value: "17:00" },
    });
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Service active" })[1]!);
    fireEvent.change(screen.getByLabelText("Duration for Registrar Office"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save service" }));

    await waitFor(() => expect(updateService).toHaveBeenCalledTimes(1));
    expect(updateService).toHaveBeenCalledWith("svc-reg", {
      name: "Registrar services",
      description: "Documents",
      prefix: "A",
      avgServiceMinutes: 12,
      isActive: false,
      isOpen: true,
      opensAt: "09:00",
      closesAt: "17:00",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Service hours conflict with an active queue",
    );
    expect(name).toHaveValue("Registrar services");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { ServicesTab } from "@/routes/admin";

describe("admin service form", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps entered values after a failed request and clears only after success", async () => {
    vi.spyOn(api, "listServices").mockResolvedValue([]);
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
});

import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { Index } from "@/routes/index";

describe("customer service catalog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a recoverable error and loads services after retry", async () => {
    const listServices = vi
      .spyOn(api, "listServices")
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Index />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load services");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(listServices).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No services are available right now.")).toBeInTheDocument();
  });
});

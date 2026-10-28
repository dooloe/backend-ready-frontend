import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { routeTree } from "@/routeTree.gen";

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return router.load().then(() => render(<RouterProvider router={router} />));
}

describe("customer language selection", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses a supported browser language on first visit", async () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["kk-KZ", "ru-RU"],
    });
    vi.spyOn(api, "listOrganizations").mockResolvedValue([]);
    await renderAt("/");

    expect(await screen.findByRole("heading", { name: "Әзірге ұйымдар жоқ" })).toBeVisible();
    expect(document.documentElement.lang).toBe("kk");
  });

  it("falls back to English when browser language is unsupported", async () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["fr-FR"],
    });
    vi.spyOn(api, "listOrganizations").mockResolvedValue([]);
    await renderAt("/");

    expect(
      await screen.findByRole("heading", { name: "No organizations available yet" }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists an explicit language choice and localizes the empty customer state", async () => {
    localStorage.setItem("kezek-customer-locale-v1", "ru");
    vi.spyOn(api, "listOrganizations").mockResolvedValue([]);
    await renderAt("/");

    expect(
      await screen.findByRole("heading", { name: "Пока нет доступных организаций" }),
    ).toBeVisible();
    const language = screen.getByRole("combobox", { name: "Язык" });
    fireEvent.change(language, { target: { value: "kk" } });

    expect(await screen.findByRole("heading", { name: "Әзірге ұйымдар жоқ" })).toBeVisible();
    expect(localStorage.getItem("kezek-customer-locale-v1")).toBe("kk");
    expect(document.documentElement.lang).toBe("kk");

    cleanup();
    await renderAt("/tickets");
    expect(await screen.findByRole("heading", { name: "Менің талондарым" })).toBeVisible();
  });

  it("shows a localized directory error and retry action", async () => {
    localStorage.setItem("kezek-customer-locale-v1", "ru");
    vi.spyOn(api, "listOrganizations").mockRejectedValue(new Error("Service offline"));
    await renderAt("/");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Не удалось подключиться к каталогу организаций",
      ),
    );
    expect(screen.getByRole("button", { name: "Повторить" })).toBeVisible();
  });

  it("localizes the My Tickets empty state without exposing any other ticket", async () => {
    localStorage.setItem("kezek-customer-locale-v1", "kk");
    await renderAt("/tickets");

    expect(await screen.findByRole("heading", { name: "Менің талондарым" })).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Келесі сапарыңыз осы жерден басталады" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /\d/ })).not.toBeInTheDocument();
  });

  it("localizes saved ticket status and date while keeping returned names", async () => {
    const token = "A".repeat(43);
    localStorage.setItem("kezek-customer-locale-v1", "ru");
    localStorage.setItem("kezek-private-ticket-links-v2", JSON.stringify([token]));
    vi.spyOn(api, "getPrivateTicket").mockResolvedValue({
      id: "internal-id",
      queueId: "queue-1",
      organizationName: "Demo Organization",
      ticketNumber: "A-001",
      serviceName: "Consultation",
      status: "waiting",
      position: 3,
      estimatedWaitMinutes: null,
      counterId: null,
      counterName: null,
      createdAt: "2026-10-27T10:00:00Z",
      calledAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      noShowAt: null,
    });
    await renderAt("/tickets");

    expect(await screen.findByText("A-001")).toBeVisible();
    expect(screen.getByText("ожидают")).toBeVisible();
    expect(screen.getByText("Demo Organization")).toBeVisible();
    expect(screen.getByText("Consultation")).toBeVisible();
    expect(
      screen.getByText(
        new Intl.DateTimeFormat("ru", { dateStyle: "medium" }).format(
          new Date("2026-10-27T10:00:00Z"),
        ),
      ),
    ).toBeVisible();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { TicketNotifications } from "@/components/ticket-notifications";

const originalSecureContext = window.isSecureContext;
const originalServiceWorker = navigator.serviceWorker;
const originalNotification = window.Notification;

function installBrowserPush({
  permission = "granted",
  existing = null as PushSubscription | null,
} = {}) {
  const subscription =
    existing ??
    ({
      endpoint: "https://fcm.googleapis.com/fcm/send/demo",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/demo",
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription);
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe,
    },
  };
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission,
      requestPermission: vi.fn().mockResolvedValue(permission),
    },
  });
  return { subscription, registration, subscribe };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: originalSecureContext,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: originalServiceWorker,
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: originalNotification,
  });
});

describe("private ticket browser notifications", () => {
  it("shows the normal ticket-page fallback when notifications are unavailable", () => {
    Object.defineProperty(window, "Notification", { configurable: true, value: undefined });
    render(<TicketNotifications accessToken={"A".repeat(43)} />);
    expect(screen.getByText(/Keep this ticket page open/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requires opt-in and registers a subscription authorized by the ticket link", async () => {
    const { subscribe } = installBrowserPush({ permission: "granted" });
    vi.spyOn(api, "getPushConfig").mockResolvedValue({ enabled: true, publicKey: "B".repeat(87) });
    const register = vi.spyOn(api, "registerTicketPush").mockResolvedValue();
    const token = "C".repeat(43);
    render(<TicketNotifications accessToken={token} />);

    expect(await screen.findByRole("button", { name: "Turn on" })).toBeVisible();
    expect(register).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(token, {
        endpoint: "https://fcm.googleapis.com/fcm/send/demo",
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      }),
    );
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeVisible();
  });

  it("falls back to ticket polling when the visitor denies permission", async () => {
    installBrowserPush({ permission: "default" });
    const notification = window.Notification;
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { ...notification, requestPermission: vi.fn().mockResolvedValue("denied") },
    });
    vi.spyOn(api, "getPushConfig").mockResolvedValue({ enabled: true, publicKey: "B".repeat(87) });
    const register = vi.spyOn(api, "registerTicketPush").mockResolvedValue();
    render(<TicketNotifications accessToken={"D".repeat(43)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/Keep this ticket page open/)).toBeVisible();
    expect(register).not.toHaveBeenCalled();
  });

  it("removes the authorized backend subscription and browser subscription on opt-out", async () => {
    const { subscription } = installBrowserPush({
      permission: "granted",
      existing: {
        endpoint: "https://fcm.googleapis.com/fcm/send/demo",
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/demo",
          keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
        }),
        unsubscribe: vi.fn().mockResolvedValue(true),
      } as unknown as PushSubscription,
    });
    vi.spyOn(api, "getPushConfig").mockResolvedValue({ enabled: true, publicKey: "B".repeat(87) });
    vi.spyOn(api, "registerTicketPush").mockResolvedValue();
    const remove = vi.spyOn(api, "removeTicketPush").mockResolvedValue();
    const token = "E".repeat(43);
    render(<TicketNotifications accessToken={token} />);
    const disable = await screen.findByRole("button", { name: "Turn off" });
    fireEvent.click(disable);
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(token, "https://fcm.googleapis.com/fcm/send/demo"),
    );
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useCustomerLocale } from "@/lib/customer-locale";

function decodeApplicationKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

function subscriptionPayload(subscription: PushSubscription) {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.["p256dh"] || !value.keys["auth"]) {
    throw new Error("The browser did not return a complete notification subscription.");
  }
  return {
    endpoint: value.endpoint,
    keys: { p256dh: value.keys["p256dh"], auth: value.keys["auth"] },
  };
}

export function TicketNotifications({ accessToken }: { accessToken: string }) {
  const { t: tr } = useCustomerLocale();
  const [state, setState] = useState<
    "checking" | "unsupported" | "unavailable" | "denied" | "enabled" | "ready" | "failed"
  >("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !window.isSecureContext) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    void api
      .getPushConfig()
      .then(async (config) => {
        if (!active) return;
        if (!config.enabled || !config.publicKey) {
          setState("unavailable");
          return;
        }
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (subscription && Notification.permission === "granted") {
          try {
            await api.registerTicketPush(accessToken, subscriptionPayload(subscription));
            if (active) setState("enabled");
          } catch {
            if (active) setState("failed");
          }
        } else {
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function toggle() {
    setBusy(true);
    let newSubscription: PushSubscription | null = null;
    try {
      if (state === "enabled") {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api.removeTicketPush(accessToken, subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("ready");
        toast.success(tr("Browser notifications are off."));
        return;
      }
      const config = await api.getPushConfig();
      if (!config.enabled || !config.publicKey) {
        setState("unavailable");
        toast.error(
          tr("Browser notifications are unavailable. Keep this ticket page open for updates."),
        );
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission === "denied") setState("denied");
      if (permission !== "granted") {
        toast.error(
          tr("Notification permission was not granted. Keep this ticket page open for updates."),
        );
        return;
      }
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationKey(config.publicKey),
      });
      await api.registerTicketPush(accessToken, subscriptionPayload(newSubscription));
      setState("enabled");
      toast.success(tr("Browser notifications are on for this ticket."));
    } catch {
      if (newSubscription) await newSubscription.unsubscribe().catch(() => undefined);
      setState("failed");
      toast.error(tr("Notifications could not be updated. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border bg-white p-4 text-left">
      <div className="flex items-start gap-3">
        {state === "enabled" ? (
          <Bell className="mt-0.5 text-primary" size={18} />
        ) : (
          <BellOff className="mt-0.5 text-muted-foreground" size={18} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{tr("Turn notifications")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {state === "checking"
              ? tr("Checking notification support…")
              : state === "ready"
                ? tr(
                    "If enabled, your browser may show a brief alert when staff call. Keep this page open to follow queue details.",
                  )
                : state === "enabled"
                  ? tr(
                      "Notifications are enabled for this ticket. Keep this page open to follow queue details.",
                    )
                  : state === "denied"
                    ? tr(
                        "Notifications are blocked in browser settings. Keep this ticket page open for updates.",
                      )
                    : state === "unsupported"
                      ? tr(
                          "This browser cannot send ticket notifications. Keep this ticket page open for updates.",
                        )
                      : state === "unavailable"
                        ? tr(
                            "Ticket notifications are not configured right now. Keep this ticket page open for updates.",
                          )
                        : tr(
                            "Notifications could not be set up. Queue updates still appear on this page.",
                          )}
          </p>
        </div>
        {["ready", "enabled", "failed"].includes(state) && (
          <Button
            type="button"
            variant={state === "enabled" ? "outline" : "default"}
            size="sm"
            disabled={busy}
            aria-pressed={state === "enabled"}
            onClick={() => void toggle()}
          >
            {busy
              ? tr("Saving…")
              : state === "enabled"
                ? tr("Turn off")
                : state === "failed"
                  ? tr("Try again")
                  : tr("Turn on")}
          </Button>
        )}
      </div>
    </section>
  );
}

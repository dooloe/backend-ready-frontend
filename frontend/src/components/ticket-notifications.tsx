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
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }
    setPermissionDenied(Notification.permission === "denied");
    void api
      .getPushConfig()
      .then(async (config) => {
        if (!active || !config.enabled || !config.publicKey) return;
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (subscription) {
          setEnabled(true);
        }
        if (subscription && Notification.permission === "granted") {
          try {
            await api.registerTicketPush(accessToken, subscriptionPayload(subscription));
            if (active) setEnabled(true);
          } catch {
            if (active) setEnabled(false);
          }
        }
        if (active) setSupported(true);
      })
      .catch(() => {
        if (active) setSupported(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function toggle() {
    setBusy(true);
    let newSubscription: PushSubscription | null = null;
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api.removeTicketPush(accessToken, subscription.endpoint);
          await subscription.unsubscribe();
        }
        setEnabled(false);
        toast.success(tr("Browser notifications are off."));
        return;
      }
      const config = await api.getPushConfig();
      if (!config.enabled || !config.publicKey) {
        setSupported(false);
        toast.error(
          tr("Browser notifications are unavailable. Keep this ticket page open for updates."),
        );
        return;
      }
      const permission = await Notification.requestPermission();
      setPermissionDenied(permission === "denied");
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
      setEnabled(true);
      toast.success(tr("Browser notifications are on for this ticket."));
    } catch (error) {
      if (newSubscription) await newSubscription.unsubscribe().catch(() => undefined);
      toast.error(
        error instanceof Error
          ? error.message
          : tr("Notifications could not be updated. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border bg-white p-4 text-left">
      <div className="flex items-start gap-3">
        {enabled ? (
          <Bell className="mt-0.5 text-primary" size={18} />
        ) : (
          <BellOff className="mt-0.5 text-muted-foreground" size={18} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{tr("Turn notifications")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {supported && !permissionDenied
              ? tr(
                  "Get a brief alert when staff call you. Your ticket page remains the source for queue details.",
                )
              : tr(
                  "Browser notifications are unavailable. Keep this ticket page open for updates.",
                )}
          </p>
        </div>
        {supported && !permissionDenied && (
          <Button
            type="button"
            variant={enabled ? "outline" : "default"}
            size="sm"
            disabled={busy}
            aria-pressed={enabled}
            onClick={() => void toggle()}
          >
            {busy ? tr("Saving…") : enabled ? tr("Turn off") : tr("Turn on")}
          </Button>
        )}
        {supported && enabled && permissionDenied && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-pressed={enabled}
            onClick={() => void toggle()}
          >
            {busy ? tr("Saving…") : tr("Turn off")}
          </Button>
        )}
      </div>
    </section>
  );
}

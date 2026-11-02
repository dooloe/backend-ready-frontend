import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Ticket, ArrowLeft, Clock3, Users, CheckCircle2, Copy, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api, type TicketStatus, type IssuedTicket } from "@/lib/api";
import { ticketIsPollingActive, ticketRefetchInterval } from "@/lib/ticket-polling";
import { saveTicketToken } from "@/lib/saved-tickets";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/confirm-action";
import { TicketNotifications } from "@/components/ticket-notifications";
import { LoadError, LoadingCards } from "@/components/customer-ui";
import { useCustomerLocale } from "@/lib/customer-locale";
import { isDemoOrganization } from "@/lib/organizations";
export const Route = createFileRoute("/ticket/$id")({
  head: () => ({
    meta: [
      { title: "Your digital ticket — Kezek" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TicketPage,
});
const statusText: Record<TicketStatus, string> = {
  waiting: "You’re in the queue",
  called: "It’s your turn!",
  serving: "You’re being served",
  completed: "All done. Enjoy your day!",
  cancelled: "Your ticket is cancelled",
  no_show: "You missed your turn",
};
function TicketPage() {
  const { t: tr, tError, formatNumber, formatTime } = useCustomerLocale();
  const { id } = Route.useParams();
  const isPrivateToken = /^[A-Za-z0-9_-]{43}$/.test(id);
  const qc = useQueryClient();
  const query = useQuery<IssuedTicket>({
    queryKey: ["ticket", id],
    queryFn: ({ signal }) => api.getPrivateTicket(id, signal),
    retry: false,
    refetchInterval: (q) => ticketRefetchInterval(q.state.data?.status),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const t = query.data;
  useEffect(() => {
    if (t && isPrivateToken) saveTicketToken(id);
  }, [id, isPrivateToken, t]);
  const cancel = useMutation<IssuedTicket>({
    mutationFn: () => api.cancelPrivateTicket(id),
    onSuccess: (v) => {
      qc.setQueryData(["ticket", id], v);
      toast.success(tr("Ticket cancelled"));
    },
    onError: (e) => {
      toast.error(
        tError(
          e.message,
          "Ticket cancellation could not be completed. Refresh to see the current status.",
        ),
      );
      void query.refetch();
    },
  });
  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/tickets"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} /> {tr("My Tickets")}
      </Link>
      {query.isPending && <LoadingCards />}
      {query.isError && !t && (
        <LoadError
          message={
            t
              ? "Live updates paused. Showing the last confirmed state. Retry to refresh."
              : tr("Ticket unavailable. Open the full private link you received, or try again.")
          }
          retry={() => void query.refetch()}
        />
      )}
      {t && (
        <>
          {query.isError && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p className="font-semibold">
                {tr("Queue information may be out of date. Reconnecting…")}
              </p>
              <p className="mt-1">
                {tr("Last updated {time}.", {
                  time: query.dataUpdatedAt ? formatTime(query.dataUpdatedAt) : tr("not yet"),
                })}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void query.refetch()}
              >
                {tr("Retry")}
              </Button>
            </div>
          )}
          <article className="ticket-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b px-7 py-5">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Ticket size={19} className="text-primary" /> {tr("Your digital ticket")}
              </span>
              <span className="status-pill" data-status={t.status}>
                {tr(t.status.replace("_", " "))}
              </span>
            </div>
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">{t.organizationName}</p>
                {(t.organizationIsDemo ?? isDemoOrganization(t.organizationName)) && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {tr("Demo")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold">{tr(t.serviceName)}</p>
              {t.organizationLocation && (
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 shrink-0" size={15} />
                  {t.organizationLocation}
                </p>
              )}
              <div role="status" aria-live="polite">
                <h1 className="mt-5 text-2xl font-bold">{tr(statusText[t.status])}</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {tr(
                    t.status === "waiting"
                      ? t.position === 1
                        ? "You are next. Please wait for the staff call."
                        : "Keep track of your queue and arrive at the service location before you are called."
                      : t.status === "called"
                        ? "Please make your way to the assigned counter."
                        : t.status === "no_show"
                          ? "You can join a new queue when you’re ready."
                          : t.status === "cancelled"
                            ? "Your ticket was cancelled. You no longer hold a place in the queue."
                            : t.status === "serving"
                              ? "The team is taking care of your request."
                              : "You can find this ticket again in My Tickets.",
                  )}
                </p>
              </div>
              {t.status === "waiting" && t.position !== null && t.position > 1 && (
                <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-950">
                  {tr("There are {count} people ahead of you.", {
                    count: formatNumber(t.position - 1),
                  })}
                  {t.estimatedWaitMinutes !== null &&
                    ` ${tr("Estimated wait: about {minutes} minutes.", { minutes: formatNumber(t.estimatedWaitMinutes) })}`}
                </p>
              )}
              <div className="my-5 border-t border-dashed" />
              {t.status === "waiting" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-background p-4">
                    <Users className="mx-auto mb-2 text-muted-foreground" size={19} />
                    <p className="text-2xl font-bold">
                      {t.position === null ? "—" : formatNumber(Math.max(0, t.position - 1))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tr("People ahead of you")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background p-4">
                    <Clock3 className="mx-auto mb-2 text-muted-foreground" size={19} />
                    <p className="text-2xl font-bold">
                      {t.estimatedWaitMinutes === null ? "—" : formatNumber(t.estimatedWaitMinutes)}
                      <span className="ml-1 text-sm font-normal">
                        {t.estimatedWaitMinutes === null ? "" : tr("min")}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tr(
                        t.estimatedWaitMinutes === null ? "Estimate unavailable" : "Estimated wait",
                      )}
                    </p>
                  </div>
                </div>
              )}
              {(t.status === "called" || t.status === "serving") && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-primary">
                  <p className="text-xs font-medium">{tr("Your assigned counter")}</p>
                  <p className="mt-2 text-2xl font-bold">
                    {t.counterName ?? tr("Please ask a staff member")}
                  </p>
                </div>
              )}
              <p className="mt-5 text-sm font-semibold text-muted-foreground">{t.ticketNumber}</p>
              {t.status === "completed" && (
                <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
              )}
              {isPrivateToken && ["waiting", "called", "serving"].includes(t.status) && (
                <TicketNotifications accessToken={id} />
              )}
              <details className="mt-6 rounded-lg border p-4 text-left">
                <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
                  {tr("TICKET UPDATES")}
                </summary>
                <div className="mt-3 space-y-2">
                  {[
                    ["Ticket issued", t.createdAt],
                    ["Called to counter", t.calledAt],
                    ["Service started", t.startedAt],
                    [
                      t.status === "cancelled"
                        ? "Cancelled"
                        : t.status === "no_show"
                          ? "Marked no-show"
                          : "Service finished",
                      t.completedAt ?? t.cancelledAt ?? t.noShowAt,
                    ],
                  ]
                    .filter(([, date]) => date)
                    .map(([label, date]) => (
                      <div key={label} className="flex justify-between gap-3 text-xs">
                        <time className="text-muted-foreground">
                          {tr(String(label))} · {formatTime(date ?? "")}
                        </time>
                      </div>
                    ))}
                </div>
              </details>
              {t.status === "waiting" && (
                <ConfirmAction
                  title={tr("Cancel this ticket?")}
                  description={tr("Cancel this ticket? You will lose your place in the queue.")}
                  cancelText={tr("Keep ticket")}
                  confirmText={tr("Cancel ticket")}
                  onConfirm={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  <Button variant="outline" className="mt-7 w-full" disabled={cancel.isPending}>
                    {cancel.isPending ? tr("Cancelling…") : tr("Cancel ticket")}
                  </Button>
                </ConfirmAction>
              )}
            </div>
          </article>
          <div className="mt-5 space-y-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href).then(
                  () => toast.success(tr("Private ticket link copied")),
                  () => toast.error(tr("Couldn’t copy. Bookmark this page instead.")),
                );
              }}
            >
              <Copy size={15} /> {tr("Copy private ticket link")}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {tr("Keep this link private. Anyone with it can view or cancel this ticket.")}
              <br />
              {query.dataUpdatedAt && !query.isError
                ? `${tr("Last updated {time}.", { time: formatTime(query.dataUpdatedAt) })} `
                : ""}
              {ticketIsPollingActive(t.status)
                ? tr(
                    "This page checks for updates every 5 seconds. Keep it open to follow the queue.",
                  )
                : tr("This visit has ended.")}
            </p>
            <Link to="/" className="inline-block text-sm font-medium text-primary">
              {tr("Explore organizations")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

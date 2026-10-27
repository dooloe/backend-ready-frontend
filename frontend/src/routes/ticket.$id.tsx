import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Ticket, ArrowLeft, Clock3, Users, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  isIssuedTicket,
  type IssuedTicket,
  type TicketStatus,
  type TicketView,
} from "@/lib/api";
import { ticketRefetchInterval } from "@/lib/ticket-polling";
import { saveLegacyTicketId, saveTicketToken } from "@/lib/saved-tickets";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadError, LoadingCards } from "@/components/customer-ui";
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
  const { id } = Route.useParams();
  const isPrivateToken = /^[A-Za-z0-9_-]{43}$/.test(id);
  const qc = useQueryClient();
  const query = useQuery<IssuedTicket | TicketView>({
    queryKey: ["ticket", id],
    queryFn: ({ signal }) =>
      isPrivateToken ? api.getPrivateTicket(id, signal) : api.getTicket(id, signal),
    retry: false,
    refetchInterval: (q) => ticketRefetchInterval(q.state.data?.status),
  });
  const t = query.data;
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
    enabled: !!t && !isPrivateToken,
  });
  const organizationName =
    t && isIssuedTicket(t)
      ? t.organizationName
      : t
        ? organizations.data?.find((org) =>
            org.services.some((service) => service.id === t.serviceId),
          )?.name
        : undefined;
  useEffect(() => {
    if (!t) return;
    if (isPrivateToken) saveTicketToken(id);
    else saveLegacyTicketId(id);
  }, [id, isPrivateToken, t]);
  const cancel = useMutation<IssuedTicket | TicketView>({
    mutationFn: () => (isPrivateToken ? api.cancelPrivateTicket(id) : api.cancelTicket(id)),
    onSuccess: (v) => {
      qc.setQueryData(["ticket", id], v);
      toast.success("Ticket cancelled");
    },
    onError: (e) => {
      toast.error(e.message);
      void query.refetch();
    },
  });
  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/tickets"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} /> My Tickets
      </Link>
      {query.isPending && <LoadingCards />}
      {query.isError && (
        <LoadError
          message={
            t
              ? "Live updates paused. Showing the last confirmed state. Retry to refresh."
              : "Ticket unavailable. Open the full private link you received, or try again."
          }
          retry={() => void query.refetch()}
        />
      )}
      {t && (
        <>
          <article className="ticket-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b px-7 py-5">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Ticket size={19} className="text-primary" /> Your digital ticket
              </span>
              <span className="status-pill" data-status={t.status}>
                {t.status.replace("_", " ")}
              </span>
            </div>
            <div className="p-7 text-center sm:p-9">
              <p className="text-sm font-medium text-muted-foreground">
                {organizationName ?? "Kezek"}
              </p>
              <h1 className="mt-1 text-lg font-semibold">{t.serviceName}</h1>
              <p className="ticket-code my-6 break-all text-7xl sm:text-8xl">
                {isIssuedTicket(t) ? t.ticketNumber : t.code}
              </p>
              <div role="status" aria-live="polite">
                <h2 className="text-xl font-bold">{statusText[t.status]}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.status === "waiting"
                    ? "Your place is saved. Keep this page open for updates."
                    : t.status === "called"
                      ? "Please make your way to the assigned counter."
                      : t.status === "no_show"
                        ? "You can join a new queue when you’re ready."
                        : t.status === "serving"
                          ? "The team is taking care of your request."
                          : "You can find this ticket again in My Tickets."}
                </p>
              </div>
              <div className="my-7 border-t border-dashed" />
              {t.status === "waiting" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-background p-4">
                    <Users className="mx-auto mb-2 text-muted-foreground" size={19} />
                    <p className="text-3xl font-bold">
                      {t.position === null ? "—" : Math.max(0, t.position - 1)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">People ahead of you</p>
                  </div>
                  <div className="rounded-xl bg-background p-4">
                    <Clock3 className="mx-auto mb-2 text-muted-foreground" size={19} />
                    <p className="text-3xl font-bold">
                      {t.estimatedWaitMinutes === null ? "—" : t.estimatedWaitMinutes}
                      <span className="ml-1 text-sm font-normal">
                        {t.estimatedWaitMinutes === null ? "" : "min"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.estimatedWaitMinutes === null ? "Estimate unavailable" : "Estimated wait"}
                    </p>
                  </div>
                </div>
              )}
              {(t.status === "called" || t.status === "serving") && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-primary">
                  <p className="text-xs font-medium">Your assigned counter</p>
                  <p className="mt-2 text-2xl font-bold">
                    {t.counterName ?? "Please ask a staff member"}
                  </p>
                </div>
              )}
              {t.status === "completed" && (
                <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
              )}
              <div className="mt-7 space-y-3 text-left">
                <p className="text-xs font-semibold text-muted-foreground">TICKET UPDATES</p>
                {[
                  ["Ticket issued", t.createdAt],
                  ["Called to counter", t.calledAt],
                  ["Service started", isIssuedTicket(t) ? t.startedAt : t.servedAt],
                  [
                    t.status === "cancelled"
                      ? "Cancelled"
                      : t.status === "no_show"
                        ? "Marked no-show"
                        : "Service finished",
                    isIssuedTicket(t)
                      ? (t.completedAt ?? t.cancelledAt ?? t.noShowAt)
                      : t.finishedAt,
                  ],
                ]
                  .filter(([, date]) => date)
                  .map(([label, date]) => (
                    <div key={label} className="flex justify-between gap-3 text-xs">
                      <span>{label}</span>
                      <time className="text-muted-foreground">
                        {new Date(date!).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
              </div>
              {t.status === "waiting" && (
                <ConfirmAction
                  title="Cancel your ticket?"
                  description="You’ll lose your current place in the queue. You can join again later."
                  onConfirm={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  <Button variant="outline" className="mt-7 w-full" disabled={cancel.isPending}>
                    Cancel Ticket
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
                  () => toast.success("Private ticket link copied"),
                  () => toast.error("Couldn’t copy. Bookmark this page instead."),
                );
              }}
            >
              <Copy size={15} /> Copy private ticket link
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Keep this link private. Anyone with it can view or cancel this ticket.
              <br />
              {query.dataUpdatedAt
                ? `Last updated ${new Date(query.dataUpdatedAt).toLocaleTimeString()}. `
                : ""}
              {ticketRefetchInterval(t.status)
                ? "Refreshes every 5 seconds."
                : "This visit has ended."}
            </p>
            <Link to="/" className="inline-block text-sm font-medium text-primary">
              Explore organizations
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

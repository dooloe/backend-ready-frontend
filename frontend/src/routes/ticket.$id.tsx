import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ticketRefetchInterval } from "@/lib/ticket-polling";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ticket/$id")({
  head: () => ({
    meta: [
      { title: "Your ticket — Kezek" },
      { name: "description", content: "Live position and estimated wait for your Kezek ticket." },
      { property: "og:title", content: "Your ticket — Kezek" },
      {
        property: "og:description",
        content: "Live position and estimated wait for your Kezek ticket.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketPage,
});

const statusText: Record<string, string> = {
  waiting: "You're in line",
  called: "It's your turn!",
  serving: "Being served",
  completed: "All done — thank you",
  cancelled: "Ticket cancelled",
  no_show: "Missed — marked as no-show",
};
function TicketPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: t, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.getTicket(id),
    refetchInterval: (query) => ticketRefetchInterval(query.state.data?.status),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelTicket(id),
    onSuccess: (v) => qc.setQueryData(["ticket", id], v),
    onError: (e) => toast.error(e.message),
  });

  if (error) return <p className="text-destructive">{error.message}</p>;
  if (!t) return <p className="text-muted-foreground">Loading ticket…</p>;

  return (
    <div className="mx-auto max-w-md">
      <div className="ticket-card p-8 text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">{t.serviceName}</p>
        <p className="ticket-code mt-2 text-8xl">{t.code}</p>
        <p className="mt-2 text-muted-foreground">{t.customerName}</p>
        <div className="my-6 border-t border-dashed" />
        <span className="status-pill" data-status={t.status}>
          {t.status.replace("_", " ")}
        </span>
        <h2 className="mt-3 text-2xl font-semibold">{statusText[t.status]}</h2>
        {t.status === "waiting" && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Position</p>
              <p className="font-display text-4xl font-bold">{t.position}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Est. wait</p>
              <p className="font-display text-4xl font-bold">
                {t.estimatedWaitMinutes === null ? "—" : `${t.estimatedWaitMinutes}m`}
              </p>
              {t.estimatedWaitMinutes === null && (
                <p className="text-xs text-muted-foreground">No counters open</p>
              )}
            </div>
          </div>
        )}
        {(t.status === "called" || t.status === "serving") && t.counterName && (
          <p className="mt-4 rounded-xl bg-accent p-4 text-xl font-semibold text-accent-foreground">
            Go to {t.counterName}
          </p>
        )}
        {t.status === "waiting" && (
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            Cancel my ticket
          </Button>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Bookmark this page — it's your private ticket link. Updates every few seconds.
      </p>
    </div>
  );
}

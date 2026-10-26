import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadError, LoadingCards } from "@/components/customer-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff dashboard — Kezek" },
      { name: "description", content: "Call, serve and complete tickets at your counter." },
      { property: "og:title", content: "Staff dashboard — Kezek" },
      { property: "og:description", content: "Call, serve and complete tickets at your counter." },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const session = useSession();
  if (!session)
    return (
      <p className="text-muted-foreground">
        Please{" "}
        <Link to="/login" className="text-primary underline">
          sign in
        </Link>{" "}
        to use the staff dashboard.
      </p>
    );
  return <Dashboard userId={session.user.id} isAdmin={session.user.role === "admin"} />;
}

function Dashboard({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const {
    data: counters,
    isPending: countersLoading,
    error: countersError,
    refetch: reloadCounters,
  } = useQuery({ queryKey: ["counters"], queryFn: api.listCounters });
  const mine = useMemo(
    () => counters?.filter((c) => isAdmin || c.staffId === userId || c.staffId === null) ?? [],
    [counters, isAdmin, userId],
  );
  const [counterId, setCounterId] = useState<string>("");
  useEffect(() => {
    if (!counterId && mine[0]) setCounterId(mine[0].id);
  }, [mine, counterId]);

  const {
    data: queue,
    isPending: queueLoading,
    error: queueError,
    refetch: reloadQueue,
  } = useQuery({
    queryKey: ["queue", counterId],
    queryFn: () => api.getQueue(counterId),
    enabled: !!counterId,
    refetchInterval: 5000,
  });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      toast.success("Queue updated");
      return qc.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const current = queue?.current;
  const disabled = act.isPending || !!queueError || queueLoading;
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-3xl font-bold">Service desk</h1>
        {mine.map((c) => (
          <Button
            key={c.id}
            variant={c.id === counterId ? "default" : "outline"}
            onClick={() => setCounterId(c.id)}
          >
            {c.name}
            {!c.isActive && " (inactive)"}
          </Button>
        ))}
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Call the next visitor, then start and complete their service. Queue order is automatic.
      </p>
      {countersLoading && <LoadingCards />}
      {countersError && (
        <LoadError message="Couldn’t load your counters." retry={() => void reloadCounters()} />
      )}
      {!countersLoading && !countersError && mine.length === 0 && (
        <p className="surface p-6">No counters available. Ask your administrator for access.</p>
      )}
      {queueError && (
        <LoadError
          message="Queue updates paused. Refresh before taking another action."
          retry={() => void reloadQueue()}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="ticket-card p-8">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Now serving</p>
          {current ? (
            <>
              <p className="ticket-code mt-2 text-7xl">{current.code}</p>
              <p className="mt-1 text-lg">
                {current.customerName} · {current.serviceName}
              </p>
              <span className="status-pill mt-3" data-status={current.status}>
                {current.status}
              </span>
              <div className="mt-6 flex flex-wrap gap-2">
                {current.status === "called" && (
                  <>
                    <Button
                      disabled={disabled}
                      onClick={() => act.mutate(() => api.startService(current.id))}
                    >
                      Start service
                    </Button>
                    <ConfirmAction
                      title="Mark this visitor as a no-show?"
                      description="This ends their ticket. Confirm they are not at the counter."
                      onConfirm={() => act.mutate(() => api.markNoShow(current.id))}
                      disabled={disabled}
                    >
                      <Button variant="outline" disabled={disabled}>
                        Mark No-show
                      </Button>
                    </ConfirmAction>
                  </>
                )}
                {current.status === "serving" && (
                  <Button
                    disabled={disabled}
                    variant="secondary"
                    onClick={() => act.mutate(() => api.completeTicket(current.id))}
                  >
                    Complete Service
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-muted-foreground">No one at this counter.</p>
              <Button
                size="lg"
                className="mt-6"
                disabled={
                  !counterId ||
                  disabled ||
                  !mine.find((c) => c.id === counterId)?.isActive ||
                  !queue?.waiting.length
                }
                onClick={() =>
                  act.mutate(async () => {
                    const t = await api.callNext(counterId);
                    if (!t) toast("Queue is empty");
                  })
                }
              >
                Call Next
              </Button>
            </>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Waiting ({queue?.waiting.length ?? "—"})</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Next ticket:{" "}
            <strong className="text-primary">
              {queue?.waiting[0]?.code ?? "No visitors waiting"}
            </strong>
          </p>
          <ul className="mt-4 divide-y">
            {queue?.waiting.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <span className="font-display font-bold text-primary">{t.code}</span>
                <span className="text-sm">{t.customerName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
            {queue && queue.waiting.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">Nobody waiting.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

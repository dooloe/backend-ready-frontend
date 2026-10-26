import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ticket, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingCards, QueueSummary } from "@/components/customer-ui";
import { saveTicket } from "@/lib/saved-tickets";

export const Route = createFileRoute("/join/$organizationId/$serviceId")({
  head: () => ({ meta: [{ title: "Confirm your place — Kezek" }] }),
  component: JoinPage,
});
function JoinPage() {
  const { organizationId, serviceId } = Route.useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId),
    refetchInterval: 5000,
    retry: false,
  });
  const service = query.data?.services.find((s) => s.id === serviceId);
  const join = useMutation({
    mutationFn: () => api.joinQueue({ serviceId, customerName: "Visitor" }),
    onSuccess: (ticket) => {
      saveTicket(ticket.id);
      void navigate({ to: "/ticket/$id", params: { id: ticket.id } });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return (
    <div className="mx-auto max-w-xl">
      <Link
        to="/organizations/$id"
        params={{ id: organizationId }}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} /> Back to services
      </Link>
      {query.isPending && <LoadingCards />}
      {query.isError && (
        <LoadError
          message="Couldn’t check queue availability."
          retry={() => void query.refetch()}
        />
      )}
      {query.data && (
        <section className="surface p-7 sm:p-10">
          <span className="mb-6 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
            <Ticket />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            One step away
          </p>
          <h1 className="mt-3 text-3xl font-bold">Confirm your place</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We’ll issue a digital ticket so you can follow the queue from wherever you are.
          </p>
          <div className="my-7 space-y-4 rounded-xl bg-background p-5">
            <p className="text-sm text-muted-foreground">{query.data.name}</p>
            <h2 className="text-xl font-semibold">{service?.name ?? "Service unavailable"}</h2>
            {service && (
              <>
                <span
                  className="status-pill"
                  data-status={service.isOpen ? "completed" : "cancelled"}
                >
                  {service.isOpen ? "Queue open" : "Queue closed"}
                </span>
                <QueueSummary service={service} />
              </>
            )}
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            {service?.isOpen
              ? "Your place is confirmed after your ticket is issued. Wait times are approximate. You can cancel while waiting."
              : "This service isn’t accepting new visitors right now. Please choose another service or check back later."}
          </p>
          {join.isError && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-destructive">
              {join.error.message} Your place has not been confirmed. If the connection was
              interrupted, check My Tickets before trying again.
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={!service?.isOpen || query.isError || join.isPending || join.isSuccess}
            onClick={() => join.mutate()}
          >
            {join.isPending
              ? "Issuing your ticket…"
              : join.isSuccess
                ? "Opening your ticket…"
                : "Confirm & join queue"}
          </Button>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={16} /> No account. No personal details.
          </p>
        </section>
      )}
    </div>
  );
}

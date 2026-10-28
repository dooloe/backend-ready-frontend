import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Ticket, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingCards } from "@/components/customer-ui";
import { saveTicketToken } from "@/lib/saved-tickets";
import {
  clearPendingJoin,
  pendingJoin,
  pendingJoins,
  retainJoinForRetry,
  validatePrivateTicketUrl,
  type PendingJoin,
} from "@/lib/ticket-issuance";
import { useCustomerLocale } from "@/lib/customer-locale";

export const Route = createFileRoute("/join/$organizationId/$serviceId")({
  head: () => ({ meta: [{ title: "Confirm your place — Kezek" }] }),
  component: JoinPage,
});
function JoinPage() {
  const { t, tError, formatCount, formatNumber } = useCustomerLocale();
  const { organizationId, serviceId } = Route.useParams();
  const navigate = useNavigate();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationId],
    queryFn: () => api.getOrganization(organizationId),
    retry: false,
  });
  const servicesQuery = useQuery({
    queryKey: ["organization-services", organizationId],
    queryFn: () => api.listOrganizationServices(organizationId),
    refetchInterval: 5000,
    retry: false,
  });
  const service = servicesQuery.data?.find((s) => s.id === serviceId);
  const queue = service?.queue;
  const [pendingRequests, setPendingRequests] = useState<PendingJoin[]>([]);
  useEffect(() => setPendingRequests(pendingJoins()), []);
  const pendingElsewhere = pendingRequests.find((request) => request.queueId !== queue?.id);
  const recover = useMutation({
    mutationFn: async (request: PendingJoin) => {
      const response = await api.issueTicket(request);
      validatePrivateTicketUrl(response.ticketUrl, request.accessToken);
      return { request, response };
    },
    onSuccess: ({ request }) => {
      saveTicketToken(request.accessToken);
      clearPendingJoin(request.queueId);
      setPendingRequests(pendingJoins());
      void navigate({ to: "/ticket/$id", params: { id: request.accessToken } });
    },
    onError: (error, request) => {
      if (!retainJoinForRetry(error)) clearPendingJoin(request.queueId);
      setPendingRequests(pendingJoins());
    },
  });
  const join = useMutation({
    mutationFn: async () => {
      if (!queue?.isOpen) throw new Error("This queue is not accepting visitors right now.");
      const proofs = pendingJoin(queue.id);
      const response = await api.issueTicket({
        queueId: queue.id,
        accessToken: proofs.accessToken,
        idempotencyKey: proofs.idempotencyKey,
      });
      validatePrivateTicketUrl(response.ticketUrl, proofs.accessToken);
      return { proofs, response, queueId: queue.id };
    },
    onSuccess: ({ proofs, queueId }) => {
      saveTicketToken(proofs.accessToken);
      clearPendingJoin(queueId);
      setPendingRequests(pendingJoins());
      void navigate({ to: "/ticket/$id", params: { id: proofs.accessToken } });
    },
    onError: (error) => {
      if (!retainJoinForRetry(error) && queue) clearPendingJoin(queue.id);
      setPendingRequests(pendingJoins());
      void servicesQuery.refetch();
    },
  });
  const loading = organizationQuery.isPending || servicesQuery.isPending;
  const error = organizationQuery.error ?? servicesQuery.error;
  return (
    <div className="mx-auto max-w-xl">
      <Link
        to="/organizations/$id"
        params={{ id: organizationId }}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} /> {t("Back to services")}
      </Link>
      {loading && <LoadingCards />}
      {error && (
        <LoadError
          message={t("Couldn’t check queue availability.")}
          retry={() => {
            void organizationQuery.refetch();
            void servicesQuery.refetch();
          }}
        />
      )}
      {organizationQuery.data && !error && (
        <section className="surface p-7 sm:p-10">
          <span className="mb-6 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
            <Ticket />
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {t("One step away")}
          </p>
          <h1 className="mt-3 text-3xl font-bold">{t("Confirm your place")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t(
              "Confirm once to receive a private digital ticket. If your connection drops, retrying will recover the same place instead of creating a duplicate.",
            )}
          </p>
          <div className="my-7 space-y-4 rounded-xl bg-background p-5">
            <p className="text-sm text-muted-foreground">{organizationQuery.data.name}</p>
            <h2 className="text-xl font-semibold">{service?.name ?? t("Service unavailable")}</h2>
            {service && queue && (
              <>
                <span
                  className="status-pill"
                  data-status={queue.isOpen ? "completed" : "cancelled"}
                >
                  {t(queue.isOpen ? "Queue open" : "Queue closed")}
                </span>
                <p className="text-sm text-muted-foreground">
                  {formatCount(queue.waiting, "person")} {t("waiting")} ·{" "}
                  {queue.estimatedWaitMinutes === null
                    ? t("wait estimate unavailable")
                    : t("about {minutes} min wait", {
                        minutes: formatNumber(queue.estimatedWaitMinutes),
                      })}
                </p>
              </>
            )}
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            {queue?.isOpen
              ? t(
                  "Your place is confirmed when the ticket appears. Wait times are approximate. You can cancel while waiting.",
                )
              : t(
                  "This service isn’t accepting new visitors right now. Please choose another service or check back later.",
                )}
          </p>
          {join.isError && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-destructive">
              {tError(
                join.error.message,
                "The ticket request could not be completed. Review queue availability and retry.",
              )}{" "}
              {retainJoinForRetry(join.error)
                ? t(
                    "If the connection was interrupted, retry here to recover the original ticket safely.",
                  )
                : t(
                    "Queue availability has been refreshed. Review the status before trying again.",
                  )}
            </p>
          )}
          {pendingElsewhere && (
            <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-950">
                {t(
                  "A request for another queue may still have created a ticket. Recover it before starting a new queue.",
                )}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={recover.isPending}
                onClick={() => recover.mutate(pendingElsewhere)}
              >
                {recover.isPending ? t("Checking previous request…") : t("Recover previous ticket")}
              </Button>
              {recover.isError && (
                <p className="mt-3 text-sm text-destructive">
                  {tError(
                    recover.error.message,
                    "The previous ticket could not be recovered. Please retry safely.",
                  )}{" "}
                  {t("You can retry this recovery safely.")}
                </p>
              )}
            </div>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={
              !queue?.isOpen ||
              loading ||
              !!error ||
              !!pendingElsewhere ||
              join.isPending ||
              join.isSuccess
            }
            onClick={() => join.mutate()}
          >
            {join.isPending
              ? t("Issuing your ticket…")
              : join.isSuccess
                ? t("Opening your ticket…")
                : !queue?.isOpen
                  ? t("Queue closed")
                  : join.isError
                    ? t("Retry ticket request")
                    : t("Confirm & join queue")}
          </Button>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={16} /> {t("No account. No personal details.")}
          </p>
        </section>
      )}
    </div>
  );
}

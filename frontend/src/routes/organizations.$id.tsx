import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery, type Query } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Clock3 } from "lucide-react";
import { api, type IssuedTicket } from "@/lib/api";
import { LoadError, LoadingCards, OrgLocation, QueueSummary } from "@/components/customer-ui";
import { useCustomerLocale } from "@/lib/customer-locale";
import { isDemoOrganization } from "@/lib/organizations";
import { savedTicketTokens } from "@/lib/saved-tickets";
import { ticketRefetchInterval } from "@/lib/ticket-polling";

export const Route = createFileRoute("/organizations/$id")({
  head: () => ({ meta: [{ title: "Organization services — Kezek" }] }),
  component: OrganizationPage,
});
function OrganizationPage() {
  const { t, formatOperatingHours } = useCustomerLocale();
  const { id } = Route.useParams();
  const [ticketTokens, setTicketTokens] = useState<string[]>([]);
  useEffect(() => setTicketTokens(savedTicketTokens()), []);
  const savedTickets = useQueries({
    queries: ticketTokens.map((token) => ({
      queryKey: ["ticket", token],
      queryFn: () => api.getPrivateTicket(token),
      retry: false,
      refetchInterval: (query: Query<IssuedTicket>) =>
        ticketRefetchInterval(query.state.data?.status),
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    })),
  });
  const query = useQuery({
    queryKey: ["organization", id],
    queryFn: () => api.getOrganization(id),
    refetchInterval: 5000,
    retry: false,
  });
  const org = query.data;
  return (
    <div>
      <Link to="/" className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft size={16} /> {t("All organizations")}
      </Link>
      {query.isPending && <LoadingCards />}
      {query.isError && (
        <LoadError
          message={t("We couldn’t load this organization. It may no longer be available.")}
          retry={() => void query.refetch()}
        />
      )}
      {org && (
        <>
          <section className="surface mb-7 p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                <Building2 size={23} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">{t(org.category)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-bold sm:text-3xl">{org.name}</h1>
                  {(org.isDemo ?? isDemoOrganization(org.name, org.description)) && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                      {t("Demo")}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <OrgLocation org={org} />
                </div>
                {org.description && !isDemoOrganization(org.name, org.description) && (
                  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{org.description}</p>
                )}
              </div>
            </div>
          </section>
          <h2 className="mb-2 text-2xl font-bold">{t("Choose a service")}</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("Check the live queue, then take your place.")}
          </p>
          {org.services.length === 0 && (
            <div className="surface p-10 text-center text-muted-foreground">
              {t("No services are available at this organization yet.")}
            </div>
          )}
          <div className="space-y-4">
            {org.services.map((service) => (
              <article
                key={service.id}
                className="surface flex flex-wrap items-start gap-4 p-5 sm:gap-6 sm:p-6"
              >
                {savedTickets.map((query, index) => {
                  const ticket = query.data;
                  if (
                    !ticket ||
                    !["waiting", "called", "serving"].includes(ticket.status) ||
                    ticket.organizationName !== org.name ||
                    ticket.serviceName !== service.name
                  )
                    return null;
                  return (
                    <Link
                      key={ticketTokens[index]}
                      to="/ticket/$id"
                      params={{ id: ticketTokens[index]! }}
                      className="basis-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-primary"
                    >
                      {t("You already have an active ticket for this service.")} {t("Open ticket")}{" "}
                      →
                    </Link>
                  );
                })}
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-primary">
                  {service.prefix}
                </div>
                <div className="min-w-0 flex-1 basis-64">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{t(service.name)}</h3>
                    <span
                      className="status-pill"
                      data-status={service.isOpen ? "completed" : "cancelled"}
                    >
                      {t(service.isOpen ? "Tickets available" : "Tickets unavailable")}
                    </span>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">{t(service.description)}</p>
                  <div className="mb-3">
                    <QueueSummary service={service} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Clock3 className="mr-1 inline" size={14} />
                    {t("Service hours")}:{" "}
                    {service.operatingHours
                      ? formatOperatingHours(service.operatingHours)
                      : t("Not provided")}
                  </p>
                </div>
                {service.isOpen ? (
                  <Link
                    to="/join/$organizationId/$serviceId"
                    params={{ organizationId: org.id, serviceId: service.id }}
                    className="inline-flex items-center gap-3 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white"
                  >
                    {t("Get a ticket")} <ArrowRight size={16} />
                  </Link>
                ) : (
                  <button
                    disabled
                    className="rounded-lg bg-muted px-5 py-3 text-sm text-muted-foreground"
                  >
                    {t("Tickets unavailable")}
                  </button>
                )}
                {!service.isOpen && (
                  <p className="basis-full text-sm text-muted-foreground sm:ml-[4.5rem]">
                    {t(
                      "Ticket issuance is unavailable right now. Check the service hours or try again later.",
                    )}
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

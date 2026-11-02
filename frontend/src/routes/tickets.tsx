import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, type Query } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Ticket } from "lucide-react";
import { api, type IssuedTicket } from "@/lib/api";
import { savedTicketLinks, type SavedTicketLink } from "@/lib/saved-tickets";
import { LoadError } from "@/components/customer-ui";
import { useCustomerLocale } from "@/lib/customer-locale";
import { isDemoOrganization } from "@/lib/organizations";
export const Route = createFileRoute("/tickets")({
  head: () => ({ meta: [{ title: "My Tickets — Kezek" }, { name: "robots", content: "noindex" }] }),
  component: MyTickets,
});
function MyTickets() {
  const { t: tr, formatDate, formatTime } = useCustomerLocale();
  const [links, setLinks] = useState<SavedTicketLink[]>([]);
  useEffect(() => {
    setLinks(savedTicketLinks());
  }, []);
  const tickets = useQueries({
    queries: links.map((ticketLink) => ({
      queryKey: ["ticket", ticketLink.value],
      queryFn: () => api.getPrivateTicket(ticketLink.value),
      retry: false,
      refetchInterval: (query: Query<IssuedTicket>) =>
        query.state.data && ["completed", "cancelled", "no_show"].includes(query.state.data.status)
          ? false
          : 5000,
    })),
  });
  const active = tickets.flatMap((query, index) =>
    query.data && ["waiting", "called", "serving"].includes(query.data.status)
      ? [
          {
            ticket: query.data,
            token: links[index]!.value,
            isStale: query.isError,
            updatedAt: query.dataUpdatedAt,
          },
        ]
      : [],
  );
  const history = tickets.flatMap((query, index) =>
    query.data && ["completed", "cancelled", "no_show"].includes(query.data.status)
      ? [
          {
            ticket: query.data,
            token: links[index]!.value,
            isStale: query.isError,
            updatedAt: query.dataUpdatedAt,
          },
        ]
      : [],
  );
  const loading = tickets.some((query) => query.isPending);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
        {tr("Your visits")}
      </p>
      <h1 className="text-3xl font-bold">{tr("My Tickets")}</h1>
      <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
        {tr(
          "Tickets saved on this browser, including available history. Keep your private ticket links to open them on another device. Anyone with a link can access that ticket.",
        )}
      </p>
      {loading && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          {tr("Loading saved ticket…")}
        </p>
      )}
      <div className="mb-4 space-y-3">
        {tickets.map(
          (query, index) =>
            query.isError &&
            !query.data &&
            links[index] && (
              <LoadError
                key={links[index]!.value}
                message={tr(
                  "A saved ticket is unavailable. Its link may have expired, or the service may be offline.",
                )}
                retry={() => void query.refetch()}
              />
            ),
        )}
      </div>
      {links.length === 0 ? (
        <div className="surface p-12 text-center">
          <Ticket className="mx-auto mb-4 text-primary" size={36} />
          <h2 className="text-xl font-semibold">{tr("Your next visit starts here")}</h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            {tr(
              "No tickets saved on this browser. Already have one? Open your private ticket link.",
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            {tr("Explore organizations")} <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="active-tickets-title">
            <h2 id="active-tickets-title" className="mb-3 text-lg font-semibold">
              {tr("Active tickets")}
            </h2>
            {active.length ? (
              <div className="space-y-3">
                {active.map(({ ticket, token, isStale, updatedAt }) => (
                  <TicketRow
                    key={token}
                    ticket={ticket}
                    token={token}
                    formatDate={formatDate}
                    isStale={isStale}
                    updatedAt={updatedAt ? formatTime(updatedAt) : null}
                  />
                ))}
              </div>
            ) : (
              <p className="surface p-4 text-sm text-muted-foreground">
                {tr("No active tickets saved on this browser.")}
              </p>
            )}
          </section>
          <section aria-labelledby="ticket-history-title">
            <h2 id="ticket-history-title" className="mb-3 text-lg font-semibold">
              {tr("Ticket history")}
            </h2>
            {history.length ? (
              <div className="space-y-3">
                {history.map(({ ticket, token, isStale, updatedAt }) => (
                  <TicketRow
                    key={token}
                    ticket={ticket}
                    token={token}
                    formatDate={formatDate}
                    isStale={isStale}
                    updatedAt={updatedAt ? formatTime(updatedAt) : null}
                  />
                ))}
              </div>
            ) : (
              <p className="surface p-4 text-sm text-muted-foreground">
                {tr("Completed, cancelled, and missed tickets appear here.")}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function TicketRow({
  ticket: t,
  token,
  formatDate,
  isStale,
  updatedAt,
}: {
  ticket: IssuedTicket;
  token: string;
  formatDate: (value: string | number | Date) => string;
  isStale: boolean;
  updatedAt: string | null;
}) {
  const { t: tr } = useCustomerLocale();
  return (
    <Link
      to="/ticket/$id"
      params={{ id: token }}
      className="surface flex flex-wrap items-center gap-4 p-4 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-5 sm:p-5"
    >
      <span className="ticket-code text-2xl">{t.ticketNumber}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold">
          {t.organizationName}{" "}
          {(t.organizationIsDemo ?? isDemoOrganization(t.organizationName)) && (
            <span className="ml-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
              {tr("Demo")}
            </span>
          )}
        </p>
        <p className="text-sm">{tr(t.serviceName)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDate(t.createdAt)}</p>
        {isStale && (
          <p className="mt-1 text-xs text-amber-800">
            {tr("Status may be out of date. Last checked {time}.", {
              time: updatedAt ?? tr("not yet"),
            })}
          </p>
        )}
      </div>
      <span className="status-pill" data-status={t.status}>
        {tr(t.status.replace("_", " "))}
      </span>
      <span className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">
        {tr("Open ticket")}
        <ArrowRight size={17} />
      </span>
    </Link>
  );
}

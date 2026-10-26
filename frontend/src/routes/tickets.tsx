import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { savedTicketIds } from "@/lib/saved-tickets";
import { ticketRefetchInterval } from "@/lib/ticket-polling";
import { LoadError } from "@/components/customer-ui";
export const Route = createFileRoute("/tickets")({
  head: () => ({ meta: [{ title: "My Tickets — Kezek" }, { name: "robots", content: "noindex" }] }),
  component: MyTickets,
});
function MyTickets() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(savedTicketIds());
  }, []);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
        Your visits
      </p>
      <h1 className="text-3xl font-bold">My Tickets</h1>
      <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
        Tickets saved on this browser, including available history. Keep your private ticket links
        to open them on another device. Anyone with a link can access that ticket.
      </p>
      {ids.length === 0 ? (
        <div className="surface p-12 text-center">
          <Ticket className="mx-auto mb-4 text-primary" size={36} />
          <h2 className="text-xl font-semibold">Your next visit starts here</h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            No tickets saved on this browser. Already have one? Open your private ticket link.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
          >
            Explore organizations <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {ids.map((id) => (
            <SavedTicket key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  );
}
function SavedTicket({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.getTicket(id),
    retry: false,
    refetchInterval: (q) => ticketRefetchInterval(q.state.data?.status),
  });
  if (query.isError)
    return (
      <LoadError
        message="A saved ticket is unavailable. Its link may have expired, or the service may be offline."
        retry={() => void query.refetch()}
      />
    );
  if (!query.data)
    return (
      <div role="status" className="surface p-6 text-sm text-muted-foreground">
        Loading saved ticket…
      </div>
    );
  const t = query.data;
  return (
    <Link
      to="/ticket/$id"
      params={{ id }}
      className="surface flex flex-wrap items-center gap-5 p-6 hover:border-primary"
    >
      <span className="ticket-code text-3xl">{t.code}</span>
      <div className="flex-1">
        <p className="font-semibold">{t.serviceName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(t.createdAt).toLocaleDateString()}
        </p>
      </div>
      <span className="status-pill" data-status={t.status}>
        {t.status.replace("_", " ")}
      </span>
      <ArrowRight size={17} className="text-primary" />
    </Link>
  );
}

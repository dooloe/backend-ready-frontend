import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Clock3 } from "lucide-react";
import { api } from "@/lib/api";
import { LoadError, LoadingCards, OrgLocation, QueueSummary } from "@/components/customer-ui";

export const Route = createFileRoute("/organizations/$id")({
  head: () => ({ meta: [{ title: "Organization services — Kezek" }] }),
  component: OrganizationPage,
});
function OrganizationPage() {
  const { id } = Route.useParams();
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
        <ArrowLeft size={16} /> All organizations
      </Link>
      {query.isPending && <LoadingCards />}
      {query.isError && (
        <LoadError
          message="We couldn’t load this organization. It may no longer be available."
          retry={() => void query.refetch()}
        />
      )}
      {org && (
        <>
          <section className="surface mb-9 p-6 sm:p-9">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-primary">
              <Building2 size={28} />
            </div>
            <p className="text-sm font-medium text-primary">{org.category}</p>
            <h1 className="mb-4 mt-2 text-3xl font-bold sm:text-4xl">{org.name}</h1>
            <OrgLocation org={org} />
            <p className="mt-5 max-w-2xl text-muted-foreground">{org.description}</p>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 size={16} /> Service hours listed below · {org.timezone}
            </p>
          </section>
          <h2 className="mb-2 text-2xl font-bold">Choose a service</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Check the live queue, then take your place.
          </p>
          {org.services.length === 0 && (
            <div className="surface p-10 text-center text-muted-foreground">
              No services are available at this organization yet.
            </div>
          )}
          <div className="space-y-4">
            {org.services.map((service) => (
              <article key={service.id} className="surface flex flex-wrap items-center gap-6 p-6">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-primary">
                  {service.prefix}
                </div>
                <div className="min-w-0 flex-1 basis-64">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{service.name}</h3>
                    <span
                      className="status-pill"
                      data-status={service.isOpen ? "completed" : "cancelled"}
                    >
                      {service.isOpen ? "Open" : "Closed"}
                    </span>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">{service.description}</p>
                  <QueueSummary service={service} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Hours: {service.operatingHours ?? "Not provided — check queue availability"}
                  </p>
                </div>
                {service.isOpen ? (
                  <Link
                    to="/join/$organizationId/$serviceId"
                    params={{ organizationId: org.id, serviceId: service.id }}
                    className="inline-flex items-center gap-3 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white"
                  >
                    Join Queue <ArrowRight size={16} />
                  </Link>
                ) : (
                  <button
                    disabled
                    className="rounded-lg bg-muted px-5 py-3 text-sm text-muted-foreground"
                  >
                    Queue closed
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

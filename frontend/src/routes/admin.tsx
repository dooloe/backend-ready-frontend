import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { api, type Role } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ConfirmAction } from "@/components/confirm-action";
import { LoadError, LoadingCards } from "@/components/customer-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Kezek" },
      {
        name: "description",
        content: "Configure services, counters, staff, and view queue analytics.",
      },
      { property: "og:title", content: "Admin — Kezek" },
      {
        property: "og:description",
        content: "Configure services, counters, staff, and view queue analytics.",
      },
    ],
  }),
  component: AdminPage,
});

function useAct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      toast.success("Changes saved");
      return qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });
}

function AdminPage() {
  const session = useSession();
  if (session?.user.role !== "admin")
    return (
      <p className="text-muted-foreground">
        Admins only.{" "}
        <Link to="/login" className="text-primary underline">
          Sign in
        </Link>{" "}
        as an admin.
      </p>
    );
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Administration</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage services, queue availability, and counters. Monitor today’s operations.
      </p>
      <Tabs defaultValue="organizations">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="stats">Analytics</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="counters">Counters</TabsTrigger>
          <TabsTrigger value="staff">Staff settings</TabsTrigger>
        </TabsList>
        <TabsContent value="organizations">
          <OrganizationsTab />
        </TabsContent>
        <TabsContent value="stats">
          <StatsTab />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="counters">
          <CountersTab />
        </TabsContent>
        <TabsContent value="staff">
          <StaffTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const card = "surface p-5 sm:p-6 overflow-x-auto";

export function OrganizationsTab() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
    refetchInterval: 15000,
  });

  if (isPending) return <LoadingCards />;
  if (error) {
    return (
      <LoadError
        message="Couldn’t load organizations. Check the backend connection and retry."
        retry={() => void refetch()}
      />
    );
  }
  if (!data?.length) {
    return (
      <p className={`${card} mt-4 text-center text-muted-foreground`}>
        No organizations are available yet.
      </p>
    );
  }

  return (
    <section aria-label="All organizations" className="mt-4">
      <p className="mb-4 text-sm text-muted-foreground">
        {data.length} participating organization{data.length === 1 ? "" : "s"} across Kezek
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((organization) => {
          const openServices = organization.services.filter((service) => service.isOpen);
          const waiting = organization.services.reduce(
            (total, service) => total + service.waitingCount,
            0,
          );
          return (
            <article key={organization.id} className="surface flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-primary">
                  <Building2 size={22} />
                </span>
                <span
                  className="status-pill"
                  data-status={openServices.length ? "completed" : "cancelled"}
                >
                  {openServices.length ? `${openServices.length} queues open` : "Queues closed"}
                </span>
              </div>
              <p className="text-xs font-medium text-primary">{organization.category}</p>
              <h2 className="mt-1 text-lg font-semibold">{organization.name}</h2>
              {organization.location && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin size={15} /> {organization.location}
                </p>
              )}
              <p className="mt-4 text-sm text-muted-foreground">
                {organization.services.length} service
                {organization.services.length === 1 ? "" : "s"} · {waiting} waiting
              </p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                {organization.services.slice(0, 3).map((service) => (
                  <li key={service.id} className="flex justify-between gap-3">
                    <span className="truncate">{service.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {service.isOpen ? `${service.waitingCount} waiting` : "Closed"}
                    </span>
                  </li>
                ))}
                {organization.services.length > 3 && (
                  <li className="text-xs text-muted-foreground">
                    +{organization.services.length - 3} more services
                  </li>
                )}
              </ul>
              <a
                href={`/organizations/${encodeURIComponent(organization.id)}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                View organization <ArrowRight size={16} />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function StatsTab() {
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["analytics", applied.from, applied.to],
    queryFn: () => api.getAnalytics(applied.from || undefined, applied.to || undefined),
    refetchInterval: 15000,
  });
  const meanText = (minutes: number | null) =>
    minutes === null ? "Unavailable" : minutes.toFixed(1) + " min";
  const max = Math.max(1, ...(data?.byDay.map((day) => day.issued) ?? []));

  return (
    <div className="mt-4 space-y-6">
      <form
        className="surface flex flex-col gap-4 overflow-x-auto p-5 sm:flex-row sm:items-end sm:p-6"
        aria-label="Analytics date range"
        onSubmit={(event) => {
          event.preventDefault();
          if (!!draft.from !== !!draft.to) {
            setValidationError("Choose both a start date and an end date.");
            return;
          }
          if (draft.from && draft.from > draft.to) {
            setValidationError("The start date must be on or before the end date.");
            return;
          }
          setValidationError(null);
          setApplied(draft);
        }}
      >
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            From
            <Input
              type="date"
              aria-label="Analytics start date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            To
            <Input
              type="date"
              aria-label="Analytics end date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
        </div>
        <Button type="submit">Apply dates</Button>
        {applied.from && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft({ from: "", to: "" });
              setApplied({ from: "", to: "" });
              setValidationError(null);
            }}
          >
            Today
          </Button>
        )}
        {validationError && (
          <p role="alert" className="text-sm text-destructive sm:basis-full">
            {validationError}
          </p>
        )}
      </form>

      {isPending && <LoadingCards />}
      {error && (
        <LoadError
          message="Couldn’t load operational analytics. Your selected dates are unchanged."
          retry={() => void refetch()}
        />
      )}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            {data.dateFrom === data.dateTo
              ? "Showing " + data.dateFrom
              : "Showing " + data.dateFrom + " – " + data.dateTo}
            {" · "}
            Organization time: {data.timezone}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Tickets issued", data.issued.toLocaleString()],
              ["Waiting", data.waiting.toLocaleString()],
              ["Completed", data.completed.toLocaleString()],
              ["Mean wait", meanText(data.meanWaitMinutes)],
              ["Mean service time", meanText(data.meanServiceMinutes)],
            ].map(([label, value]) => (
              <div key={label} className={card}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 font-display text-3xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          {data.issued === 0 && (
            <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              No tickets were issued during this date range.
            </p>
          )}
          <section className={card} aria-labelledby="tickets-by-day-heading">
            <h3 id="tickets-by-day-heading" className="font-semibold">
              Tickets by day
            </h3>
            <div
              role="img"
              aria-label={"Daily ticket counts, maximum " + max + " tickets"}
              className="mt-4 flex min-h-36 items-end gap-1 overflow-x-auto"
            >
              {data.byDay.map((day) => (
                <div key={day.date} className="flex min-w-8 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{day.issued}</span>
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{
                      height: (day.issued === 0 ? 0 : Math.max(4, (day.issued / max) * 88)) + "px",
                    }}
                    title={
                      day.date + ": " + day.issued + " issued, " + day.completed + " completed"
                    }
                  />
                  <time dateTime={day.date} className="text-[10px] text-muted-foreground">
                    {day.date.slice(5)}
                  </time>
                </div>
              ))}
            </div>
          </section>
          <section className={card + " p-0"} aria-label="Analytics by service">
            <div className="overflow-x-auto p-5 sm:p-6">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="mb-3 text-left font-semibold">Service performance</caption>
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-4">
                      Service
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Issued
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Waiting
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Completed
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Mean wait
                    </th>
                    <th scope="col" className="py-2">
                      Mean service
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.byService.map((service) => (
                    <tr key={service.serviceId}>
                      <th scope="row" className="py-3 pr-4 text-left font-medium">
                        {service.serviceName}
                      </th>
                      <td className="py-3 pr-4">{service.issued}</td>
                      <td className="py-3 pr-4">{service.waiting}</td>
                      <td className="py-3 pr-4">{service.completed}</td>
                      <td className="py-3 pr-4">{meanText(service.meanWaitMinutes)}</td>
                      <td className="py-3">{meanText(service.meanServiceMinutes)}</td>
                    </tr>
                  ))}
                  {data.byService.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No service data for this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function ServicesTab() {
  const servicesQuery = useQuery({
    queryKey: ["admin-services"],
    queryFn: api.listAdminServices,
  });
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
  });
  const serviceIds = new Set((servicesQuery.data ?? []).map((service) => service.id));
  const serviceOrganizations = (organizationsQuery.data ?? []).filter((organization) =>
    organization.services.some((service) => serviceIds.has(service.id)),
  );
  const queueQueries = useQueries({
    queries: serviceOrganizations.map((organization) => ({
      queryKey: ["admin-organization-services", organization.id],
      queryFn: () => api.listOrganizationServices(organization.id),
      enabled: !!servicesQuery.data,
    })),
  });
  const queueByService = new Map(
    queueQueries.flatMap((query) =>
      (query.data ?? []).map((summary) => [summary.id, summary] as const),
    ),
  );
  const act = useAct();
  const [f, setF] = useState({
    name: "",
    description: "",
    prefix: "",
    avgServiceMinutes: 5,
    isActive: true,
    isOpen: true,
    opensAt: "",
    closesAt: "",
  });
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const loadError = servicesQuery.error ?? organizationsQuery.error;
  const loading = servicesQuery.isPending || organizationsQuery.isPending;

  return (
    <div className="mt-4 space-y-4">
      <form
        className={card + " space-y-4"}
        aria-label="Add service"
        onSubmit={(event) => {
          event.preventDefault();
          if (!!f.opensAt !== !!f.closesAt) {
            setScheduleError("Set both opening and closing times, or leave both blank.");
            return;
          }
          setScheduleError(null);
          act.mutate(
            () =>
              api.createService({
                ...f,
                prefix: f.prefix.trim().toUpperCase(),
                opensAt: f.opensAt || null,
                closesAt: f.closesAt || null,
              }),
            {
              onSuccess: () =>
                setF({
                  name: "",
                  description: "",
                  prefix: "",
                  avgServiceMinutes: 5,
                  isActive: true,
                  isOpen: true,
                  opensAt: "",
                  closesAt: "",
                }),
            },
          );
        }}
      >
        <h3 className="font-semibold">Add a service</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">
            Service name
            <Input
              aria-label="Name"
              placeholder="Name"
              required
              value={f.name}
              onChange={(event) => setF({ ...f, name: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Description
            <Input
              aria-label="Description"
              placeholder="Description"
              value={f.description}
              onChange={(event) => setF({ ...f, description: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Ticket prefix
            <Input
              aria-label="Prefix"
              placeholder="Prefix"
              required
              maxLength={2}
              pattern="[A-Za-z0-9]{1,2}"
              value={f.prefix}
              onChange={(event) => setF({ ...f, prefix: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Average service duration (minutes)
            <Input
              type="number"
              min={1}
              step="1"
              required
              aria-label="Average service duration in minutes"
              value={f.avgServiceMinutes}
              onChange={(event) => setF({ ...f, avgServiceMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Opens at
            <Input
              type="time"
              aria-label="Opening time"
              value={f.opensAt}
              onChange={(event) => setF({ ...f, opensAt: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Closes at
            <Input
              type="time"
              aria-label="Closing time"
              value={f.closesAt}
              onChange={(event) => setF({ ...f, closesAt: event.target.value })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.isActive}
              onChange={(event) => setF({ ...f, isActive: event.target.checked })}
            />
            Service active
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.isOpen}
              onChange={(event) => setF({ ...f, isOpen: event.target.checked })}
            />
            Accepting queue visits
          </label>
        </div>
        {scheduleError && (
          <p role="alert" className="text-sm text-destructive">
            {scheduleError}
          </p>
        )}
        {act.isError && (
          <p role="alert" className="text-sm text-destructive">
            {act.error.message}
          </p>
        )}
        <Button disabled={act.isPending}>Add service</Button>
      </form>
      {loading && <LoadingCards />}
      {loadError && (
        <LoadError
          message="Couldn’t load services or their organization details."
          retry={() => {
            void servicesQuery.refetch();
            void organizationsQuery.refetch();
          }}
        />
      )}
      {queueQueries.some((query) => query.isError) && (
        <LoadError
          message="Couldn’t load today’s queue status. Queue controls are unavailable until it can be refreshed."
          retry={() => queueQueries.forEach((query) => void query.refetch())}
        />
      )}
      {servicesQuery.data?.length === 0 && (
        <p className="surface p-6 text-muted-foreground">
          No services configured. Add your first service above.
        </p>
      )}
      {servicesQuery.data?.map((service) => {
        const organization = organizationsQuery.data?.find((item) =>
          item.services.some((publicService) => publicService.id === service.id),
        );
        const summary = queueByService.get(service.id);
        return (
          <AdminServiceCard
            key={service.id}
            service={service}
            queue={summary?.queue ?? null}
            timezone={summary?.timezone ?? organization?.timezone ?? null}
            queueLoading={queueQueries.some((query) => query.isPending)}
            onSave={(input) => api.updateService(service.id, input)}
            onDelete={() => api.deleteService(service.id)}
            onQueueChange={(isOpen) =>
              summary?.queue
                ? api.setQueueOverride(summary.queue.id, isOpen)
                : Promise.reject(new Error("Today’s queue is unavailable."))
            }
          />
        );
      })}
    </div>
  );
}

type ServiceForm = {
  name: string;
  description: string;
  prefix: string;
  avgServiceMinutes: number;
  isActive: boolean;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
};

function AdminServiceCard({
  service,
  queue,
  timezone,
  queueLoading,
  onSave,
  onDelete,
  onQueueChange,
}: {
  service: import("@/lib/api").Service;
  queue: import("@/lib/api").QueueSummary | null;
  timezone: string | null;
  queueLoading: boolean;
  onSave: (input: Partial<Omit<import("@/lib/api").Service, "id">>) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onQueueChange: (isOpen: boolean) => Promise<unknown>;
}) {
  const act = useAct();
  const queueAction = useAct();
  const [form, setForm] = useState<ServiceForm>(() => ({
    name: service.name,
    description: service.description,
    prefix: service.prefix,
    avgServiceMinutes: service.avgServiceMinutes,
    isActive: service.isActive !== false,
    isOpen: service.isOpen,
    opensAt: service.opensAt ?? "",
    closesAt: service.closesAt ?? "",
  }));
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  return (
    <form
      className={card + " space-y-4"}
      aria-label={"Edit " + service.name}
      onSubmit={(event) => {
        event.preventDefault();
        if (!!form.opensAt !== !!form.closesAt) {
          setScheduleError("Set both opening and closing times, or leave both blank.");
          return;
        }
        setScheduleError(null);
        act.mutate(() =>
          onSave({
            ...form,
            prefix: form.prefix.trim().toUpperCase(),
            opensAt: form.opensAt || null,
            closesAt: form.closesAt || null,
          }),
        );
      }}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="ticket-code text-2xl">{service.prefix}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{service.name}</h3>
          <p className="text-sm text-muted-foreground">
            {queue?.waiting ?? 0} waiting ·{" "}
            {queue?.estimatedWaitMinutes == null
              ? "Wait estimate unavailable"
              : "~" + queue.estimatedWaitMinutes + " min"}
          </p>
          {timezone && <p className="text-xs text-muted-foreground">Hours shown in {timezone}</p>}
        </div>
        <span className="status-pill" data-status={queue?.isOpen ? "completed" : "cancelled"}>
          {queue
            ? queue.isOpen
              ? "Queue open"
              : "Queue closed"
            : queueLoading
              ? "Loading queue…"
              : "Queue unavailable"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">
          Service name
          <Input
            required
            aria-label={"Name for " + service.name}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">
          Description
          <Input
            aria-label={"Description for " + service.name}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Ticket prefix
          <Input
            required
            maxLength={2}
            pattern="[A-Za-z0-9]{1,2}"
            aria-label={"Prefix for " + service.name}
            value={form.prefix}
            onChange={(event) => setForm({ ...form, prefix: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Average service duration (minutes)
          <Input
            type="number"
            min={1}
            step="1"
            required
            aria-label={"Duration for " + service.name}
            value={form.avgServiceMinutes}
            onChange={(event) =>
              setForm({ ...form, avgServiceMinutes: Number(event.target.value) })
            }
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Opens at
          <Input
            type="time"
            aria-label={"Opens at for " + service.name}
            value={form.opensAt}
            onChange={(event) => setForm({ ...form, opensAt: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Closes at
          <Input
            type="time"
            aria-label={"Closes at for " + service.name}
            value={form.closesAt}
            onChange={(event) => setForm({ ...form, closesAt: event.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
          Service active
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isOpen}
            onChange={(event) => setForm({ ...form, isOpen: event.target.checked })}
          />
          Accepting queue visits
        </label>
      </div>
      {scheduleError && (
        <p role="alert" className="text-sm text-destructive">
          {scheduleError}
        </p>
      )}
      {act.isError && (
        <p role="alert" className="text-sm text-destructive">
          {act.error.message}
        </p>
      )}
      {queueAction.isError && (
        <p role="alert" className="text-sm text-destructive">
          {queueAction.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={act.isPending}>Save service</Button>
        <ConfirmAction
          title="Delete this service?"
          description="This service will be removed from the customer directory. Existing ticket history is preserved."
          onConfirm={() => act.mutate(onDelete)}
          disabled={act.isPending}
        >
          <Button type="button" variant="ghost" disabled={act.isPending}>
            Delete
          </Button>
        </ConfirmAction>
        <Button
          type="button"
          variant="outline"
          disabled={
            queueAction.isPending ||
            !queue ||
            (!queue.isOpen && (!service.isActive || !service.isOpen))
          }
          onClick={() => queueAction.mutate(() => onQueueChange(!queue?.isOpen))}
        >
          {queueAction.isPending ? "Saving queue…" : queue?.isOpen ? "Close queue" : "Open queue"}
        </Button>
      </div>
    </form>
  );
}

export function CountersTab() {
  const countersQuery = useQuery({ queryKey: ["counters"], queryFn: api.listCounters });
  const counters = countersQuery.data;
  const { data: services } = useQuery({
    queryKey: ["admin-services"],
    queryFn: api.listAdminServices,
  });
  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const act = useAct();
  const [name, setName] = useState("");
  const [counterNames, setCounterNames] = useState<Record<string, string>>({});
  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} flex flex-wrap gap-2`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(
            () => api.createCounter({ name, serviceIds: [], isActive: true, staffId: null }),
            { onSuccess: () => setName("") },
          );
        }}
      >
        <Input
          required
          aria-label="Counter name"
          placeholder="Counter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button disabled={act.isPending}>Add counter</Button>
      </form>
      {countersQuery.isPending && <LoadingCards />}
      {countersQuery.isError && (
        <LoadError message="Couldn’t load counters." retry={() => void countersQuery.refetch()} />
      )}
      {counters?.length === 0 && (
        <p className="surface p-6 text-muted-foreground">
          No counters configured. Add a service counter above.
        </p>
      )}
      {counters?.map((c) => (
        <div key={c.id} className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="min-w-48 flex-1"
              required
              aria-label={`Counter name for ${c.name}`}
              value={counterNames[c.id] ?? c.name}
              onChange={(event) =>
                setCounterNames((current) => ({ ...current, [c.id]: event.target.value }))
              }
            />
            <Button
              variant="outline"
              disabled={act.isPending || !(counterNames[c.id] ?? c.name).trim()}
              onClick={() =>
                act.mutate(() => api.updateCounter(c.id, { name: counterNames[c.id] ?? c.name }), {
                  onSuccess: () =>
                    setCounterNames((current) => {
                      const next = { ...current };
                      delete next[c.id];
                      return next;
                    }),
                })
              }
            >
              Save name
            </Button>
            <select
              aria-label="Assigned staff member"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={c.staffId ?? ""}
              onChange={(e) => {
                const staffId = e.target.value || null;
                act.mutate(() => api.updateCounter(c.id, { staffId }));
              }}
            >
              <option value="">Any staff</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              disabled={act.isPending}
              variant="outline"
              onClick={() => act.mutate(() => api.updateCounter(c.id, { isActive: !c.isActive }))}
            >
              {c.isActive ? "Deactivate" : "Activate"}
            </Button>
            <ConfirmAction
              title="Delete this counter?"
              description="This counter will be removed from service configuration. Existing ticket history is preserved."
              onConfirm={() => act.mutate(() => api.deleteCounter(c.id))}
              disabled={act.isPending}
            >
              <Button variant="ghost" disabled={act.isPending}>
                Delete
              </Button>
            </ConfirmAction>
          </div>
          <div className="flex flex-wrap gap-2">
            {services?.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={c.serviceIds.includes(s.id) ? "default" : "outline"}
                onClick={() =>
                  act.mutate(() =>
                    api.updateCounter(c.id, { serviceIds: toggle(c.serviceIds, s.id) }),
                  )
                }
              >
                {s.prefix} · {s.name}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaffTab() {
  const {
    data,
    isPending: loading,
    error,
    refetch,
  } = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const act = useAct();
  const [f, setF] = useState({ name: "", username: "", password: "", role: "staff" as Role });
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} grid gap-2 md:grid-cols-5`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(() => api.createStaff(f), {
            onSuccess: () => setF({ name: "", username: "", password: "", role: "staff" }),
          });
        }}
      >
        <Input
          required
          aria-label="Full name"
          placeholder="Full name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          required
          aria-label="Username"
          placeholder="Username"
          value={f.username}
          onChange={(e) => setF({ ...f, username: e.target.value })}
        />
        <Input
          required
          type="password"
          aria-label="Password"
          placeholder="Password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <select
          aria-label="Staff role"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value as Role })}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <Button disabled={act.isPending}>Add staff</Button>
      </form>
      {loading && <LoadingCards />}
      {error && <LoadError message="Couldn’t load staff settings." retry={() => void refetch()} />}
      <div className={card}>
        <ul className="divide-y">
          {data?.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-3">
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-muted-foreground">@{u.username}</span>
              <span className="status-pill">{u.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function StatsTab() {
  const {
    data: s,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
    refetchInterval: 5000,
  });
  if (isPending) return <LoadingCards />;
  if (error)
    return (
      <LoadError message="Couldn’t load operational statistics." retry={() => void refetch()} />
    );
  if (!s) return null;
  const max = Math.max(1, ...s.byHour.map((h) => h.count));
  const kpis = [
    ["Tickets today", s.totalToday],
    ["Waiting now", s.waitingNow],
    ["Completed", s.completedToday],
    ["Avg wait", s.avgWaitMinutes === null ? "—" : `${s.avgWaitMinutes}m`],
  ];
  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {kpis.map(([l, v]) => (
          <div key={l} className={card}>
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="font-display text-4xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <div className={card}>
        <h3 className="font-semibold">Tickets by hour</h3>
        <div className="mt-4 flex h-32 items-end gap-1">
          {s.byHour.map((h) => (
            <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary"
                style={{ height: `${(h.count / max) * 100}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={card}>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Service</th>
              <th>Total</th>
              <th>Waiting</th>
              <th>Done</th>
              <th>No-show</th>
              <th>Cancelled</th>
              <th>Avg wait</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.byService.map((r) => (
              <tr key={r.serviceId}>
                <td className="py-2 font-medium">{r.serviceName}</td>
                <td>{r.total}</td>
                <td>{r.waiting}</td>
                <td>{r.completed}</td>
                <td>{r.noShows}</td>
                <td>{r.cancelled}</td>
                <td>{r.avgWaitMinutes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ServicesTab() {
  const {
    data,
    isPending: loading,
    error,
    refetch,
  } = useQuery({ queryKey: ["services"], queryFn: api.listServices });
  const act = useAct();
  const [f, setF] = useState({ name: "", description: "", prefix: "", avgServiceMinutes: 5 });
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} grid gap-2 md:grid-cols-[1fr_2fr_80px_100px_auto]`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(
            () => api.createService({ ...f, prefix: f.prefix.toUpperCase(), isOpen: true }),
            {
              onSuccess: () =>
                setF({ name: "", description: "", prefix: "", avgServiceMinutes: 5 }),
            },
          );
        }}
      >
        <Input
          required
          aria-label="Name"
          placeholder="Name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          aria-label="Description"
          placeholder="Description"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <Input
          required
          maxLength={2}
          aria-label="Prefix"
          placeholder="Prefix"
          value={f.prefix}
          onChange={(e) => setF({ ...f, prefix: e.target.value })}
        />
        <Input
          type="number"
          min={1}
          aria-label="Average service duration in minutes"
          title="Avg minutes"
          value={f.avgServiceMinutes}
          onChange={(e) => setF({ ...f, avgServiceMinutes: +e.target.value })}
        />
        <Button disabled={act.isPending}>Add service</Button>
      </form>
      {loading && <LoadingCards />}
      {error && <LoadError message="Couldn’t load services." retry={() => void refetch()} />}
      {data?.length === 0 && (
        <p className="surface p-6 text-muted-foreground">
          No services configured. Add your first service above.
        </p>
      )}
      {data?.map((s) => (
        <div key={s.id} className={`${card} flex flex-wrap items-center gap-4`}>
          <span className="ticket-code text-2xl">{s.prefix}</span>
          <div className="flex-1">
            <p className="font-semibold">{s.name}</p>
            <p className="text-sm text-muted-foreground">
              {s.description} · ~{s.avgServiceMinutes} min each
            </p>
          </div>
          <Button
            disabled={act.isPending}
            variant="outline"
            onClick={() => act.mutate(() => api.updateService(s.id, { isOpen: !s.isOpen }))}
          >
            {s.isOpen ? "Close queue" : "Open queue"}
          </Button>
          <ConfirmAction
            title="Delete this service?"
            description="Visitors will no longer be able to join this service. Existing ticket history is preserved."
            onConfirm={() => act.mutate(() => api.deleteService(s.id))}
            disabled={act.isPending}
          >
            <Button variant="ghost" disabled={act.isPending}>
              Delete
            </Button>
          </ConfirmAction>
        </div>
      ))}
    </div>
  );
}

function CountersTab() {
  const countersQuery = useQuery({ queryKey: ["counters"], queryFn: api.listCounters });
  const counters = countersQuery.data;
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: api.listServices });
  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const act = useAct();
  const [name, setName] = useState("");
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
            <p className="flex-1 font-semibold">{c.name}</p>
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

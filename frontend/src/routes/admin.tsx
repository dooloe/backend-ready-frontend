import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "@/lib/api";
import { useSession } from "@/lib/session";
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
    onSuccess: () => qc.invalidateQueries(),
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
      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Analytics</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="counters">Counters</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
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

const card = "rounded-2xl border bg-card p-6";

function StatsTab() {
  const { data: s } = useQuery({
    queryKey: ["stats"],
    queryFn: api.getStats,
    refetchInterval: 5000,
  });
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

function ServicesTab() {
  const { data } = useQuery({ queryKey: ["services"], queryFn: api.listServices });
  const act = useAct();
  const [f, setF] = useState({ name: "", description: "", prefix: "", avgServiceMinutes: 5 });
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} grid gap-2 md:grid-cols-[1fr_2fr_80px_100px_auto]`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(() =>
            api.createService({ ...f, prefix: f.prefix.toUpperCase(), isOpen: true }),
          );
          setF({ name: "", description: "", prefix: "", avgServiceMinutes: 5 });
        }}
      >
        <Input
          required
          placeholder="Name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          placeholder="Description"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <Input
          required
          maxLength={2}
          placeholder="Prefix"
          value={f.prefix}
          onChange={(e) => setF({ ...f, prefix: e.target.value })}
        />
        <Input
          type="number"
          min={1}
          title="Avg minutes"
          value={f.avgServiceMinutes}
          onChange={(e) => setF({ ...f, avgServiceMinutes: +e.target.value })}
        />
        <Button>Add service</Button>
      </form>
      {data?.map((s) => (
        <div key={s.id} className={`${card} flex items-center gap-4`}>
          <span className="ticket-code text-2xl">{s.prefix}</span>
          <div className="flex-1">
            <p className="font-semibold">{s.name}</p>
            <p className="text-sm text-muted-foreground">
              {s.description} · ~{s.avgServiceMinutes} min each
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => act.mutate(() => api.updateService(s.id, { isOpen: !s.isOpen }))}
          >
            {s.isOpen ? "Close queue" : "Open queue"}
          </Button>
          <Button variant="ghost" onClick={() => act.mutate(() => api.deleteService(s.id))}>
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}

function CountersTab() {
  const { data: counters } = useQuery({ queryKey: ["counters"], queryFn: api.listCounters });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: api.listServices });
  const { data: staff } = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const act = useAct();
  const [name, setName] = useState("");
  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} flex gap-2`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(() =>
            api.createCounter({ name, serviceIds: [], isActive: true, staffId: null }),
          );
          setName("");
        }}
      >
        <Input
          required
          placeholder="Counter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button>Add counter</Button>
      </form>
      {counters?.map((c) => (
        <div key={c.id} className={`${card} space-y-3`}>
          <div className="flex items-center gap-3">
            <p className="flex-1 font-semibold">{c.name}</p>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={c.staffId ?? ""}
              onChange={(e) =>
                act.mutate(() => api.updateCounter(c.id, { staffId: e.target.value || null }))
              }
            >
              <option value="">Any staff</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => act.mutate(() => api.updateCounter(c.id, { isActive: !c.isActive }))}
            >
              {c.isActive ? "Deactivate" : "Activate"}
            </Button>
            <Button variant="ghost" onClick={() => act.mutate(() => api.deleteCounter(c.id))}>
              Delete
            </Button>
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
  const { data } = useQuery({ queryKey: ["staff"], queryFn: api.listStaff });
  const act = useAct();
  const [f, setF] = useState({ name: "", username: "", password: "", role: "staff" as Role });
  return (
    <div className="mt-4 space-y-4">
      <form
        className={`${card} grid gap-2 md:grid-cols-5`}
        onSubmit={(e) => {
          e.preventDefault();
          act.mutate(() => api.createStaff(f));
          setF({ name: "", username: "", password: "", role: "staff" });
        }}
      >
        <Input
          required
          placeholder="Full name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          required
          placeholder="Username"
          value={f.username}
          onChange={(e) => setF({ ...f, username: e.target.value })}
        />
        <Input
          required
          type="password"
          placeholder="Password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value as Role })}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <Button>Add staff</Button>
      </form>
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

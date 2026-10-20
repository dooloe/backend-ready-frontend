import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Service } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kezek — Join a queue from anywhere" },
      {
        name: "description",
        content: "Pick a service, get a digital ticket, and track your place in line.",
      },
      { property: "og:title", content: "Kezek — Join a queue from anywhere" },
      {
        property: "og:description",
        content: "Pick a service, get a digital ticket, and track your place in line.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: api.listServices,
  });
  return (
    <div>
      <section className="mb-12 max-w-2xl">
        <h1 className="text-5xl font-bold leading-tight">
          Stop standing in line. <span className="text-primary">Take a ticket.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Choose a service, get your number, and we'll show you exactly where you are and how long
          it takes.
        </p>
      </section>
      {isLoading && <p className="text-muted-foreground">Loading services…</p>}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services?.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const join = useMutation({
    mutationFn: () => api.joinQueue({ serviceId: service.id, customerName: name }),
    onSuccess: (t) => navigate({ to: "/ticket/$id", params: { id: t.id } }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-6">
      <div className="flex items-start justify-between">
        <span className="ticket-code text-3xl">{service.prefix}</span>
        <span className="status-pill" data-status={service.isOpen ? "completed" : "cancelled"}>
          {service.isOpen ? "Open" : "Closed"}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-semibold">{service.name}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{service.description}</p>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate();
        }}
      >
        <Input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!service.isOpen}
          required
        />
        <Button type="submit" disabled={!service.isOpen || join.isPending}>
          Join
        </Button>
      </form>
    </div>
  );
}

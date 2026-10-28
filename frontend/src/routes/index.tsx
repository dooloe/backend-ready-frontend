import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Search,
  Ticket,
  Check,
  Clock3,
} from "lucide-react";
import { api, categories, type Organization } from "@/lib/api";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingCards, LoadError, OrgLocation } from "@/components/customer-ui";
import { useCustomerLocale } from "@/lib/customer-locale";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kezek — Skip the waiting. Keep your place." },
      {
        name: "description",
        content:
          "Discover organizations across Kazakhstan, join a virtual queue, and track your digital ticket. No account needed.",
      },
    ],
  }),
  component: Index,
});
const categoryIcons = [GraduationCap, HeartPulse, Landmark, Building2];
export function Index() {
  const { t, formatCount, formatNumber } = useCustomerLocale();
  const hydrated = useHydrated();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All organizations");
  const query = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
    retry: false,
    refetchInterval: 15000,
  });
  const orgs = query.data?.filter(
    (org) =>
      (category === "All organizations" || category === org.category) &&
      `${org.name} ${org.location ?? ""} ${org.services.map((s) => `${s.name} ${s.description}`).join(" ")}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <div>
      <section className="grid items-center gap-10 pb-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" /> {t("LESS WAITING. MORE LIVING.")}
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-6xl">
            {t("Skip the waiting.")}
            <br />
            <span className="text-primary">{t("Keep your place.")}</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(
              "Your next visit, without the line. Find an organization, join its queue, and follow your place from anywhere.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check size={15} className="text-emerald-600" /> {t("No account needed")}
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={15} className="text-emerald-600" /> {t("Live queue updates")}
            </span>
          </div>
        </div>
        <div
          className="relative hidden rounded-3xl border border-blue-100 bg-blue-50 p-8 lg:block"
          aria-hidden="true"
        >
          <div className="surface mx-auto max-w-64 p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-white">
              <Ticket size={22} />
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {t("A LITTLE LESS WAITING")}
            </p>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {t("Life goes on.")}
              <br />
              <span className="text-primary">{t("Your place stays.")}</span>
            </p>
            <div className="my-5 border-t border-dashed" />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock3 size={17} /> {t("A queue that moves with you")}
            </div>
          </div>
          <span className="absolute -bottom-3 right-4 flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-xs font-medium shadow-sm">
            <span className="size-2 rounded-full bg-emerald-500" />{" "}
            {t("You’re free to get on with your day")}
          </span>
        </div>
      </section>
      <section aria-labelledby="directory-title" className="pt-5">
        <div className="relative mb-5">
          <Search className="absolute left-4 top-4 text-muted-foreground" size={20} />
          <Input
            disabled={!hydrated}
            aria-label={t("Search organizations and services")}
            placeholder={t("Search organizations, services, or cities…")}
            className="h-14 rounded-xl bg-white pl-12 text-base shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          role="group"
          className="mb-10 flex flex-wrap gap-2"
          aria-label={t("Organization categories")}
        >
          {["All organizations", ...categories].map((c, i) => {
            const Icon = categoryIcons[i - 1];
            return (
              <Button
                key={c}
                variant={category === c ? "default" : "outline"}
                className="rounded-full px-4"
                disabled={!hydrated}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {Icon && <Icon size={16} />}
                {t(c)}
              </Button>
            );
          })}
        </div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="directory-title" className="text-2xl font-bold">
              {t("Find your next stop")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Explore organizations and choose the service you need.")}
            </p>
          </div>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {orgs ? formatCount(orgs.length, "organization") : ""}
          </p>
        </div>
        {query.isPending && <LoadingCards />}
        {query.isError && (
          <LoadError
            message={`${t("Couldn’t reach the organization service")}. ${t("Start the Kezek backend and check its API address, then retry.")}`}
            retry={() => void query.refetch()}
          />
        )}
        {orgs?.length === 0 && (
          <div className="surface py-14 text-center">
            <Building2 className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold">
              {t(
                query.data?.length ? "No matching organizations" : "No organizations available yet",
              )}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                query.data?.length ? "Try another search or category." : "Please check back soon.",
              )}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSearch("");
                setCategory("All organizations");
              }}
            >
              {t("Reset filters")}
            </Button>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {orgs?.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      </section>
      <section className="mt-16 border-t pt-10" aria-labelledby="how-it-works">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {t("A better way to wait")}
          </p>
          <h2 id="how-it-works" className="mt-2 text-2xl font-bold">
            {t("Three steps. One less line.")}
          </h2>
        </div>
        <div className="grid gap-7 sm:grid-cols-3">
          {[
            [
              "01",
              t("Find your service"),
              t("Browse participating organizations and check queue availability."),
            ],
            [
              "02",
              t("Take a digital ticket"),
              t("Confirm your place in an open queue. No signup, no paperwork."),
            ],
            [
              "03",
              t("Arrive when it’s your turn"),
              t("Keep your ticket open to follow your position and counter updates."),
            ],
          ].map(([n, title, desc]) => (
            <div key={n} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-primary">
                {n}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function OrganizationCard({ org }: { org: Organization }) {
  const { t, formatCount, formatNumber } = useCustomerLocale();
  const Icon =
    categoryIcons[categories.indexOf(org.category as (typeof categories)[number])] ?? Building2;
  const open = org.services.filter((s) => s.isOpen);
  const estimates = open.flatMap((s) =>
    s.estimatedWaitMinutes === null ? [] : [s.estimatedWaitMinutes],
  );
  return (
    <article className="surface flex flex-col p-6 transition-shadow hover:shadow-md">
      <div className="mb-5 flex items-center justify-between">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-primary">
          <Icon size={25} />
        </span>
        <span className="status-pill" data-status={open.length ? "completed" : "cancelled"}>
          {t(open.length ? "Queues open" : "Queues closed")}
        </span>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{t(org.category)}</p>
      <h3 className="mb-3 mt-1 text-lg font-bold">{org.name}</h3>
      <OrgLocation org={org} />
      <p className="mt-4 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
        {org.description}
      </p>
      <div className="my-5 flex items-center justify-between border-y py-3 text-xs text-muted-foreground">
        <span>{formatCount(org.services.length, "service")}</span>
        <span>
          {estimates.length
            ? t("From ~{minutes} min wait", { minutes: formatNumber(Math.min(...estimates)) })
            : t("Wait estimate unavailable")}
        </span>
      </div>
      <Link
        to="/organizations/$id"
        params={{ id: org.id }}
        className="flex items-center justify-between text-sm font-semibold text-primary"
      >
        {t("View Services")} <ArrowRight size={17} />
      </Link>
    </article>
  );
}

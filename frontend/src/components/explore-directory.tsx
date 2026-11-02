import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Search,
  MapPin,
} from "lucide-react";
import { api, categories, type Organization } from "@/lib/api";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingCards, LoadError, OrgLocation } from "@/components/customer-ui";
import { useCustomerLocale } from "@/lib/customer-locale";
import { isDemoOrganization } from "@/lib/organizations";

const categoryIcons = [GraduationCap, HeartPulse, Landmark, Building2];
export function Index() {
  const { t, formatCount } = useCustomerLocale();
  const hydrated = useHydrated();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All organizations");
  const [city, setCity] = useState("All cities");
  const query = useQuery({
    queryKey: ["organizations"],
    queryFn: api.listOrganizations,
    retry: false,
    refetchInterval: 15000,
  });
  const cities = [
    ...new Set(
      (query.data ?? [])
        .map((org) => org.location?.split(",")[0]?.trim())
        .filter((value): value is string => !!value),
    ),
  ].sort();
  const orgs = query.data?.filter(
    (org) =>
      (category === "All organizations" || category === org.category) &&
      (city === "All cities" || org.location?.split(",")[0]?.trim() === city) &&
      `${org.name} ${org.location ?? ""} ${org.services.map((s) => `${s.name} ${s.description}`).join(" ")}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <div>
      <section
        className="mb-8 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:p-7"
        aria-labelledby="intro-title"
      >
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            {t("A better way to wait")}
          </p>
          <h1 id="intro-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("Get your ticket online. Wait where it suits you.")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("Choose an organization and service, get a digital ticket, and follow your queue.")}
          </p>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            t("Choose an organization and service."),
            t("Get a ticket and track your position."),
            t("Arrive at the service location before you are called."),
          ].map((step, index) => (
            <li
              key={step}
              className="flex min-w-0 items-start gap-3 rounded-xl bg-white/80 p-3 text-sm leading-relaxed"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="directory-title" className="pt-5">
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("Demonstration organizations. Tickets are not valid at real institutions.")}
        </p>
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
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            className="flex flex-wrap gap-2"
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
          <label className="flex items-center gap-2 text-sm font-medium">
            <MapPin size={16} className="text-muted-foreground" />
            <span className="sr-only">{t("Filter by city")}</span>
            <select
              className="h-10 min-w-36 max-w-full rounded-lg border border-input bg-white px-3"
              value={city}
              disabled={!hydrated}
              onChange={(event) => setCity(event.target.value)}
            >
              {["All cities", ...cities].map((name) => (
                <option key={name} value={name}>
                  {name === "All cities" ? t(name) : name}
                </option>
              ))}
            </select>
          </label>
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
                query.data?.length
                  ? "Try another search, category, or city."
                  : "Please check back soon.",
              )}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSearch("");
                setCategory("All organizations");
                setCity("All cities");
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
    </div>
  );
}
function OrganizationCard({ org }: { org: Organization }) {
  const { t, formatCount, formatNumber } = useCustomerLocale();
  const Icon =
    categoryIcons[categories.indexOf(org.category as (typeof categories)[number])] ?? Building2;
  const isDemo = org.isDemo ?? isDemoOrganization(org.name, org.description);
  const availableServices = org.services.filter((service) => service.isOpen);
  return (
    <article className="surface flex min-h-56 flex-col p-5 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
          <Icon size={21} />
        </span>
        {isDemo && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            {t("Demo")}
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{t(org.category)}</p>
      <h3 className="mb-2 mt-1 break-words text-lg font-bold">{org.name}</h3>
      <OrgLocation org={org} />
      <div className="mt-auto pt-4 text-sm text-muted-foreground">
        {formatCount(availableServices.length, "service")} {t("available")}
      </div>
      <Link
        to="/organizations/$id"
        params={{ id: org.id }}
        className="mt-3 flex min-h-11 items-center justify-between border-t pt-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("View Services")} <ArrowRight size={17} />
      </Link>
    </article>
  );
}

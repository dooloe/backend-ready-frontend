import { AlertCircle, Clock3, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Organization, PublicService } from "@/lib/api";
import { useCustomerLocale } from "@/lib/customer-locale";

export function LoadingCards() {
  const { t } = useCustomerLocale();
  return (
    <div
      role="status"
      aria-label={t("Loading")}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="surface space-y-5 p-6">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useCustomerLocale();
  return (
    <div role="alert" className="surface flex flex-wrap items-center gap-4 p-6">
      <AlertCircle className="text-destructive" />
      <p className="flex-1 text-sm">{message}</p>
      <Button variant="outline" onClick={retry}>
        {t("Retry")}
      </Button>
    </div>
  );
}
export function OrgLocation({ org }: { org: Organization }) {
  const { t } = useCustomerLocale();
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin size={15} />
      {org.location ?? t("Location not provided")}
    </p>
  );
}
export function QueueSummary({ service }: { service: PublicService }) {
  const { t, formatCount, formatNumber } = useCustomerLocale();
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Users size={16} />
        {formatCount(service.waitingCount, "person")} {t("waiting")}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock3 size={16} />
        {service.estimatedWaitMinutes === null
          ? t("Wait estimate unavailable")
          : t("~{minutes} min wait", { minutes: formatNumber(service.estimatedWaitMinutes) })}
      </span>
    </div>
  );
}

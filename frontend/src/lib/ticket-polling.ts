const terminalStatuses = new Set(["completed", "cancelled", "no_show"]);

export function ticketIsPollingActive(status: string | undefined): boolean {
  return !status || !terminalStatuses.has(status);
}

export function ticketRefetchInterval(status: string | undefined): number | false {
  return ticketIsPollingActive(status) ? 5000 : false;
}

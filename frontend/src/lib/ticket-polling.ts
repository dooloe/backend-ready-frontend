const terminalStatuses = new Set(["completed", "cancelled", "no_show"]);

export function ticketRefetchInterval(status: string | undefined): number | false {
  return status && terminalStatuses.has(status) ? false : 3000;
}

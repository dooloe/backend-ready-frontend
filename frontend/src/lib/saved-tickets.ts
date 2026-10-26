// Only retain capabilities received by this browser; never enumerate backend tickets.
const KEY = "kezek-ticket-links-v1";
export function savedTicketIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(id))
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
export function saveTicket(id: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify([id, ...savedTicketIds().filter((value) => value !== id)].slice(0, 50)),
    );
  } catch {
    /* The ticket URL still works when browser storage is unavailable. */
  }
}

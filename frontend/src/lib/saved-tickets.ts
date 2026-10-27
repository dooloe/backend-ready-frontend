// Only retain capabilities received by this browser; never enumerate backend tickets.
const KEY = "kezek-private-ticket-links-v2";
const LEGACY_KEY = "kezek-ticket-links-v1";
const PRIVATE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LEGACY_CAPABILITY = /^[A-Za-z0-9_-]{8,128}$/;

export interface SavedTicketLink {
  kind: "private" | "legacy";
  value: string;
}

function storedValues(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function savedTicketLinks(): SavedTicketLink[] {
  const current = storedValues(KEY).filter((value) => PRIVATE_TOKEN.test(value));
  const legacy = storedValues(LEGACY_KEY).filter(
    (value) => LEGACY_CAPABILITY.test(value) && !PRIVATE_TOKEN.test(value),
  );
  return [
    ...current.map((value) => ({ kind: "private" as const, value })),
    ...legacy
      .filter((value) => !current.includes(value))
      .map((value) => ({ kind: "legacy" as const, value })),
  ].slice(0, 50);
}

export function savedTicketTokens(): string[] {
  return savedTicketLinks()
    .filter((link) => link.kind === "private")
    .map((link) => link.value);
}

export function saveTicketToken(id: string) {
  saveLink(KEY, id, PRIVATE_TOKEN);
}

export function saveLegacyTicketId(id: string) {
  saveLink(LEGACY_KEY, id, LEGACY_CAPABILITY);
}

function saveLink(key: string, id: string, pattern: RegExp) {
  if (!pattern.test(id)) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        [id, ...storedValues(key).filter((value) => value !== id && pattern.test(value))].slice(
          0,
          50,
        ),
      ),
    );
  } catch {
    /* The ticket URL still works when browser storage is unavailable. */
  }
}

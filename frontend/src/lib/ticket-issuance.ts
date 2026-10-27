export interface JoinProofs {
  accessToken: string;
  idempotencyKey: string;
}

export interface PendingJoin extends JoinProofs {
  queueId: string;
}

const STORAGE_KEY = "kezek-pending-joins-v1";
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function randomProof(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("Secure ticket creation is unavailable in this browser.");
  }
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function loadPending(): Record<string, JoinProofs> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, proofs]) => {
        if (!proofs || typeof proofs !== "object") return false;
        const pair = proofs as Partial<JoinProofs>;
        return (
          typeof pair.accessToken === "string" &&
          PROOF_PATTERN.test(pair.accessToken) &&
          typeof pair.idempotencyKey === "string" &&
          PROOF_PATTERN.test(pair.idempotencyKey)
        );
      }),
    ) as Record<string, JoinProofs>;
  } catch {
    return {};
  }
}

export function pendingJoins(): PendingJoin[] {
  return Object.entries(loadPending()).map(([queueId, proofs]) => ({ queueId, ...proofs }));
}

export function pendingJoin(queueId: string): JoinProofs {
  const pending = loadPending();
  const existing = pending[queueId];
  if (existing) return existing;
  const proofs = { accessToken: randomProof(), idempotencyKey: randomProof() };
  pending[queueId] = proofs;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    throw new Error(
      "This browser can’t securely save a retry. Enable session storage and try again.",
    );
  }
  return proofs;
}

export function clearPendingJoin(queueId: string): void {
  const pending = loadPending();
  delete pending[queueId];
  try {
    if (Object.keys(pending).length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // A confirmed result remains usable from its private ticket link.
  }
}

export function retainJoinForRetry(error: unknown): boolean {
  if (!(error instanceof Error) || !("status" in error)) return true;
  const status = (error as Error & { status: number }).status;
  return status === 429 || status >= 500;
}

export function validatePrivateTicketUrl(ticketUrl: string, accessToken: string): void {
  const url = new URL(ticketUrl, window.location.origin);
  if (url.origin !== window.location.origin || url.pathname !== `/ticket/${accessToken}`) {
    throw new Error(
      "Your ticket was created, but its private link needs to be recovered. Retry safely.",
    );
  }
}

import { useSyncExternalStore } from "react";
import type { StaffUser } from "./api/types";

const KEY = "kezek-session";
type Session = { token: string; user: StaffUser } | null;
const listeners = new Set<() => void>();
let cache: Session | undefined;

function read(): Session {
  if (typeof window === "undefined") return null;
  if (cache === undefined) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      cache = null;
    }
  }
  return cache ?? null;
}

export function getToken() {
  return read()?.token ?? null;
}

export function setSession(s: Session) {
  cache = s;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

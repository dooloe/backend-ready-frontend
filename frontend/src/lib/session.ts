import { useSyncExternalStore } from "react";
import type { StaffUser } from "./api/types";

export type Session = { token: string | null; user: StaffUser } | null;
export interface SessionState {
  session: Session;
  ready: boolean;
}

const LEGACY_SESSION_KEY = "kezek-session";
const emptyState: SessionState = { session: null, ready: false };
let state = emptyState;
let restorePromise: Promise<Session> | null = null;
const listeners = new Set<() => void>();

function clearLegacyToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // Storage can be unavailable in private browsing; cookie auth still works.
  }
}

function publish(session: Session, ready = true) {
  clearLegacyToken();
  state = { session, ready };
  listeners.forEach((listener) => listener());
}

export function getToken() {
  return state.session?.token ?? null;
}

export function getSession() {
  return state.session;
}

export function getSessionState() {
  return state;
}

export function setSession(session: Session) {
  publish(session);
}

/** Restore identity from the HttpOnly session cookie; never persist its token. */
export function restoreSession(
  getCurrentIdentity: () => Promise<StaffUser>,
  getCsrfToken: () => Promise<unknown>,
): Promise<Session> {
  if (state.ready) return Promise.resolve(state.session);
  if (restorePromise) return restorePromise;

  clearLegacyToken();
  state = { ...state, ready: false };
  listeners.forEach((listener) => listener());
  restorePromise = (async () => {
    try {
      const user = await getCurrentIdentity();
      await getCsrfToken();
      publish({ token: null, user });
      return state.session;
    } catch {
      publish(null);
      return null;
    } finally {
      restorePromise = null;
    }
  })();
  return restorePromise;
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => emptyState,
  );
}

export function useSession(): Session {
  return useSessionState().session;
}

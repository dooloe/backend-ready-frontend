import "@testing-library/jest-dom/vitest";
import { setSession } from "@/lib/session";

// Rendered route tests run without an HTTP backend; begin with a resolved
// anonymous browser session so the app bootstrap does not make live requests.
setSession(null);

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

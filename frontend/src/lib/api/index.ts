import { getToken } from "../session";
import { createHttpApi } from "./http";
import { mockApi, setTokenProvider } from "./mock";
import type { KezekApi } from "./types";

export * from "./types";

const baseUrl =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:8000";
setTokenProvider(getToken);

/** Real backend by default. Mock mode requires explicit development opt-in. */
export const api: KezekApi =
  import.meta.env["VITE_USE_MOCK"] === "true" ? mockApi : createHttpApi(baseUrl, getToken);
export const usingMock = import.meta.env["VITE_USE_MOCK"] === "true";

import { getToken } from "../session";
import { createHttpApi } from "./http";
import { mockApi, setTokenProvider } from "./mock";
import type { KezekApi } from "./types";

export * from "./types";

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
setTokenProvider(getToken);

/** Uses the mock until VITE_API_BASE_URL points at the FastAPI backend. */
export const api: KezekApi = baseUrl ? createHttpApi(baseUrl, getToken) : mockApi;
export const usingMock = !baseUrl;

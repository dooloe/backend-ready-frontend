// Real HTTP client for the FastAPI backend. Endpoint map = the contract to implement.
import {
  ApiError,
  type Analytics,
  type IssuedTicket,
  type KezekApi,
  type JoinResponse,
  type LoginResponse,
} from "./types";

export function createHttpApi(baseUrl: string, getToken: () => string | null): KezekApi {
  let csrfToken: string | null = null;

  function hasCsrfCookie() {
    return (
      typeof document !== "undefined" &&
      document.cookie.split(";").some((cookie) => {
        const [name] = cookie.trim().split("=", 1);
        return name === "kezek_csrf";
      })
    );
  }

  function readErrorDetails(data: unknown) {
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  }

  async function req<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    options: { signal?: AbortSignal; includeAuthorization?: boolean; csrf?: boolean } = {},
  ): Promise<T> {
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
    if (
      unsafe &&
      options.csrf !== false &&
      (csrfToken !== null || hasCsrfCookie()) &&
      !extraHeaders["X-CSRF-Token"]
    ) {
      extraHeaders = { ...extraHeaders, "X-CSRF-Token": await fetchCsrfToken() };
    }
    const token = getToken();
    const res = await fetch(baseUrl.replace(/\/+$/, "") + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token && options.includeAuthorization !== false
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...extraHeaders,
      },
      body: body === undefined ? null : JSON.stringify(body),
      credentials: "include",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok) {
      const data = readErrorDetails(await res.json().catch(() => ({})));
      if (res.status === 401 || res.status === 403) csrfToken = null;
      throw new ApiError(
        res.status,
        typeof data["message"] === "string"
          ? data["message"]
          : typeof data["detail"] === "string"
            ? data["detail"]
            : "Please check your input and try again.",
        typeof data["code"] === "string" ? data["code"] : null,
        data["details"] ?? null,
      );
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }

  async function fetchCsrfToken() {
    if (csrfToken) return csrfToken;
    const response = await req<{ csrfToken: string }>(
      "GET",
      "/api/auth/csrf",
      undefined,
      {},
      { includeAuthorization: false },
    );
    csrfToken = response.csrfToken;
    return csrfToken;
  }

  return {
    listOrganizations: () => req("GET", "/api/organizations"),
    getOrganization: (id) => req("GET", `/api/organizations/${encodeURIComponent(id)}`),
    listOrganizationServices: (id) =>
      req("GET", `/api/organizations/${encodeURIComponent(id)}/services`),
    listServices: () => req("GET", "/api/services"),
    listAdminServices: () => req("GET", "/api/admin/services"),
    joinQueue: (i) => req("POST", "/api/tickets", i),
    getPrivateTicket: (token, signal) =>
      req<IssuedTicket>(
        "GET",
        `/api/tickets/${encodeURIComponent(token)}`,
        undefined,
        {},
        signal ? { signal } : {},
      ),
    cancelPrivateTicket: (token) =>
      req<IssuedTicket>("POST", `/api/tickets/${encodeURIComponent(token)}/cancel`),
    getPushConfig: () => req("GET", "/api/push/config"),
    registerTicketPush: (token, subscription) =>
      req("POST", `/api/tickets/${encodeURIComponent(token)}/push-subscriptions`, subscription),
    removeTicketPush: (token, endpoint) =>
      req("DELETE", `/api/tickets/${encodeURIComponent(token)}/push-subscriptions`, { endpoint }),
    issueTicket: ({ queueId, accessToken, idempotencyKey }) =>
      req<JoinResponse>(
        "POST",
        `/api/queues/${encodeURIComponent(queueId)}/tickets`,
        {
          accessToken,
        },
        { "Idempotency-Key": idempotencyKey },
      ),
    login: async (username, password) => {
      const response = await req<LoginResponse>(
        "POST",
        "/api/auth/login",
        { username, password },
        {},
        {
          includeAuthorization: false,
          csrf: false,
        },
      );
      csrfToken = null;
      return response;
    },
    getCurrentIdentity: () => req("GET", "/api/auth/me"),
    getCsrfToken: async () => ({ csrfToken: await fetchCsrfToken() }),
    logout: async () => {
      await req<void>("POST", "/api/auth/logout", undefined, {}, { includeAuthorization: false });
      csrfToken = null;
    },
    listCounters: () => req("GET", "/api/counters"),
    getQueue: (id) => req("GET", `/api/counters/${encodeURIComponent(id)}/queue`),
    callNext: (id) => req("POST", `/api/counters/${encodeURIComponent(id)}/call-next`),
    callNextFromQueue: (queueId, counterId) =>
      req("POST", `/api/staff/queues/${encodeURIComponent(queueId)}/call-next`, { counterId }),
    startService: (id) => req("POST", `/api/tickets/${encodeURIComponent(id)}/start`),
    completeTicket: (id) => req("POST", `/api/tickets/${encodeURIComponent(id)}/complete`),
    markNoShow: (id) => req("POST", `/api/tickets/${encodeURIComponent(id)}/no-show`),
    createService: (i) => req("POST", "/api/admin/services", i),
    updateService: (id, i) => req("PATCH", `/api/admin/services/${encodeURIComponent(id)}`, i),
    setQueueOverride: (queueId, isOpen) =>
      req("PATCH", `/api/admin/queues/${encodeURIComponent(queueId)}`, { isOpen }),
    deleteService: (id) => req("DELETE", `/api/admin/services/${encodeURIComponent(id)}`),
    createCounter: (i) => req("POST", "/api/admin/counters", i),
    updateCounter: (id, i) => req("PATCH", `/api/admin/counters/${encodeURIComponent(id)}`, i),
    deleteCounter: (id) => req("DELETE", `/api/admin/counters/${encodeURIComponent(id)}`),
    listStaff: () => req("GET", "/api/admin/staff"),
    createStaff: (i) => req("POST", "/api/admin/staff", i),
    updateStaff: (id, i) => req("PATCH", `/api/admin/staff/${encodeURIComponent(id)}`, i),
    getStats: () => req("GET", "/api/admin/stats"),
    getAnalytics: (dateFrom, dateTo) => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const query = params.toString();
      return req<Analytics>("GET", `/api/admin/analytics${query ? `?${query}` : ""}`);
    },
  };
}

// Real HTTP client for the FastAPI backend. Endpoint map = the contract to implement.
import {
  ApiError,
  type Analytics,
  type IssuedTicket,
  type KezekApi,
  type JoinResponse,
} from "./types";

export function createHttpApi(baseUrl: string, getToken: () => string | null): KezekApi {
  async function req<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const token = getToken();
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? null : JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        typeof data.message === "string"
          ? data.message
          : typeof data.detail === "string"
            ? data.detail
            : "Please check your input and try again.",
      );
    }
    return res.status === 204 ? (undefined as T) : res.json();
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
      req<IssuedTicket>("GET", `/api/tickets/${encodeURIComponent(token)}`, undefined, {}, signal),
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
    login: (username, password) => req("POST", "/api/auth/login", { username, password }),
    listCounters: () => req("GET", "/api/counters"),
    getQueue: (id) => req("GET", `/api/counters/${id}/queue`),
    callNext: (id) => req("POST", `/api/counters/${id}/call-next`),
    callNextFromQueue: (queueId, counterId) =>
      req("POST", `/api/staff/queues/${encodeURIComponent(queueId)}/call-next`, { counterId }),
    startService: (id) => req("POST", `/api/tickets/${id}/start`),
    completeTicket: (id) => req("POST", `/api/tickets/${id}/complete`),
    markNoShow: (id) => req("POST", `/api/tickets/${id}/no-show`),
    createService: (i) => req("POST", "/api/admin/services", i),
    updateService: (id, i) => req("PATCH", `/api/admin/services/${id}`, i),
    setQueueOverride: (queueId, isOpen) =>
      req("PATCH", `/api/admin/queues/${encodeURIComponent(queueId)}`, { isOpen }),
    deleteService: (id) => req("DELETE", `/api/admin/services/${id}`),
    createCounter: (i) => req("POST", "/api/admin/counters", i),
    updateCounter: (id, i) => req("PATCH", `/api/admin/counters/${id}`, i),
    deleteCounter: (id) => req("DELETE", `/api/admin/counters/${id}`),
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

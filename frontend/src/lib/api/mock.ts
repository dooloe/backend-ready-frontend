// In-browser mock of the Kezek REST API. Persists to localStorage so data
// survives reloads. Replace by setting VITE_API_BASE_URL (see ./index.ts).
import {
  ApiError,
  type Counter,
  type KezekApi,
  type Role,
  type Service,
  type StaffUser,
  type Stats,
  type Analytics,
  type Ticket,
  type TicketView,
  type IssuedTicket,
  type JoinResponse,
  type QueueSummary,
  type ServiceSummary,
} from "./types";

type StaffRecord = StaffUser & { password: string };
interface DB {
  services: Service[];
  counters: Counter[];
  staff: StaffRecord[];
  tickets: Ticket[];
  seq: Record<string, number>;
  sessions: Record<string, string>; // token -> staffId
  privateTickets: Record<string, string>; // demo access token -> ticket ID
  idempotentJoins: Record<string, { accessToken: string; ticketId: string }>;
  queueOverrides: Record<string, boolean>;
}

const KEY = "kezek-mock-db-v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const demoOrganizations = [
  {
    id: "mock-university",
    name: "Almaty University · Demo",
    description: "Demonstration university services. This is not a real provider.",
    category: "Universities",
    location: "Almaty, Kazakhstan",
    timezone: "Asia/Almaty",
    serviceId: "mock-svc-university",
    serviceName: "Student services",
    serviceDescription: "Transcripts, enrollment, and student records.",
    prefix: "U",
    duration: 6,
    staffName: "University demo staff",
  },
  {
    id: "mock-clinic",
    name: "City Health Clinic · Demo",
    description: "Demonstration clinic services. This is not a real provider.",
    category: "Clinics",
    location: "Astana, Kazakhstan",
    timezone: "Asia/Almaty",
    serviceId: "mock-svc-clinic",
    serviceName: "General consultation",
    serviceDescription: "A demonstration clinic queue.",
    prefix: "H",
    duration: 12,
    staffName: "Clinic demo staff",
  },
  {
    id: "mock-government",
    name: "Citizen Service Office · Demo",
    description: "Demonstration government service. This is not a real provider.",
    category: "Government Services",
    location: "Shymkent, Kazakhstan",
    timezone: "Asia/Almaty",
    serviceId: "mock-svc-government",
    serviceName: "Documents & applications",
    serviceDescription: "A demonstration document service queue.",
    prefix: "G",
    duration: 8,
    staffName: "Government demo staff",
  },
  {
    id: "mock-center",
    name: "Community Service Center · Demo",
    description: "Demonstration service center. This is not a real provider.",
    category: "Service Centers",
    location: "Karaganda, Kazakhstan",
    timezone: "Asia/Almaty",
    serviceId: "mock-svc-center",
    serviceName: "Customer support",
    serviceDescription: "A demonstration customer service queue.",
    prefix: "S",
    duration: 5,
    staffName: "Service center demo staff",
  },
] as const;

function ensureDemoDirectory(data: DB): DB {
  for (const organization of demoOrganizations) {
    if (!data.services.some((service) => service.id === organization.serviceId)) {
      data.services.push({
        id: organization.serviceId,
        name: organization.serviceName,
        description: organization.serviceDescription,
        prefix: organization.prefix,
        isOpen: true,
        avgServiceMinutes: organization.duration,
      });
    }
    const staffId = `demo-staff-${organization.id.slice("mock-".length)}`;
    if (!data.staff.some((staff) => staff.id === staffId)) {
      data.staff.push({
        id: staffId,
        name: organization.staffName,
        username: staffId,
        role: "staff",
        password: "staff123",
      });
    }
    const counterId = `demo-counter-${organization.id.slice("mock-".length)}`;
    if (!data.counters.some((counter) => counter.id === counterId)) {
      data.counters.push({
        id: counterId,
        name: "Service counter",
        serviceIds: [organization.serviceId],
        isActive: true,
        staffId,
      });
    }
  }
  return data;
}

function seed(): DB {
  return ensureDemoDirectory({
    services: [
      {
        id: "svc-reg",
        name: "Registrar Office",
        description: "Documents, transcripts, enrollment",
        prefix: "A",
        isOpen: true,
        avgServiceMinutes: 6,
      },
      {
        id: "svc-fin",
        name: "Finance & Payments",
        description: "Tuition, scholarships, refunds",
        prefix: "B",
        isOpen: true,
        avgServiceMinutes: 8,
      },
      {
        id: "svc-it",
        name: "IT Help Desk",
        description: "Accounts, Wi-Fi, devices",
        prefix: "C",
        isOpen: false,
        avgServiceMinutes: 10,
      },
    ],
    counters: [
      {
        id: "cnt-1",
        name: "Counter 1",
        serviceIds: ["svc-reg"],
        isActive: true,
        staffId: "stf-aigerim",
      },
      {
        id: "cnt-2",
        name: "Counter 2",
        serviceIds: ["svc-reg", "svc-fin"],
        isActive: true,
        staffId: null,
      },
    ],
    staff: [
      { id: "stf-admin", name: "Admin", username: "admin", role: "admin", password: "admin123" },
      {
        id: "stf-aigerim",
        name: "Aigerim S.",
        username: "aigerim",
        role: "staff",
        password: "staff123",
      },
    ],
    tickets: [],
    seq: {},
    sessions: {},
    privateTickets: {},
    idempotentJoins: {},
    queueOverrides: {},
  });
}

let db: DB | null = null;
let tokenProvider: () => string | null = () => null;
export function setTokenProvider(fn: () => string | null) {
  tokenProvider = fn;
}

function load(): DB {
  if (db) return ensureDemoDirectory(db);
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DB>;
      return (db = ensureDemoDirectory({
        ...saved,
        services: saved.services ?? [],
        counters: saved.counters ?? [],
        staff: saved.staff ?? [],
        tickets: saved.tickets ?? [],
        seq: saved.seq ?? {},
        sessions: saved.sessions ?? {},
        privateTickets: saved.privateTickets ?? {},
        idempotentJoins: saved.idempotentJoins ?? {},
        queueOverrides: saved.queueOverrides ?? {},
      } as DB));
    }
  }
  return (db = seed());
}
function save() {
  if (typeof window !== "undefined" && db) localStorage.setItem(KEY, JSON.stringify(db));
}
export function resetMockDb() {
  db = seed();
  save();
}

const delay = <T>(v: T, ms = 200) =>
  new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

function requireRole(role: Role): StaffRecord {
  const d = load();
  const token = tokenProvider();
  const staffId = token ? d.sessions[token] : undefined;
  const user = d.staff.find((s) => s.id === staffId);
  if (!user || user.isActive === false) throw new ApiError(401, "Not authenticated");
  if (role === "admin" && user.role !== "admin") throw new ApiError(403, "Admins only");
  return user;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
function dateInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function view(t: Ticket): TicketView {
  const d = load();
  const svc = d.services.find((s) => s.id === t.serviceId);
  const counter = d.counters.find((c) => c.id === t.counterId);
  let position: number | null = null;
  let eta: number | null = null;
  if (t.status === "waiting") {
    const ahead = d.tickets.filter(
      (o) => o.serviceId === t.serviceId && o.status === "waiting" && o.createdAt < t.createdAt,
    ).length;
    position = ahead + 1;
    const active = d.counters.filter(
      (c) => c.isActive && c.serviceIds.includes(t.serviceId),
    ).length;
    eta = active === 0 ? null : Math.ceil((ahead * (svc?.avgServiceMinutes ?? 5)) / active);
  }
  return {
    ...t,
    serviceName: svc?.name ?? "Unknown",
    counterName: counter?.name ?? null,
    position,
    estimatedWaitMinutes: eta,
  };
}

function toIssuedTicket(ticket: Ticket): IssuedTicket {
  const organization = demoOrganizations.find((item) => item.serviceId === ticket.serviceId);
  const counter = load().counters.find((item) => item.id === ticket.counterId);
  const ticketView = view(ticket);
  return {
    id: ticket.id,
    queueId: `mock-queue-${ticket.serviceId}`,
    organizationName: organization?.name ?? "Kezek demo organization",
    ticketNumber: ticket.code,
    serviceName: ticketView.serviceName,
    status: ticket.status,
    position: ticketView.position,
    estimatedWaitMinutes: ticketView.estimatedWaitMinutes,
    counterId: ticket.counterId,
    counterName: counter?.name ?? null,
    createdAt: ticket.createdAt,
    calledAt: ticket.calledAt,
    startedAt: ticket.servedAt,
    completedAt: ticket.status === "completed" ? ticket.finishedAt : null,
    cancelledAt: ticket.status === "cancelled" ? ticket.finishedAt : null,
    noShowAt: ticket.status === "no_show" ? ticket.finishedAt : null,
  };
}

function findTicket(id: string) {
  const t = load().tickets.find((x) => x.id === id);
  if (!t) throw new ApiError(404, "Ticket not found");
  return t;
}

function transition(id: string, from: Ticket["status"][], patch: Partial<Ticket>) {
  requireRole("staff");
  const t = findTicket(id);
  if (!from.includes(t.status)) throw new ApiError(409, `Ticket is ${t.status}`);
  Object.assign(t, patch);
  save();
  return delay(view(t));
}

const now = () => new Date().toISOString();

export const mockApi: KezekApi = {
  listOrganizations: () => {
    const data = load();
    const organizations = demoOrganizations.map((organization) => {
      const service = data.services.find((item) => item.id === organization.serviceId)!;
      const waiting = data.tickets.filter(
        (ticket) => ticket.serviceId === service.id && ticket.status === "waiting",
      );
      const activeCounters = data.counters.filter(
        (counter) => counter.isActive && counter.serviceIds.includes(service.id),
      ).length;
      return {
        id: organization.id,
        name: organization.name,
        description: organization.description,
        category: organization.category,
        location: organization.location,
        timezone: organization.timezone,
        services: [
          {
            ...service,
            isOpen: service.isOpen && data.queueOverrides[`mock-queue-${service.id}`] !== false,
            waitingCount: waiting.length,
            estimatedWaitMinutes: activeCounters
              ? Math.ceil((waiting.length * service.avgServiceMinutes) / activeCounters)
              : null,
            operatingHours: null,
          },
        ],
      };
    });
    return delay(organizations);
  },
  async getOrganization(id) {
    const org = (await mockApi.listOrganizations()).find((o) => o.id === id);
    if (!org) throw new ApiError(404, "Organization not found");
    return org;
  },
  async listOrganizationServices(organizationId) {
    const organization = demoOrganizations.find((item) => item.id === organizationId);
    if (!organization) throw new ApiError(404, "Organization not found");
    const data = load();
    const service = data.services.find((item) => item.id === organization.serviceId);
    if (!service) return [];
    const waiting = data.tickets.filter(
      (ticket) => ticket.serviceId === service.id && ticket.status === "waiting",
    ).length;
    const activeCounters = data.counters.filter(
      (counter) => counter.isActive && counter.serviceIds.includes(service.id),
    ).length;
    const queue: QueueSummary = {
      id: `mock-queue-${service.id}`,
      serviceId: service.id,
      queueDate: new Date().toISOString().slice(0, 10),
      isOpen: service.isOpen && data.queueOverrides[`mock-queue-${service.id}`] !== false,
      waiting,
      activeCounters,
      estimatedWaitMinutes: activeCounters
        ? Math.ceil((waiting * service.avgServiceMinutes) / activeCounters)
        : null,
    };
    const summary: ServiceSummary = {
      id: service.id,
      organizationId,
      name: service.name,
      description: service.description,
      prefix: service.prefix,
      durationMinutes: service.avgServiceMinutes,
      opensAt: service.opensAt ?? null,
      closesAt: service.closesAt ?? null,
      timezone: organization.timezone,
      queue,
    };
    return [summary];
  },
  listServices: () => delay(load().services),
  listAdminServices() {
    requireRole("admin");
    return delay(load().services);
  },

  joinQueue({ serviceId, customerName }) {
    const d = load();
    const svc = d.services.find((s) => s.id === serviceId);
    if (!svc) throw new ApiError(404, "Service not found");
    if (!svc.isOpen) throw new ApiError(409, "This queue is closed");
    if (!customerName.trim()) throw new ApiError(422, "Name is required");
    const n = (d.seq[serviceId] ?? 0) + 1;
    d.seq[serviceId] = n;
    const t: Ticket = {
      id: uid(),
      code: `${svc.prefix}-${String(n).padStart(3, "0")}`,
      serviceId,
      customerName: customerName.trim(),
      status: "waiting",
      createdAt: now(),
      calledAt: null,
      servedAt: null,
      finishedAt: null,
      counterId: null,
    };
    d.tickets.push(t);
    save();
    return delay(view(t));
  },

  async issueTicket({ queueId, accessToken, idempotencyKey }): Promise<JoinResponse> {
    const data = load();
    if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken) || !/^[A-Za-z0-9_-]{43}$/.test(idempotencyKey)) {
      throw new ApiError(422, "Ticket retry credentials are invalid");
    }
    const serviceId = queueId.startsWith("mock-queue-") ? queueId.slice("mock-queue-".length) : "";
    const service = data.services.find((item) => item.id === serviceId);
    if (!service) throw new ApiError(404, "Queue not found");
    const key = `${queueId}:${idempotencyKey}`;
    const prior = data.idempotentJoins[key];
    if (prior) {
      if (prior.accessToken !== accessToken) throw new ApiError(409, "Idempotency key conflict");
      const ticket = findTicket(prior.ticketId);
      return {
        ticket: toIssuedTicket(ticket),
        ticketUrl: `/ticket/${accessToken}`,
      };
    }
    if (data.privateTickets[accessToken]) throw new ApiError(409, "Ticket token already used");
    if (!service.isOpen) throw new ApiError(409, "This queue is closed");
    const sequence = (data.seq[service.id] ?? 0) + 1;
    data.seq[service.id] = sequence;
    const ticket: Ticket = {
      id: uid(),
      code: `${service.prefix}-${String(sequence).padStart(3, "0")}`,
      serviceId,
      customerName: "Visitor",
      status: "waiting",
      createdAt: now(),
      calledAt: null,
      servedAt: null,
      finishedAt: null,
      counterId: null,
    };
    data.tickets.push(ticket);
    data.privateTickets[accessToken] = ticket.id;
    data.idempotentJoins[key] = { accessToken, ticketId: ticket.id };
    save();
    return {
      ticket: toIssuedTicket(ticket),
      ticketUrl: `/ticket/${accessToken}`,
    };
  },

  getPrivateTicket: async (accessToken) => {
    const ticketId = load().privateTickets[accessToken];
    if (!ticketId) throw new ApiError(404, "Ticket not found");
    return delay(toIssuedTicket(findTicket(ticketId)));
  },
  cancelPrivateTicket: async (accessToken) => {
    const ticketId = load().privateTickets[accessToken];
    if (!ticketId) throw new ApiError(404, "Ticket not found");
    const ticket = findTicket(ticketId);
    if (ticket.status !== "waiting")
      throw new ApiError(409, "Only waiting tickets can be cancelled");
    ticket.status = "cancelled";
    ticket.finishedAt = now();
    save();
    return delay(toIssuedTicket(ticket));
  },
  getPushConfig: async () => ({ enabled: false, publicKey: null }),
  registerTicketPush: async () => undefined,
  removeTicketPush: async () => undefined,

  login(username, password) {
    const d = load();
    const u = d.staff.find(
      (s) => s.username === username && s.password === password && s.isActive !== false,
    );
    if (!u) return Promise.reject(new ApiError(401, "Invalid username or password"));
    const token = uid();
    d.sessions[token] = u.id;
    save();
    const { password: _p, ...user } = u;
    return delay({ token, user: { ...user, isActive: u.isActive !== false } });
  },

  getCurrentIdentity() {
    const { password: _password, ...user } = requireRole("staff");
    return delay({ ...user, isActive: user.isActive !== false });
  },

  getCsrfToken() {
    requireRole("staff");
    return delay({ csrfToken: "demo-csrf-proof" });
  },

  logout() {
    const token = tokenProvider();
    const data = load();
    if (!token || !data.sessions[token]) throw new ApiError(401, "Not authenticated");
    delete data.sessions[token];
    save();
    return delay(undefined);
  },

  listCounters() {
    requireRole("staff");
    return delay(load().counters);
  },

  getQueue(counterId) {
    requireRole("staff");
    const d = load();
    const c = d.counters.find((x) => x.id === counterId);
    if (!c) throw new ApiError(404, "Counter not found");
    const current = d.tickets.find(
      (t) => t.counterId === counterId && (t.status === "called" || t.status === "serving"),
    );
    const waiting = d.tickets
      .filter((t) => t.status === "waiting" && c.serviceIds.includes(t.serviceId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return delay({ current: current ? view(current) : null, waiting: waiting.map(view) }, 120);
  },

  callNext(counterId) {
    requireRole("staff");
    const d = load();
    const c = d.counters.find((x) => x.id === counterId);
    if (!c) throw new ApiError(404, "Counter not found");
    if (!c.isActive) throw new ApiError(409, "Counter is inactive");
    const busy = d.tickets.some(
      (t) => t.counterId === counterId && (t.status === "called" || t.status === "serving"),
    );
    if (busy) throw new ApiError(409, "Finish the current ticket first");
    // Synchronous pick+update = atomic in the mock. Backend must do this in one transaction.
    const next = d.tickets
      .filter((t) => t.status === "waiting" && c.serviceIds.includes(t.serviceId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return delay(null);
    next.status = "called";
    next.calledAt = now();
    next.counterId = counterId;
    save();
    return delay(view(next));
  },

  callNextFromQueue() {
    requireRole("staff");
    return Promise.reject(new ApiError(501, "Queue-scoped calls require the real backend"));
  },

  startService: (id) => transition(id, ["called"], { status: "serving", servedAt: now() }),
  completeTicket: (id) => transition(id, ["serving"], { status: "completed", finishedAt: now() }),
  markNoShow: (id) => transition(id, ["called"], { status: "no_show", finishedAt: now() }),

  createService(input) {
    requireRole("admin");
    const s = { ...input, id: uid() };
    load().services.push(s);
    save();
    return delay(s);
  },
  updateService(id, input) {
    requireRole("admin");
    const s = load().services.find((x) => x.id === id);
    if (!s) throw new ApiError(404, "Service not found");
    Object.assign(s, input);
    save();
    return delay(s);
  },
  setQueueOverride(queueId, isOpen) {
    requireRole("admin");
    const d = load();
    const serviceId = queueId.startsWith("mock-queue-") ? queueId.slice("mock-queue-".length) : "";
    const service = d.services.find((item) => item.id === serviceId);
    if (!service) throw new ApiError(404, "Queue not found");
    if (isOpen && (service.isActive === false || !service.isOpen)) {
      throw new ApiError(409, "Cannot open a queue while its service is inactive or closed");
    }
    d.queueOverrides[queueId] = isOpen;
    save();
    const waiting = d.tickets.filter(
      (ticket) => ticket.serviceId === serviceId && ticket.status === "waiting",
    ).length;
    const activeCounters = d.counters.filter(
      (counter) => counter.isActive && counter.serviceIds.includes(serviceId),
    ).length;
    return delay({
      id: queueId,
      serviceId,
      queueDate: new Date().toISOString().slice(0, 10),
      isOpen,
      waiting,
      activeCounters,
      estimatedWaitMinutes: activeCounters
        ? Math.ceil((waiting * service.avgServiceMinutes) / activeCounters)
        : null,
    });
  },
  deleteService(id) {
    requireRole("admin");
    const d = load();
    d.services = d.services.filter((s) => s.id !== id);
    d.counters.forEach((c) => (c.serviceIds = c.serviceIds.filter((x) => x !== id)));
    save();
    return delay(undefined);
  },
  createCounter(input) {
    requireRole("admin");
    const c = { ...input, id: uid() };
    load().counters.push(c);
    save();
    return delay(c);
  },
  updateCounter(id, input) {
    requireRole("admin");
    const c = load().counters.find((x) => x.id === id);
    if (!c) throw new ApiError(404, "Counter not found");
    Object.assign(c, input);
    save();
    return delay(c);
  },
  deleteCounter(id) {
    requireRole("admin");
    const d = load();
    d.counters = d.counters.filter((c) => c.id !== id);
    save();
    return delay(undefined);
  },
  listStaff() {
    requireRole("admin");
    return delay(
      load().staff.map(({ password: _p, ...u }) => ({ ...u, isActive: u.isActive !== false })),
    );
  },
  createStaff({ password, ...input }) {
    requireRole("admin");
    const d = load();
    if (d.staff.some((s) => s.username === input.username))
      throw new ApiError(409, "Username already taken");
    const s = { ...input, isActive: input.isActive ?? true, password, id: uid() };
    d.staff.push(s);
    save();
    const { password: _p, ...u } = s;
    return delay(u);
  },
  updateStaff(id, input) {
    const actor = requireRole("admin");
    const d = load();
    const user = d.staff.find((s) => s.id === id);
    if (!user) throw new ApiError(404, "Staff user not found");
    if (id === actor.id && input.isActive === false)
      throw new ApiError(409, "An administrator cannot deactivate their own account");
    if (input.username && d.staff.some((s) => s.id !== id && s.username === input.username))
      throw new ApiError(409, "Username already taken");
    const hasActiveTicket = d.tickets.some(
      (ticket) =>
        ["called", "serving"].includes(ticket.status) &&
        d.counters.some((counter) => counter.staffId === id && counter.id === ticket.counterId),
    );
    if (user.isActive !== false && input.isActive === false && hasActiveTicket)
      throw new ApiError(409, "Finish the active ticket before deactivating this staff member");
    Object.assign(user, input);
    if ("isActive" in input || "role" in input) {
      for (const [token, staffId] of Object.entries(d.sessions)) {
        if (staffId === id) delete d.sessions[token];
      }
    }
    save();
    const { password: _p, ...publicUser } = user;
    return delay({ ...publicUser, isActive: user.isActive !== false });
  },

  getStats() {
    requireRole("admin");
    const d = load();
    const today = d.tickets.filter((t) => isToday(t.createdAt));
    const avg = (ts: Ticket[]) => {
      const w = ts.filter((t) => t.calledAt).map((t) => minutes(t.createdAt, t.calledAt!));
      return w.length ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : null;
    };
    const byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: today.filter((t) => new Date(t.createdAt).getHours() === hour).length,
    }));
    const stats: Stats = {
      totalToday: today.length,
      waitingNow: d.tickets.filter((t) => t.status === "waiting").length,
      completedToday: today.filter((t) => t.status === "completed").length,
      avgWaitMinutes: avg(today),
      byService: d.services.map((s) => {
        const ts = today.filter((t) => t.serviceId === s.id);
        return {
          serviceId: s.id,
          serviceName: s.name,
          total: ts.length,
          waiting: ts.filter((t) => t.status === "waiting").length,
          completed: ts.filter((t) => t.status === "completed").length,
          noShows: ts.filter((t) => t.status === "no_show").length,
          cancelled: ts.filter((t) => t.status === "cancelled").length,
          avgWaitMinutes: avg(ts),
        };
      }),
      byHour,
    };
    return delay(stats);
  },

  getAnalytics(dateFrom?: string, dateTo?: string) {
    requireRole("admin");
    if ((dateFrom === undefined) !== (dateTo === undefined)) {
      throw new ApiError(422, "Choose both a start and end date.");
    }
    const timezone = "Asia/Almaty";
    const today = dateInZone(new Date().toISOString(), timezone);
    const from = dateFrom ?? today;
    const to = dateTo ?? today;
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate.toISOString().slice(0, 10) !== from ||
      toDate.toISOString().slice(0, 10) !== to ||
      from > to
    ) {
      throw new ApiError(422, "Choose a valid date range.");
    }
    if ((toDate.getTime() - fromDate.getTime()) / 86_400_000 > 30) {
      throw new ApiError(422, "Date range cannot exceed 31 days.");
    }

    const tickets = load().tickets.filter((item) => {
      const service = load().services.find((value) => value.id === item.serviceId);
      return (
        service &&
        dateInZone(item.createdAt, timezone) >= from &&
        dateInZone(item.createdAt, timezone) <= to
      );
    });
    const completed = tickets.filter((item) => item.status === "completed");
    const mean = (values: number[]) =>
      values.length
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
        : null;
    const waits = completed
      .filter((item) => item.calledAt && item.calledAt >= item.createdAt)
      .map((item) => minutes(item.createdAt, item.calledAt!));
    const serviceDurations = completed
      .filter((item) => item.servedAt && item.finishedAt && item.finishedAt >= item.servedAt)
      .map((item) => minutes(item.servedAt!, item.finishedAt!));
    const byService = [...new Set(tickets.map((item) => item.serviceId))]
      .map((serviceId) => {
        const rows = tickets.filter((item) => item.serviceId === serviceId);
        const done = rows.filter((item) => item.status === "completed");
        return {
          serviceId,
          serviceName: load().services.find((item) => item.id === serviceId)?.name ?? "Service",
          issued: rows.length,
          waiting: rows.filter((item) => item.status === "waiting").length,
          completed: done.length,
          meanWaitMinutes: mean(
            done
              .filter((item) => item.calledAt && item.calledAt >= item.createdAt)
              .map((item) => minutes(item.createdAt, item.calledAt!)),
          ),
          meanServiceMinutes: mean(
            done
              .filter(
                (item) => item.servedAt && item.finishedAt && item.finishedAt >= item.servedAt,
              )
              .map((item) => minutes(item.servedAt!, item.finishedAt!)),
          ),
        };
      })
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
    const byDay = [];
    for (let date = new Date(fromDate); date <= toDate; date.setUTCDate(date.getUTCDate() + 1)) {
      const day = date.toISOString().slice(0, 10);
      const rows = tickets.filter((item) => dateInZone(item.createdAt, timezone) === day);
      byDay.push({
        date: day,
        issued: rows.length,
        completed: rows.filter((item) => item.status === "completed").length,
      });
    }
    const result: Analytics = {
      dateFrom: from,
      dateTo: to,
      timezone,
      issued: tickets.length,
      waiting: tickets.filter((item) => item.status === "waiting").length,
      completed: completed.length,
      meanWaitMinutes: mean(waits),
      meanServiceMinutes: mean(serviceDurations),
      byService,
      byDay,
    };
    return delay(result);
  },
};

// Wrap so synchronous throws become rejected promises (like real HTTP).
for (const k of Object.keys(mockApi) as (keyof KezekApi)[]) {
  const fn = mockApi[k] as (...a: unknown[]) => unknown;
  (mockApi as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => {
    try {
      return Promise.resolve(fn(...a));
    } catch (e) {
      return Promise.reject(e);
    }
  };
}

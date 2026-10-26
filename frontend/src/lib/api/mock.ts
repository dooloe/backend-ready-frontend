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
  type Ticket,
  type TicketView,
} from "./types";

type StaffRecord = StaffUser & { password: string };
interface DB {
  services: Service[];
  counters: Counter[];
  staff: StaffRecord[];
  tickets: Ticket[];
  seq: Record<string, number>;
  sessions: Record<string, string>; // token -> staffId
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
    if (raw) return (db = ensureDemoDirectory(JSON.parse(raw) as DB));
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
  if (!user) throw new ApiError(401, "Not authenticated");
  if (role === "admin" && user.role !== "admin") throw new ApiError(403, "Admins only");
  return user;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

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
  listServices: () => delay(load().services),

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

  getTicket: async (id) => delay(view(findTicket(id))),

  cancelTicket(id) {
    const t = findTicket(id);
    if (t.status !== "waiting") throw new ApiError(409, "Only waiting tickets can be cancelled");
    t.status = "cancelled";
    t.finishedAt = now();
    save();
    return delay(view(t));
  },

  login(username, password) {
    const d = load();
    const u = d.staff.find((s) => s.username === username && s.password === password);
    if (!u) return Promise.reject(new ApiError(401, "Invalid username or password"));
    const token = uid();
    d.sessions[token] = u.id;
    save();
    const { password: _p, ...user } = u;
    return delay({ token, user });
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

  startService: (id) => transition(id, ["called"], { status: "serving", servedAt: now() }),
  completeTicket: (id) =>
    transition(id, ["called", "serving"], { status: "completed", finishedAt: now() }),
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
    return delay(load().staff.map(({ password: _p, ...u }) => u));
  },
  createStaff({ password, ...input }) {
    requireRole("admin");
    const d = load();
    if (d.staff.some((s) => s.username === input.username))
      throw new ApiError(409, "Username already taken");
    const s = { ...input, password, id: uid() };
    d.staff.push(s);
    save();
    const { password: _p, ...u } = s;
    return delay(u);
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

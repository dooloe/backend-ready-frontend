// Shared API contract. The FastAPI backend should return these exact shapes.
export type Role = "staff" | "admin";
export type TicketStatus = "waiting" | "called" | "serving" | "completed" | "cancelled" | "no_show";

export interface Service {
  id: string;
  name: string;
  description: string;
  prefix: string; // e.g. "A" -> tickets A-001
  isOpen: boolean;
  avgServiceMinutes: number;
  // Supported by the real backend; optional for compatibility with the browser demo.
  isActive?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface Counter {
  id: string;
  name: string;
  serviceIds: string[];
  isActive: boolean;
  staffId: string | null;
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive?: boolean;
}

export interface Ticket {
  id: string;
  code: string;
  serviceId: string;
  customerName: string;
  status: TicketStatus;
  createdAt: string;
  calledAt: string | null;
  servedAt: string | null;
  finishedAt: string | null;
  counterId: string | null;
}

export interface TicketView extends Ticket {
  serviceName: string;
  counterName: string | null;
  position: number | null; // 1-based among waiting; null if not waiting
  estimatedWaitMinutes: number | null; // null when no active counters
}

export interface IssuedTicket {
  id: string;
  queueId: string;
  organizationName: string;
  ticketNumber: string;
  serviceName: string;
  status: TicketStatus;
  position: number | null;
  estimatedWaitMinutes: number | null;
  counterId: string | null;
  counterName: string | null;
  createdAt: string;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
}

export function isIssuedTicket(value: TicketView | IssuedTicket): value is IssuedTicket {
  return "ticketNumber" in value;
}

export interface QueueSummary {
  id: string;
  serviceId: string;
  queueDate: string;
  isOpen: boolean;
  waiting: number;
  activeCounters: number;
  estimatedWaitMinutes: number | null;
}

export interface ServiceSummary {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  prefix: string;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  timezone: string;
  queue: QueueSummary | null;
}

export interface JoinResponse {
  ticket: IssuedTicket;
  ticketUrl: string;
}

export interface ServiceStats {
  serviceId: string;
  serviceName: string;
  total: number;
  waiting: number;
  completed: number;
  noShows: number;
  cancelled: number;
  avgWaitMinutes: number | null;
}

export interface Stats {
  totalToday: number;
  waitingNow: number;
  completedToday: number;
  avgWaitMinutes: number | null;
  byService: ServiceStats[];
  byHour: { hour: number; count: number }[];
}

export interface ServiceMetrics {
  serviceId: string;
  serviceName: string;
  issued: number;
  waiting: number;
  completed: number;
  meanWaitMinutes: number | null;
  meanServiceMinutes: number | null;
}

export interface DayMetrics {
  date: string;
  issued: number;
  completed: number;
}

export interface Analytics {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  issued: number;
  waiting: number;
  completed: number;
  meanWaitMinutes: number | null;
  meanServiceMinutes: number | null;
  byService: ServiceMetrics[];
  byDay: DayMetrics[];
}

export interface LoginResponse {
  token: string;
  user: StaffUser;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface KezekApi {
  listOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization>;
  listOrganizationServices(organizationId: string): Promise<ServiceSummary[]>;
  // Public (customer)
  listServices(): Promise<Service[]>;
  joinQueue(input: { serviceId: string; customerName: string }): Promise<TicketView>;
  getTicket(id: string, signal?: AbortSignal): Promise<TicketView>;
  cancelTicket(id: string): Promise<TicketView>;
  getPrivateTicket(accessToken: string, signal?: AbortSignal): Promise<IssuedTicket>;
  cancelPrivateTicket(accessToken: string): Promise<IssuedTicket>;
  issueTicket(input: {
    queueId: string;
    accessToken: string;
    idempotencyKey: string;
  }): Promise<JoinResponse>;
  // Auth
  login(username: string, password: string): Promise<LoginResponse>;
  // Staff
  listCounters(): Promise<Counter[]>;
  getQueue(counterId: string): Promise<{ current: TicketView | null; waiting: TicketView[] }>;
  callNext(counterId: string): Promise<TicketView | null>;
  callNextFromQueue(queueId: string, counterId: string): Promise<TicketView | null>;
  startService(ticketId: string): Promise<TicketView>;
  completeTicket(ticketId: string): Promise<TicketView>;
  markNoShow(ticketId: string): Promise<TicketView>;
  // Admin
  createService(input: Omit<Service, "id">): Promise<Service>;
  updateService(id: string, input: Partial<Omit<Service, "id">>): Promise<Service>;
  deleteService(id: string): Promise<void>;
  createCounter(input: Omit<Counter, "id">): Promise<Counter>;
  updateCounter(id: string, input: Partial<Omit<Counter, "id">>): Promise<Counter>;
  deleteCounter(id: string): Promise<void>;
  listStaff(): Promise<StaffUser[]>;
  createStaff(input: Omit<StaffUser, "id"> & { password: string }): Promise<StaffUser>;
  updateStaff(
    id: string,
    input: Partial<Pick<StaffUser, "name" | "username" | "role" | "isActive">>,
  ): Promise<StaffUser>;
  getStats(): Promise<Stats>;
  getAnalytics(dateFrom?: string, dateTo?: string): Promise<Analytics>;
}

export const categories = [
  "Universities",
  "Clinics",
  "Government Services",
  "Service Centers",
] as const;
export interface PublicService extends Service {
  waitingCount: number;
  estimatedWaitMinutes: number | null;
  operatingHours: string | null;
}
export interface Organization {
  id: string;
  name: string;
  description: string;
  category: string;
  location: string | null;
  timezone: string;
  services: PublicService[];
}

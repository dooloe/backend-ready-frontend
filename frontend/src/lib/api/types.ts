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
  // Public (customer)
  listServices(): Promise<Service[]>;
  joinQueue(input: { serviceId: string; customerName: string }): Promise<TicketView>;
  getTicket(id: string): Promise<TicketView>;
  cancelTicket(id: string): Promise<TicketView>;
  // Auth
  login(username: string, password: string): Promise<LoginResponse>;
  // Staff
  listCounters(): Promise<Counter[]>;
  getQueue(counterId: string): Promise<{ current: TicketView | null; waiting: TicketView[] }>;
  callNext(counterId: string): Promise<TicketView | null>;
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
  getStats(): Promise<Stats>;
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

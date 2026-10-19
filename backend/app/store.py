"""One process-local store. A lock covers each complete read/mutation operation."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import math
import secrets
from threading import RLock

from fastapi import HTTPException, Request

from .auth import Session, UserRecord, hash_password, token_hash, verify_password
from .models import (
    Counter, CounterCreate, HourlyStats, JoinQueueRequest, LoginRequest, LoginResponse,
    QueueView, Service, ServiceCreate, ServiceStats, StaffCreate, StaffUser, Stats,
    Ticket, TicketView,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return secrets.token_urlsafe(18)


class MemoryStore:
    def __init__(self, *, seed_tickets: bool = True, clock: Callable[[], datetime] = utc_now):
        self.lock = RLock()
        self.clock = clock
        self.services: dict[str, Service] = {}
        self.counters: dict[str, Counter] = {}
        self.users: dict[str, UserRecord] = {}
        self.sessions: dict[str, Session] = {}
        self.tickets: dict[str, Ticket] = {}
        self.sequences: dict[str, int] = {}
        self._seed(seed_tickets)

    def _seed(self, seed_tickets: bool) -> None:
        for item in [
            Service(id="svc-reg", name="Registrar Office", description="Documents, transcripts, enrollment", prefix="A", isOpen=True, avgServiceMinutes=6),
            Service(id="svc-fin", name="Finance & Payments", description="Tuition, scholarships, refunds", prefix="B", isOpen=True, avgServiceMinutes=8),
            Service(id="svc-it", name="IT Help Desk", description="Accounts, Wi-Fi, devices", prefix="C", isOpen=False, avgServiceMinutes=10),
        ]:
            self.services[item.id] = item
        for item in [
            Counter(id="cnt-1", name="Counter 1", serviceIds=["svc-reg"], isActive=True, staffId="stf-aigerim"),
            Counter(id="cnt-2", name="Counter 2", serviceIds=["svc-reg", "svc-fin"], isActive=True, staffId=None),
        ]:
            self.counters[item.id] = item
        for user, password in [
            (StaffUser(id="stf-admin", name="Admin", username="admin", role="admin"), "admin123"),
            (StaffUser(id="stf-aigerim", name="Aigerim S.", username="aigerim", role="staff"), "staff123"),
        ]:
            self.users[user.id] = UserRecord(user, hash_password(password))
        if seed_tickets:
            now = self.clock()
            for service_id, name, age, status in [
                ("svc-reg", "Demo completed", 30, "completed"),
                ("svc-reg", "Demo customer", 5, "waiting"),
                ("svc-fin", "Demo finance customer", 3, "waiting"),
                ("svc-fin", "Demo cancelled", 10, "cancelled"),
            ]:
                t = self._issue(service_id, name, now - timedelta(minutes=age))
                t.status = status
                if status == "completed":
                    t.counterId = "cnt-1"
                    t.calledAt = t.createdAt + timedelta(minutes=4)
                    t.servedAt = t.calledAt + timedelta(minutes=1)
                    t.finishedAt = t.servedAt + timedelta(minutes=6)
                elif status == "cancelled":
                    t.finishedAt = t.createdAt + timedelta(minutes=1)

    def login(self, request: LoginRequest) -> LoginResponse:
        with self.lock:
            record = next((r for r in self.users.values() if r.user.username == request.username), None)
            # Verify a real hash even for unknown users to avoid a cheap username probe.
            candidate_hash = record.password_hash if record else self.users["stf-admin"].password_hash
            valid = verify_password(request.password, candidate_hash)
            if record is None or not valid:
                raise HTTPException(401, "Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
            token = secrets.token_urlsafe(32)
            self.sessions[token_hash(token)] = Session(record.user.id, self.clock() + timedelta(hours=8))
            return LoginResponse(token=token, user=record.user.model_copy(deep=True))

    def authenticate(self, token: str) -> StaffUser | None:
        with self.lock:
            digest = token_hash(token)
            session = self.sessions.get(digest)
            if session is None:
                return None
            if session.expires_at <= self.clock():
                self.sessions.pop(digest, None)
                return None
            record = self.users.get(session.user_id)
            return record.user.model_copy(deep=True) if record else None

    def list_services(self) -> list[Service]:
        with self.lock:
            return [s.model_copy(deep=True) for s in self.services.values()]

    def list_counters(self) -> list[Counter]:
        with self.lock:
            return [c.model_copy(deep=True) for c in self.counters.values()]

    def list_staff(self) -> list[StaffUser]:
        with self.lock:
            return [r.user.model_copy(deep=True) for r in self.users.values()]

    def _get(self, records: dict, key: str, kind: str):
        record = records.get(key)
        if record is None:
            raise HTTPException(404, f"{kind} not found")
        return record

    def _issue(self, service_id: str, name: str, created: datetime) -> Ticket:
        service = self.services[service_id]
        sequence = self.sequences.get(service_id, 0) + 1
        self.sequences[service_id] = sequence
        ticket = Ticket(id=new_id(), code=f"{service.prefix}-{sequence:03d}", serviceId=service_id,
                        customerName=name, status="waiting", createdAt=created, calledAt=None,
                        servedAt=None, finishedAt=None, counterId=None)
        self.tickets[ticket.id] = ticket
        return ticket

    def _waiting(self, service_ids: list[str]) -> list[Ticket]:
        # Python's stable sort preserves insertion order for equal timestamps.
        return sorted((t for t in self.tickets.values() if t.status == "waiting" and t.serviceId in service_ids),
                      key=lambda t: t.createdAt)

    def _view(self, ticket: Ticket) -> TicketView:
        service = self.services.get(ticket.serviceId)
        counter = self.counters.get(ticket.counterId)
        position = estimate = None
        if ticket.status == "waiting":
            queue = self._waiting([ticket.serviceId])
            position = next(i + 1 for i, t in enumerate(queue) if t.id == ticket.id)
            active = sum(c.isActive and ticket.serviceId in c.serviceIds for c in self.counters.values())
            if active:
                estimate = math.ceil((position - 1) * (service.avgServiceMinutes if service else 5) / active)
        return TicketView(**ticket.model_dump(), serviceName=service.name if service else "Unknown",
                          counterName=counter.name if counter else None, position=position,
                          estimatedWaitMinutes=estimate)

    def join(self, request: JoinQueueRequest) -> TicketView:
        with self.lock:
            service = self._get(self.services, request.serviceId, "Service")
            if not service.isOpen:
                raise HTTPException(409, "This queue is closed")
            return self._view(self._issue(service.id, request.customerName, self.clock()))

    def ticket(self, ticket_id: str) -> TicketView:
        with self.lock:
            return self._view(self._get(self.tickets, ticket_id, "Ticket"))

    def cancel(self, ticket_id: str) -> TicketView:
        with self.lock:
            ticket = self._get(self.tickets, ticket_id, "Ticket")
            if ticket.status != "waiting":
                raise HTTPException(409, "Only waiting tickets can be cancelled")
            ticket.status = "cancelled"
            ticket.finishedAt = self.clock()
            return self._view(ticket)

    def queue(self, counter_id: str) -> QueueView:
        with self.lock:
            counter = self._get(self.counters, counter_id, "Counter")
            current = next((t for t in self.tickets.values() if t.counterId == counter_id and t.status in ("called", "serving")), None)
            return QueueView(current=self._view(current) if current else None,
                             waiting=[self._view(t) for t in self._waiting(counter.serviceIds)])

    def call_next(self, counter_id: str) -> TicketView | None:
        with self.lock:
            counter = self._get(self.counters, counter_id, "Counter")
            if not counter.isActive:
                raise HTTPException(409, "Counter is inactive")
            if any(t.counterId == counter_id and t.status in ("called", "serving") for t in self.tickets.values()):
                raise HTTPException(409, "Finish the current ticket first")
            waiting = self._waiting(counter.serviceIds)
            if not waiting:
                return None
            ticket = waiting[0]
            ticket.status, ticket.counterId, ticket.calledAt = "called", counter_id, self.clock()
            return self._view(ticket)

    def transition(self, ticket_id: str, action: str) -> TicketView:
        rules = {"start": (("called",), "serving", "servedAt"),
                 "complete": (("called", "serving"), "completed", "finishedAt"),
                 "no-show": (("called",), "no_show", "finishedAt")}
        with self.lock:
            ticket = self._get(self.tickets, ticket_id, "Ticket")
            allowed, target, timestamp = rules[action]
            if ticket.status not in allowed:
                raise HTTPException(409, f"Ticket is {ticket.status}")
            ticket.status = target
            setattr(ticket, timestamp, self.clock())
            return self._view(ticket)

    def create_service(self, request: ServiceCreate) -> Service:
        with self.lock:
            service = Service(id=new_id(), **request.model_dump())
            self.services[service.id] = service
            return service.model_copy(deep=True)

    def update_service(self, service_id: str, patch: dict) -> Service:
        with self.lock:
            service = self._get(self.services, service_id, "Service")
            updated = Service(**(service.model_dump() | patch))
            self.services[service_id] = updated
            return updated.model_copy(deep=True)

    def delete_service(self, service_id: str) -> None:
        with self.lock:
            self.services.pop(service_id, None)
            for counter in self.counters.values():
                counter.serviceIds = [key for key in counter.serviceIds if key != service_id]

    def _validate_counter_links(self, counter: CounterCreate) -> None:
        if any(key not in self.services for key in counter.serviceIds):
            raise HTTPException(422, "Unknown service in serviceIds")
        if counter.staffId is not None and counter.staffId not in self.users:
            raise HTTPException(422, "Unknown staffId")

    def create_counter(self, request: CounterCreate) -> Counter:
        with self.lock:
            self._validate_counter_links(request)
            counter = Counter(id=new_id(), **request.model_dump())
            self.counters[counter.id] = counter
            return counter.model_copy(deep=True)

    def update_counter(self, counter_id: str, patch: dict) -> Counter:
        with self.lock:
            counter = self._get(self.counters, counter_id, "Counter")
            updated = Counter(**(counter.model_dump() | patch))
            self._validate_counter_links(updated)
            self.counters[counter_id] = updated
            return updated.model_copy(deep=True)

    def delete_counter(self, counter_id: str) -> None:
        with self.lock:
            self.counters.pop(counter_id, None)

    def create_staff(self, request: StaffCreate) -> StaffUser:
        # Hashing outside the mutation lock avoids blocking queue work during scrypt.
        encoded = hash_password(request.password)
        with self.lock:
            if any(r.user.username == request.username for r in self.users.values()):
                raise HTTPException(409, "Username already taken")
            user = StaffUser(id=new_id(), **request.model_dump(exclude={"password"}))
            self.users[user.id] = UserRecord(user, encoded)
            return user.model_copy(deep=True)

    def stats(self) -> Stats:
        with self.lock:
            # Use UTC for reproducible server-local day boundaries in this demo.
            today = self.clock().astimezone(timezone.utc).date()
            tickets = [t for t in self.tickets.values() if t.createdAt.astimezone(timezone.utc).date() == today]

            def average(items: list[Ticket]) -> float | None:
                samples = [(t.calledAt - t.createdAt).total_seconds() / 60 for t in items if t.calledAt is not None]
                return math.floor(sum(samples) / len(samples) * 10 + 0.5) / 10 if samples else None

            by_service = []
            for service in self.services.values():
                group = [t for t in tickets if t.serviceId == service.id]
                by_service.append(ServiceStats(serviceId=service.id, serviceName=service.name,
                    total=len(group), waiting=sum(t.status == "waiting" for t in group),
                    completed=sum(t.status == "completed" for t in group),
                    noShows=sum(t.status == "no_show" for t in group),
                    cancelled=sum(t.status == "cancelled" for t in group), avgWaitMinutes=average(group)))
            return Stats(totalToday=len(tickets), waitingNow=sum(t.status == "waiting" for t in self.tickets.values()),
                         completedToday=sum(t.status == "completed" for t in tickets), avgWaitMinutes=average(tickets),
                         byService=by_service,
                         byHour=[HourlyStats(hour=h, count=sum(t.createdAt.astimezone(timezone.utc).hour == h for t in tickets)) for h in range(24)])


def get_store(request: Request) -> MemoryStore:
    return request.app.state.store

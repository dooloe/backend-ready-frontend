"""Transactional SQLAlchemy store; routers only exchange public Pydantic models."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import math
import secrets

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .auth import hash_password, token_hash, verify_password
from .database import Database, configured_database_url
from .models import (
    Counter, CounterCreate, HourlyStats, JoinQueueRequest, LoginRequest, LoginResponse,
    QueueView, Service, ServiceCreate, ServiceStats, StaffCreate, StaffUser, Stats,
    Ticket, TicketView,
)
from .orm import ActiveTicketRow, CounterRow, CounterServiceRow, ServiceRow, SessionRow, StoreState, TicketRow, UserRow


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return secrets.token_urlsafe(18)


# Unknown usernames still perform the same expensive password verification.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


class DatabaseStore:
    def __init__(self, database_url: str | None = None, *, seed_demo: bool = True,
                 seed_tickets: bool = True, clock: Callable[[], datetime] = utc_now):
        self.db = Database(configured_database_url() if database_url is None else database_url)
        self.clock = clock
        try:
            self.db.create_schema()
            self._initialize(seed_demo, seed_tickets)
        except Exception:
            self.db.close()
            raise

    def close(self):
        self.db.close()

    def _initialize(self, seed_demo: bool, seed_tickets: bool):
        # Concurrent initializers can race on the singleton insert on a future
        # row-locking engine. Its unique key decides a winner; the loser retries.
        for attempt in range(2):
            try:
                with self.db.session(write=True) as session:
                    state = session.get(StoreState, 1)
                    if state is None:
                        state = StoreState(id=1, initialized=False)
                        session.add(state)
                        session.flush()
                    if not state.initialized:
                        if seed_demo:
                            self._seed(session, seed_tickets)
                        state.initialized = True
                return
            except IntegrityError:
                if attempt:
                    raise

    def _seed(self, session, seed_tickets: bool):
        for user_id, name, username, role, password in [
            ("stf-admin", "Admin", "admin", "admin", "admin123"),
            ("stf-aigerim", "Aigerim S.", "aigerim", "staff", "staff123"),
        ]:
            session.add(UserRow(id=user_id, name=name, username=username, role=role, password_hash=hash_password(password)))
        session.flush()
        for item in [
            ServiceRow(id="svc-reg", name="Registrar Office", description="Documents, transcripts, enrollment", prefix="A", isOpen=True, avgServiceMinutes=6),
            ServiceRow(id="svc-fin", name="Finance & Payments", description="Tuition, scholarships, refunds", prefix="B", isOpen=True, avgServiceMinutes=8),
            ServiceRow(id="svc-it", name="IT Help Desk", description="Accounts, Wi-Fi, devices", prefix="C", isOpen=False, avgServiceMinutes=10),
        ]:
            session.add(item)
        session.flush()
        session.add_all([
            CounterRow(id="cnt-1", name="Counter 1", isActive=True, staffId="stf-aigerim"),
            CounterRow(id="cnt-2", name="Counter 2", isActive=True, staffId=None),
        ])
        session.flush()
        session.add_all([CounterServiceRow(counter_id=c, service_id=s) for c, s in [
            ("cnt-1", "svc-reg"), ("cnt-2", "svc-reg"), ("cnt-2", "svc-fin")]])
        if seed_tickets:
            now = self.clock()
            for service_id, name, age, status in [
                ("svc-reg", "Demo completed", 30, "completed"),
                ("svc-reg", "Demo customer", 5, "waiting"),
                ("svc-fin", "Demo finance customer", 3, "waiting"),
                ("svc-fin", "Demo cancelled", 10, "cancelled"),
            ]:
                ticket = self._issue(session, session.get(ServiceRow, service_id), name, now - timedelta(minutes=age))
                ticket.status = status
                if status == "completed":
                    ticket.counterId = "cnt-1"
                    ticket.calledAt = ticket.createdAt + timedelta(minutes=4)
                    ticket.servedAt = ticket.calledAt + timedelta(minutes=1)
                    ticket.finishedAt = ticket.servedAt + timedelta(minutes=6)
                elif status == "cancelled":
                    ticket.finishedAt = ticket.createdAt + timedelta(minutes=1)

    @staticmethod
    def _get(session, model, key: str, kind: str):
        row = session.get(model, key)
        if row is None or getattr(row, "deleted", False):
            raise HTTPException(404, f"{kind} not found")
        return row

    @staticmethod
    def _ticket_row(session, ticket_id: str):
        row = session.scalar(select(TicketRow).where(TicketRow.id == ticket_id))
        if row is None:
            raise HTTPException(404, "Ticket not found")
        return row

    @staticmethod
    def _service(row) -> Service:
        return Service.model_validate(row, from_attributes=True)

    @staticmethod
    def _user(row) -> StaffUser:
        return StaffUser.model_validate(row, from_attributes=True)

    @staticmethod
    def _counter(session, row) -> Counter:
        ids = list(session.scalars(select(CounterServiceRow.service_id).where(
            CounterServiceRow.counter_id == row.id).order_by(CounterServiceRow.service_id)))
        return Counter(id=row.id, name=row.name, serviceIds=ids, isActive=row.isActive, staffId=row.staffId)

    def login(self, request: LoginRequest) -> LoginResponse:
        with self.db.session(write=True) as session:
            row = session.scalar(select(UserRow).where(UserRow.username == request.username))
            valid = verify_password(request.password, row.password_hash if row else _DUMMY_PASSWORD_HASH)
            if row is None or not valid:
                raise HTTPException(401, "Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
            token = secrets.token_urlsafe(32)
            session.add(SessionRow(token_hash=token_hash(token), user_id=row.id,
                                   expires_at=self.clock() + timedelta(hours=8)))
            return LoginResponse(token=token, user=self._user(row))

    def authenticate(self, token: str) -> StaffUser | None:
        with self.db.session(write=True) as session:
            row = session.get(SessionRow, token_hash(token))
            if row is None:
                return None
            if row.expires_at <= self.clock():
                session.delete(row)
                return None
            user = session.get(UserRow, row.user_id)
            return self._user(user) if user else None

    def list_services(self) -> list[Service]:
        with self.db.session() as session:
            return [self._service(row) for row in session.scalars(
                select(ServiceRow).where(ServiceRow.deleted.is_(False)).order_by(ServiceRow.id))]

    def list_counters(self) -> list[Counter]:
        with self.db.session() as session:
            return [self._counter(session, row) for row in session.scalars(
                select(CounterRow).where(CounterRow.deleted.is_(False)).order_by(CounterRow.id))]

    def list_staff(self) -> list[StaffUser]:
        with self.db.session() as session:
            return [self._user(row) for row in session.scalars(select(UserRow).order_by(UserRow.id))]

    @staticmethod
    def _issue(session, service, name: str, created: datetime):
        service.next_sequence += 1
        ticket = TicketRow(id=new_id(), code=f"{service.prefix}-{service.next_sequence:03d}",
                           serviceId=service.id, sequence=service.next_sequence, customerName=name,
                           status="waiting", createdAt=created)
        session.add(ticket)
        session.flush()
        return ticket

    @staticmethod
    def _waiting(session, service_ids: list[str]):
        return list(session.scalars(select(TicketRow).where(
            TicketRow.status == "waiting", TicketRow.serviceId.in_(service_ids)
        ).order_by(TicketRow.createdAt, TicketRow.ordinal)))

    def _view(self, session, ticket) -> TicketView:
        service = session.get(ServiceRow, ticket.serviceId)
        counter = session.get(CounterRow, ticket.counterId) if ticket.counterId else None
        position = estimate = None
        if ticket.status == "waiting":
            waiting = self._waiting(session, [ticket.serviceId])
            position = next(i + 1 for i, row in enumerate(waiting) if row.id == ticket.id)
            active = session.scalar(select(func.count()).select_from(CounterRow).join(
                CounterServiceRow, CounterServiceRow.counter_id == CounterRow.id).where(
                CounterRow.deleted.is_(False), CounterRow.isActive.is_(True), CounterServiceRow.service_id == ticket.serviceId))
            if active:
                estimate = math.ceil((position - 1) * (service.avgServiceMinutes if service and not service.deleted else 5) / active)
        return TicketView(**Ticket.model_validate(ticket, from_attributes=True).model_dump(),
                          serviceName=service.name if service and not service.deleted else "Unknown",
                          counterName=counter.name if counter and not counter.deleted else None,
                          position=position, estimatedWaitMinutes=estimate)

    def join(self, request: JoinQueueRequest) -> TicketView:
        with self.db.session(write=True) as session:
            service = self._get(session, ServiceRow, request.serviceId, "Service")
            if not service.isOpen:
                raise HTTPException(409, "This queue is closed")
            return self._view(session, self._issue(session, service, request.customerName, self.clock()))

    def ticket(self, ticket_id: str) -> TicketView:
        with self.db.session() as session:
            return self._view(session, self._ticket_row(session, ticket_id))

    def cancel(self, ticket_id: str) -> TicketView:
        with self.db.session(write=True) as session:
            ticket = self._ticket_row(session, ticket_id)
            if ticket.status != "waiting":
                raise HTTPException(409, "Only waiting tickets can be cancelled")
            ticket.status, ticket.finishedAt = "cancelled", self.clock()
            session.flush()
            return self._view(session, ticket)

    def queue(self, counter_id: str) -> QueueView:
        with self.db.session() as session:
            counter = self._get(session, CounterRow, counter_id, "Counter")
            claim = session.get(ActiveTicketRow, counter_id)
            current = self._ticket_row(session, claim.ticket_id) if claim else None
            ids = list(session.scalars(select(CounterServiceRow.service_id).where(CounterServiceRow.counter_id == counter.id)))
            return QueueView(current=self._view(session, current) if current else None,
                             waiting=[self._view(session, row) for row in self._waiting(session, ids)])

    def call_next(self, counter_id: str) -> TicketView | None:
        with self.db.session(write=True) as session:
            counter = self._get(session, CounterRow, counter_id, "Counter")
            if not counter.isActive:
                raise HTTPException(409, "Counter is inactive")
            if session.get(ActiveTicketRow, counter_id) is not None:
                raise HTTPException(409, "Finish the current ticket first")
            ids = list(session.scalars(select(CounterServiceRow.service_id).where(CounterServiceRow.counter_id == counter_id)))
            waiting = self._waiting(session, ids)
            if not waiting:
                return None
            ticket = waiting[0]
            ticket.status, ticket.counterId, ticket.calledAt = "called", counter_id, self.clock()
            session.add(ActiveTicketRow(counter_id=counter_id, ticket_id=ticket.id))
            session.flush()
            return self._view(session, ticket)

    def transition(self, ticket_id: str, action: str) -> TicketView:
        rules = {"start": (("called",), "serving", "servedAt"),
                 "complete": (("called", "serving"), "completed", "finishedAt"),
                 "no-show": (("called",), "no_show", "finishedAt")}
        with self.db.session(write=True) as session:
            ticket = self._ticket_row(session, ticket_id)
            allowed, target, timestamp = rules[action]
            if ticket.status not in allowed:
                raise HTTPException(409, f"Ticket is {ticket.status}")
            ticket.status = target
            setattr(ticket, timestamp, self.clock())
            if target in ("completed", "no_show"):
                session.execute(delete(ActiveTicketRow).where(ActiveTicketRow.ticket_id == ticket_id))
            session.flush()
            return self._view(session, ticket)

    def create_service(self, request: ServiceCreate) -> Service:
        with self.db.session(write=True) as session:
            row = ServiceRow(id=new_id(), **request.model_dump())
            session.add(row)
            session.flush()
            return self._service(row)

    def update_service(self, service_id: str, patch: dict) -> Service:
        with self.db.session(write=True) as session:
            row = self._get(session, ServiceRow, service_id, "Service")
            updated = Service(**(self._service(row).model_dump() | patch))
            for key in patch:
                setattr(row, key, getattr(updated, key))
            return updated

    def delete_service(self, service_id: str) -> None:
        with self.db.session(write=True) as session:
            row = session.get(ServiceRow, service_id)
            if row is not None:
                row.deleted = True
                session.execute(delete(CounterServiceRow).where(CounterServiceRow.service_id == service_id))

    @staticmethod
    def _validate_counter_links(session, counter: CounterCreate):
        for key in counter.serviceIds:
            row = session.get(ServiceRow, key)
            if row is None or row.deleted:
                raise HTTPException(422, "Unknown service in serviceIds")
        if counter.staffId is not None and session.get(UserRow, counter.staffId) is None:
            raise HTTPException(422, "Unknown staffId")

    @staticmethod
    def _replace_links(session, counter_id, service_ids):
        session.execute(delete(CounterServiceRow).where(CounterServiceRow.counter_id == counter_id))
        session.add_all([CounterServiceRow(counter_id=counter_id, service_id=key) for key in dict.fromkeys(service_ids)])
        session.flush()

    def create_counter(self, request: CounterCreate) -> Counter:
        with self.db.session(write=True) as session:
            self._validate_counter_links(session, request)
            row = CounterRow(id=new_id(), **request.model_dump(exclude={"serviceIds"}))
            session.add(row)
            session.flush()
            self._replace_links(session, row.id, request.serviceIds)
            return self._counter(session, row)

    def update_counter(self, counter_id: str, patch: dict) -> Counter:
        with self.db.session(write=True) as session:
            row = self._get(session, CounterRow, counter_id, "Counter")
            updated = Counter(**(self._counter(session, row).model_dump() | patch))
            self._validate_counter_links(session, updated)
            for key in patch:
                if key != "serviceIds":
                    setattr(row, key, getattr(updated, key))
            if "serviceIds" in patch:
                self._replace_links(session, counter_id, updated.serviceIds)
            session.flush()
            return self._counter(session, row)

    def delete_counter(self, counter_id: str) -> None:
        with self.db.session(write=True) as session:
            row = session.get(CounterRow, counter_id)
            if row is not None:
                row.deleted = True
                session.execute(delete(CounterServiceRow).where(CounterServiceRow.counter_id == counter_id))

    def create_staff(self, request: StaffCreate) -> StaffUser:
        encoded = hash_password(request.password)
        try:
            with self.db.session(write=True) as session:
                if session.scalar(select(UserRow.id).where(UserRow.username == request.username)):
                    raise HTTPException(409, "Username already taken")
                row = UserRow(id=new_id(), password_hash=encoded, **request.model_dump(exclude={"password"}))
                session.add(row)
                session.flush()
                return self._user(row)
        except IntegrityError as exc:
            raise HTTPException(409, "Username already taken") from exc

    def stats(self) -> Stats:
        with self.db.session() as session:
            now = self.clock().astimezone(timezone.utc)
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            tickets = list(session.scalars(select(TicketRow).where(TicketRow.createdAt >= start, TicketRow.createdAt < start + timedelta(days=1))))

            def average(items):
                samples = [(row.calledAt - row.createdAt).total_seconds() / 60 for row in items if row.calledAt is not None]
                return math.floor(sum(samples) / len(samples) * 10 + 0.5) / 10 if samples else None

            by_service = []
            for service in session.scalars(select(ServiceRow).where(ServiceRow.deleted.is_(False)).order_by(ServiceRow.id)):
                group = [row for row in tickets if row.serviceId == service.id]
                by_service.append(ServiceStats(serviceId=service.id, serviceName=service.name,
                    total=len(group), waiting=sum(row.status == "waiting" for row in group),
                    completed=sum(row.status == "completed" for row in group),
                    noShows=sum(row.status == "no_show" for row in group),
                    cancelled=sum(row.status == "cancelled" for row in group), avgWaitMinutes=average(group)))
            waiting = session.scalar(select(func.count()).select_from(TicketRow).where(TicketRow.status == "waiting"))
            return Stats(totalToday=len(tickets), waitingNow=waiting,
                         completedToday=sum(row.status == "completed" for row in tickets), avgWaitMinutes=average(tickets),
                         byService=by_service,
                         byHour=[HourlyStats(hour=h, count=sum(row.createdAt.hour == h for row in tickets)) for h in range(24)])


def get_store(request: Request) -> DatabaseStore:
    return request.app.state.store

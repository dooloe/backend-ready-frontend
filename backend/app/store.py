"""Transactional SQLAlchemy store; routers only exchange public Pydantic models."""

from collections.abc import Callable
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import math
import re
import secrets

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .auth import hash_password, token_hash, verify_password
from .database import Database, configured_database_url
from .models import (
    Counter, CounterCreate, HourlyStats, JoinQueueRequest, LoginRequest, LoginResponse,
    IssuedTicket, JoinResponse, Organization, PublicService, QueueSummary, QueueView, Service, ServiceCreate, ServiceStats, ServiceSummary, StaffCreate, StaffUser, Stats,
    Ticket, TicketView,
)
from .scheduling import QueueSchedule, resolve_queue_schedule
from .orm import (ActiveTicketRow, CounterRow, CounterServiceRow, OrganizationRow,
                  DailyQueueRow, ServiceRow, SessionRow, StaffAssignmentRow, StoreState,
                  TicketEventRow, TicketRow, UserRow)

DEFAULT_ORGANIZATION_ID = "org-demo"


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
        if session.get(OrganizationRow, DEFAULT_ORGANIZATION_ID) is None:
            session.add(OrganizationRow(id=DEFAULT_ORGANIZATION_ID, name="Kezek Demo", slug="kezek-demo",
                                        description="Demo queue organization", timezone="Asia/Almaty"))
            session.flush()
        for user_id, name, username, role, password in [
            ("stf-admin", "Admin", "admin", "admin", "admin123"),
            ("stf-aigerim", "Aigerim S.", "aigerim", "staff", "staff123"),
        ]:
            session.add(UserRow(id=user_id, organization_id=DEFAULT_ORGANIZATION_ID, name=name,
                                username=username, email=f"{username}@example.invalid", role=role,
                                password_hash=hash_password(password), is_active=True))
        session.flush()
        for item in [
            ServiceRow(id="svc-reg", organization_id=DEFAULT_ORGANIZATION_ID, name="Registrar Office", description="Documents, transcripts, enrollment", prefix="A", isOpen=True, avgServiceMinutes=6, durationMinutes=6, isActive=True),
            ServiceRow(id="svc-fin", organization_id=DEFAULT_ORGANIZATION_ID, name="Finance & Payments", description="Tuition, scholarships, refunds", prefix="B", isOpen=True, avgServiceMinutes=8, durationMinutes=8, isActive=True),
            ServiceRow(id="svc-it", organization_id=DEFAULT_ORGANIZATION_ID, name="IT Help Desk", description="Accounts, Wi-Fi, devices", prefix="C", isOpen=False, avgServiceMinutes=10, durationMinutes=10, isActive=False),
        ]:
            session.add(item)
        session.flush()
        session.add_all([
            CounterRow(id="cnt-1", organization_id=DEFAULT_ORGANIZATION_ID, name="Counter 1", isActive=True, staffId="stf-aigerim"),
            CounterRow(id="cnt-2", organization_id=DEFAULT_ORGANIZATION_ID, name="Counter 2", isActive=True, staffId=None),
        ])
        session.flush()
        session.add_all([CounterServiceRow(organization_id=DEFAULT_ORGANIZATION_ID, counter_id=c, service_id=s) for c, s in [
            ("cnt-1", "svc-reg"), ("cnt-2", "svc-reg"), ("cnt-2", "svc-fin")]])
        session.add(StaffAssignmentRow(organization_id=DEFAULT_ORGANIZATION_ID, user_id="stf-aigerim", counter_id="cnt-1"))
        if seed_tickets:
            now = self.clock()
            for service_id, name, age, status in [
                ("svc-reg", "Demo completed", 30, "completed"),
                ("svc-reg", "Demo customer", 5, "waiting"),
                ("svc-fin", "Demo finance customer", 3, "waiting"),
                ("svc-fin", "Demo cancelled", 10, "cancelled"),
            ]:
                ticket = self._issue(session, session.get(ServiceRow, service_id), name, now - timedelta(minutes=age))
                self._attach_daily_ticket(session, session.get(ServiceRow, service_id), ticket, ticket.createdAt)
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
            if row is None or not row.is_active or not valid:
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
            if user is None or not user.is_active:
                session.delete(row)
                return None
            return self._user(user)

    def list_organizations(self) -> list[Organization]:
        # Public aggregates deliberately contain no ticket IDs or visitor data.
        with self.db.session() as session:
            now = self.clock()
            result = []
            for org in session.scalars(select(OrganizationRow).order_by(OrganizationRow.name)):
                services = []
                for row in session.scalars(select(ServiceRow).where(
                    ServiceRow.organization_id == org.id, ServiceRow.deleted.is_(False))):
                    count = session.scalar(select(func.count()).select_from(TicketRow).where(
                        TicketRow.serviceId == row.id, TicketRow.status == "waiting"))
                    capacity = session.scalar(select(func.count()).select_from(CounterRow).join(
                        CounterServiceRow, CounterServiceRow.counter_id == CounterRow.id).where(
                        CounterServiceRow.service_id == row.id, CounterRow.deleted.is_(False),
                        CounterRow.isActive.is_(True)))
                    try:
                        _, _, is_open = self._queue_state(session, row, now)
                    except HTTPException as exc:
                        if exc.status_code != 422:
                            raise
                        is_open = False
                    services.append(PublicService(**(self._service(row).model_dump() | {"isOpen": is_open}), waitingCount=count,
                        estimatedWaitMinutes=math.ceil(count * row.avgServiceMinutes / capacity) if capacity and is_open else None,
                        operatingHours=f"{row.opensAt:%H:%M}–{row.closesAt:%H:%M}" if row.opensAt and row.closesAt else None))
                result.append(Organization(id=org.id, name=org.name, slug=org.slug, description=org.description,
                    category=org.category, location=org.location, timezone=org.timezone, services=services))
            return result

    def list_organization_services(self, organization_id: str) -> list[ServiceSummary]:
        with self.db.session(write=True) as session:
            organization = session.get(OrganizationRow, organization_id)
            if organization is None:
                raise HTTPException(404, "Organization not found")
            now = self.clock()
            summaries = []
            services = session.scalars(select(ServiceRow).where(
                ServiceRow.organization_id == organization_id,
                ServiceRow.deleted.is_(False), ServiceRow.isActive.is_(True),
            ).order_by(ServiceRow.name, ServiceRow.id))
            for service in services:
                try:
                    schedule = resolve_queue_schedule(
                        organization.timezone, service.opensAt, service.closesAt, now,
                    )
                except ValueError:
                    # Keep a misconfigured service discoverable but unavailable;
                    # without a valid local date there is no queue to expose.
                    summaries.append(ServiceSummary(
                        id=service.id, organizationId=organization_id, name=service.name,
                        description=service.description, prefix=service.prefix,
                        durationMinutes=service.durationMinutes, opensAt=self._format_time(service.opensAt),
                        closesAt=self._format_time(service.closesAt), timezone=organization.timezone,
                        queue=None,
                    ))
                    continue
                queue = session.scalar(select(DailyQueueRow).where(
                    DailyQueueRow.organization_id == organization_id,
                    DailyQueueRow.service_id == service.id,
                    DailyQueueRow.business_date == schedule.business_date,
                ))
                if queue is None:
                    queue = DailyQueueRow(
                        id=new_id(), organization_id=organization_id,
                        service_id=service.id, business_date=schedule.business_date,
                        status="open", opened_at=now, closed_at=None,
                        ticket_prefix=service.prefix,
                    )
                    session.add(queue)
                    session.flush()
                is_open = service.isOpen and schedule.within_hours and queue.status == "open"
                waiting = session.scalar(select(func.count()).select_from(TicketRow).where(
                    TicketRow.dailyQueueId == queue.id, TicketRow.status == "waiting",
                )) or 0
                capacity = session.scalar(select(func.count()).select_from(CounterRow).join(
                    CounterServiceRow, CounterServiceRow.counter_id == CounterRow.id).where(
                    CounterServiceRow.service_id == service.id,
                    CounterRow.deleted.is_(False), CounterRow.isActive.is_(True),
                )) or 0
                summaries.append(ServiceSummary(
                    id=service.id, organizationId=organization_id, name=service.name,
                    description=service.description, prefix=service.prefix,
                    durationMinutes=service.durationMinutes,
                    opensAt=self._format_time(service.opensAt), closesAt=self._format_time(service.closesAt),
                    timezone=organization.timezone,
                    queue=QueueSummary(
                        id=queue.id, serviceId=service.id, queueDate=queue.business_date,
                        isOpen=is_open, waiting=waiting, activeCounters=capacity,
                        estimatedWaitMinutes=math.ceil(waiting * service.avgServiceMinutes / capacity) if capacity else None,
                    ),
                ))
            return summaries

    @staticmethod
    def _format_time(value):
        return value.strftime("%H:%M") if value else None

    def queue_status(self, queue_id: str) -> QueueSummary:
        with self.db.session() as session:
            queue = session.get(DailyQueueRow, queue_id)
            if queue is None:
                raise HTTPException(404, "Queue not found")
            service = session.get(ServiceRow, queue.service_id)
            organization = session.get(OrganizationRow, queue.organization_id)
            if service is None or organization is None:
                raise HTTPException(404, "Queue not found")
            now = self.clock()
            try:
                schedule = resolve_queue_schedule(
                    organization.timezone, service.opensAt, service.closesAt, now,
                )
            except ValueError:
                is_open = False
            else:
                is_open = (
                    not service.deleted and service.isActive and service.isOpen
                    and queue.business_date == schedule.business_date
                    and schedule.within_hours and queue.status == "open"
                )
            waiting = session.scalar(select(func.count()).select_from(TicketRow).where(
                TicketRow.dailyQueueId == queue.id, TicketRow.status == "waiting",
            )) or 0
            capacity = session.scalar(select(func.count()).select_from(CounterRow).join(
                CounterServiceRow, CounterServiceRow.counter_id == CounterRow.id).where(
                CounterServiceRow.organization_id == queue.organization_id,
                CounterServiceRow.service_id == queue.service_id,
                CounterRow.organization_id == queue.organization_id,
                CounterRow.deleted.is_(False), CounterRow.isActive.is_(True),
            )) or 0
            return QueueSummary(
                id=queue.id, serviceId=queue.service_id, queueDate=queue.business_date,
                isOpen=is_open, waiting=waiting, activeCounters=capacity,
                estimatedWaitMinutes=math.ceil(waiting * service.avgServiceMinutes / capacity) if capacity else None,
            )

    def list_services(self) -> list[Service]:
        with self.db.session() as session:
            return [self._service(row) for row in session.scalars(
                select(ServiceRow).where(ServiceRow.deleted.is_(False)).order_by(ServiceRow.id))]

    @staticmethod
    def _actor_row(session, actor: StaffUser, *, admin: bool = False) -> UserRow:
        row = session.get(UserRow, actor.id) if actor is not None else None
        if row is None or not row.is_active:
            raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
        if admin and row.role != "admin":
            raise HTTPException(403, "Admins only")
        if row.role not in {"staff", "admin"}:
            raise HTTPException(403, "Role is not allowed")
        return row

    @staticmethod
    def _organization_row(session, model, key: str, kind: str, organization_id: str):
        row = session.get(model, key)
        if row is None or getattr(row, "deleted", False) or row.organization_id != organization_id:
            raise HTTPException(404, f"{kind} not found")
        return row

    def list_counters(self, actor: StaffUser) -> list[Counter]:
        with self.db.session() as session:
            actor_row = self._actor_row(session, actor)
            query = select(CounterRow).where(
                CounterRow.organization_id == actor_row.organization_id,
                CounterRow.deleted.is_(False),
            )
            if actor_row.role != "admin":
                query = query.join(
                    StaffAssignmentRow,
                    StaffAssignmentRow.counter_id == CounterRow.id,
                ).where(
                    StaffAssignmentRow.organization_id == actor_row.organization_id,
                    StaffAssignmentRow.user_id == actor_row.id,
                    CounterRow.isActive.is_(True),
                )
            return [self._counter(session, row) for row in session.scalars(query.order_by(CounterRow.id))]

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
            now = self.clock()
            _, queue, is_open = self._queue_state(session, service, now, create=True)
            if not is_open:
                raise HTTPException(409, "This queue is closed")
            ticket = self._issue(session, service, request.customerName, now)
            self._attach_daily_ticket(session, service, ticket, now, queue=queue)
            return self._view(session, ticket)

    @classmethod
    def _attach_daily_ticket(cls, session, service, ticket, created, *, queue=None):
        if queue is None:
            _, queue, _ = cls._queue_state(session, service, created, create=True)
        if queue is None:
            return
        number = (session.scalar(select(func.max(TicketRow.dailyNumber)).where(
            TicketRow.dailyQueueId == queue.id)) or 0) + 1
        ticket.dailyQueueId = queue.id
        ticket.dailyNumber = number
        ticket.code = f"{queue.ticket_prefix}-{number:03d}"
        session.add(TicketEventRow(
            id=new_id(), ticket_id=ticket.id, event_type="issued", occurred_at=created,
        ))
        session.flush()

    @staticmethod
    def _valid_proof(value: str) -> bool:
        if not isinstance(value, str) or re.fullmatch(r"[A-Za-z0-9_-]{43}", value) is None:
            return False
        try:
            raw = base64.urlsafe_b64decode(value + "=")
        except (ValueError, base64.binascii.Error):
            return False
        return len(raw) == 32 and base64.urlsafe_b64encode(raw).decode().rstrip("=") == value

    def issue_ticket(self, queue_id: str, idempotency_key: str, access_token: str) -> tuple[JoinResponse, bool]:
        if not self._valid_proof(idempotency_key) or not self._valid_proof(access_token):
            raise HTTPException(422, "Invalid ticket proof")
        key_hash = hashlib.sha256(idempotency_key.encode("ascii")).hexdigest()
        access_hash = hashlib.sha256(access_token.encode("ascii")).hexdigest()
        with self.db.session(write=True) as session:
            # Idempotency is checked before current availability so an uncertain
            # response can be recovered after closure or a local date change.
            existing = session.scalar(select(TicketRow).where(
                TicketRow.dailyQueueId == queue_id,
                TicketRow.idempotencyKeyHash == key_hash,
            ))
            if existing is not None:
                if not hmac.compare_digest(existing.accessTokenHash or "", access_hash):
                    raise HTTPException(409, "Idempotency key conflicts with this ticket")
                return self._issued_view(session, existing, access_token), False

            queue = session.get(DailyQueueRow, queue_id)
            if queue is None:
                raise HTTPException(404, "Queue not found")
            service = session.get(ServiceRow, queue.service_id)
            if service is None or service.deleted or service.organization_id != queue.organization_id:
                raise HTTPException(404, "Queue not found")
            now = self.clock()
            schedule, current_queue, is_open = self._queue_state(session, service, now)
            if (not is_open or current_queue is None or current_queue.id != queue_id
                    or queue.status != "open" or queue.business_date != schedule.business_date):
                raise HTTPException(409, "This queue is closed")
            if session.scalar(select(TicketRow.id).where(TicketRow.accessTokenHash == access_hash)) is not None:
                raise HTTPException(409, "Ticket access token has already been used")

            number = (session.scalar(select(func.max(TicketRow.dailyNumber)).where(
                TicketRow.dailyQueueId == queue_id)) or 0) + 1
            service.next_sequence += 1
            ticket = TicketRow(
                id=new_id(), serviceId=service.id, dailyQueueId=queue_id,
                dailyNumber=number, accessTokenHash=access_hash,
                idempotencyKeyHash=key_hash, sequence=service.next_sequence,
                code=f"{queue.ticket_prefix}-{number:03d}", customerName="Visitor",
                status="waiting", createdAt=now,
            )
            session.add(ticket)
            session.flush()
            session.add(TicketEventRow(
                id=new_id(), ticket_id=ticket.id, event_type="issued", occurred_at=now,
            ))
            session.flush()
            return self._issued_view(session, ticket, access_token), True

    def _issued_view(self, session, ticket: TicketRow, access_token: str) -> JoinResponse:
        service = session.get(ServiceRow, ticket.serviceId)
        counter = session.get(CounterRow, ticket.counterId) if ticket.counterId else None
        waiting = list(session.scalars(select(TicketRow).where(
            TicketRow.dailyQueueId == ticket.dailyQueueId,
            TicketRow.status == "waiting",
        ).order_by(TicketRow.dailyNumber)))
        position = next((index + 1 for index, row in enumerate(waiting) if row.id == ticket.id), None)
        capacity = session.scalar(select(func.count()).select_from(CounterRow).join(
            CounterServiceRow, CounterServiceRow.counter_id == CounterRow.id).where(
            CounterServiceRow.service_id == ticket.serviceId,
            CounterRow.deleted.is_(False), CounterRow.isActive.is_(True)))
        estimate = math.ceil((position - 1) * service.avgServiceMinutes / capacity) if (
            position is not None and capacity and service is not None) else None
        item = IssuedTicket(
            id=ticket.id, queueId=ticket.dailyQueueId, ticketNumber=ticket.code,
            serviceName=service.name if service else "Unknown", status=ticket.status,
            position=position, estimatedWaitMinutes=estimate, counterId=ticket.counterId,
            counterName=counter.name if counter else None, createdAt=ticket.createdAt,
            calledAt=ticket.calledAt, startedAt=ticket.servedAt,
            completedAt=ticket.finishedAt if ticket.status == "completed" else None,
            cancelledAt=ticket.finishedAt if ticket.status == "cancelled" else None,
            noShowAt=ticket.finishedAt if ticket.status == "no_show" else None,
        )
        return JoinResponse(ticket=item, ticketUrl=f"/ticket/{access_token}")

    @staticmethod
    def _queue_state(session, service: ServiceRow, instant: datetime, *, create: bool = False):
        organization = session.get(OrganizationRow, service.organization_id)
        if organization is None:
            raise HTTPException(404, "Organization not found")
        try:
            schedule: QueueSchedule = resolve_queue_schedule(
                organization.timezone, service.opensAt, service.closesAt, instant,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        queue = session.scalar(select(DailyQueueRow).where(
            DailyQueueRow.organization_id == service.organization_id,
            DailyQueueRow.service_id == service.id,
            DailyQueueRow.business_date == schedule.business_date,
        ))
        is_open = (
            service.isActive and service.isOpen and schedule.within_hours
            and (queue is None or queue.status == "open")
        )
        if create and is_open and queue is None:
            queue = DailyQueueRow(
                id=new_id(), organization_id=service.organization_id,
                service_id=service.id, business_date=schedule.business_date,
                status="open", opened_at=instant, closed_at=None,
                ticket_prefix=service.prefix,
            )
            session.add(queue)
            session.flush()
        return schedule, queue, is_open

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

    @staticmethod
    def _authorize_counter(session, counter: CounterRow, actor_row: UserRow, *, require_active: bool = True) -> None:
        if counter.organization_id != actor_row.organization_id:
            raise HTTPException(404, "Counter not found")
        if actor_row.role != "admin" and session.get(StaffAssignmentRow, (actor_row.id, counter.id)) is None:
            raise HTTPException(403, "Counter is not assigned to this staff member")
        if actor_row.role != "admin" and counter.staffId not in (None, actor_row.id):
            raise HTTPException(403, "Counter is not assigned to this staff member")
        if require_active and not counter.isActive:
            raise HTTPException(409, "Counter is inactive")

    def queue(self, counter_id: str, actor: StaffUser) -> QueueView:
        with self.db.session() as session:
            actor_row = self._actor_row(session, actor)
            counter = self._get(session, CounterRow, counter_id, "Counter")
            self._authorize_counter(session, counter, actor_row)
            claim = session.get(ActiveTicketRow, counter_id)
            current = self._ticket_row(session, claim.ticket_id) if claim else None
            ids = list(session.scalars(select(CounterServiceRow.service_id).where(CounterServiceRow.counter_id == counter.id)))
            return QueueView(current=self._view(session, current) if current else None,
                             waiting=[self._view(session, row) for row in self._waiting(session, ids)])

    def call_next(self, counter_id: str, actor: StaffUser) -> TicketView | None:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor)
            counter = self._get(session, CounterRow, counter_id, "Counter")
            self._authorize_counter(session, counter, actor_row)
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

    def transition(self, ticket_id: str, action: str, actor: StaffUser) -> TicketView:
        rules = {"start": (("called",), "serving", "servedAt"),
                 "complete": (("called", "serving"), "completed", "finishedAt"),
                 "no-show": (("called",), "no_show", "finishedAt")}
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor)
            ticket = self._ticket_row(session, ticket_id)
            service = session.get(ServiceRow, ticket.serviceId)
            if service is None or service.organization_id != actor_row.organization_id:
                raise HTTPException(404, "Ticket not found")
            if ticket.counterId is None:
                raise HTTPException(409, "Ticket is not assigned to a counter")
            counter = session.get(CounterRow, ticket.counterId)
            if counter is None:
                raise HTTPException(404, "Counter not found")
            self._authorize_counter(session, counter, actor_row, require_active=False)
            allowed, target, timestamp = rules[action]
            if ticket.status not in allowed:
                raise HTTPException(409, f"Ticket is {ticket.status}")
            ticket.status = target
            setattr(ticket, timestamp, self.clock())
            if target in ("completed", "no_show"):
                session.execute(delete(ActiveTicketRow).where(ActiveTicketRow.ticket_id == ticket_id))
            session.flush()
            return self._view(session, ticket)

    def create_service(self, request: ServiceCreate, actor: StaffUser) -> Service:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            data = request.model_dump()
            row = ServiceRow(id=new_id(), organization_id=actor_row.organization_id,
                             durationMinutes=data["avgServiceMinutes"], isActive=True, **data)
            session.add(row)
            session.flush()
            return self._service(row)

    def update_service(self, service_id: str, patch: dict, actor: StaffUser) -> Service:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            row = self._organization_row(session, ServiceRow, service_id, "Service", actor_row.organization_id)
            updated = Service(**(self._service(row).model_dump() | patch))
            for key in patch:
                setattr(row, key, getattr(updated, key))
            if "avgServiceMinutes" in patch:
                row.durationMinutes = updated.avgServiceMinutes
            return updated

    def delete_service(self, service_id: str, actor: StaffUser) -> None:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            row = session.get(ServiceRow, service_id)
            if row is not None and row.organization_id != actor_row.organization_id:
                raise HTTPException(404, "Service not found")
            if row is not None and not row.deleted:
                row.deleted = True
                session.execute(delete(CounterServiceRow).where(CounterServiceRow.service_id == service_id))

    @staticmethod
    def _validate_counter_links(session, counter: CounterCreate, organization_id: str = DEFAULT_ORGANIZATION_ID):
        for key in counter.serviceIds:
            row = session.get(ServiceRow, key)
            if row is None or row.deleted or row.organization_id != organization_id:
                raise HTTPException(422, "Unknown service in serviceIds")
        staff = session.get(UserRow, counter.staffId) if counter.staffId is not None else None
        if counter.staffId is not None and (staff is None or staff.organization_id != organization_id):
            raise HTTPException(422, "Unknown staffId")

    @staticmethod
    def _replace_links(session, counter_id, service_ids):
        counter = session.get(CounterRow, counter_id)
        session.execute(delete(CounterServiceRow).where(CounterServiceRow.counter_id == counter_id))
        session.add_all([CounterServiceRow(organization_id=counter.organization_id, counter_id=counter_id, service_id=key) for key in dict.fromkeys(service_ids)])
        session.flush()

    def create_counter(self, request: CounterCreate, actor: StaffUser) -> Counter:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            organization_id = actor_row.organization_id
            self._validate_counter_links(session, request, organization_id)
            row = CounterRow(id=new_id(), organization_id=organization_id,
                             **request.model_dump(exclude={"serviceIds"}))
            session.add(row)
            session.flush()
            self._replace_links(session, row.id, request.serviceIds)
            if row.staffId:
                session.add(StaffAssignmentRow(organization_id=row.organization_id,
                                               user_id=row.staffId, counter_id=row.id))
            return self._counter(session, row)

    def update_counter(self, counter_id: str, patch: dict, actor: StaffUser) -> Counter:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            row = self._organization_row(session, CounterRow, counter_id, "Counter", actor_row.organization_id)
            updated = Counter(**(self._counter(session, row).model_dump() | patch))
            self._validate_counter_links(session, updated, row.organization_id)
            for key in patch:
                if key != "serviceIds":
                    setattr(row, key, getattr(updated, key))
                    if key == "staffId":
                        session.execute(delete(StaffAssignmentRow).where(StaffAssignmentRow.counter_id == counter_id))
                        if updated.staffId:
                            session.add(StaffAssignmentRow(organization_id=row.organization_id,
                                                           user_id=updated.staffId, counter_id=counter_id))
            if "serviceIds" in patch:
                self._replace_links(session, counter_id, updated.serviceIds)
            session.flush()
            return self._counter(session, row)

    def delete_counter(self, counter_id: str, actor: StaffUser) -> None:
        with self.db.session(write=True) as session:
            actor_row = self._actor_row(session, actor, admin=True)
            row = session.get(CounterRow, counter_id)
            if row is not None and row.organization_id != actor_row.organization_id:
                raise HTTPException(404, "Counter not found")
            if row is not None and not row.deleted:
                row.deleted = True
                session.execute(delete(CounterServiceRow).where(CounterServiceRow.counter_id == counter_id))

    def create_staff(self, request: StaffCreate, actor: StaffUser) -> StaffUser:
        try:
            with self.db.session(write=True) as session:
                actor_row = self._actor_row(session, actor, admin=True)
                if session.scalar(select(UserRow.id).where(UserRow.username == request.username)):
                    raise HTTPException(409, "Username already taken")
                encoded = hash_password(request.password)
                data = request.model_dump(exclude={"password"})
                row = UserRow(id=new_id(), organization_id=actor_row.organization_id,
                              email=f"{data['username']}@example.invalid", is_active=True,
                              password_hash=encoded, **data)
                session.add(row)
                session.flush()
                return self._user(row)
        except IntegrityError as exc:
            raise HTTPException(409, "Username already taken") from exc

    def list_staff(self, actor: StaffUser) -> list[StaffUser]:
        with self.db.session() as session:
            actor_row = self._actor_row(session, actor, admin=True)
            return [self._user(row) for row in session.scalars(
                select(UserRow).where(UserRow.organization_id == actor_row.organization_id).order_by(UserRow.id)
            )]

    def stats(self, actor: StaffUser) -> Stats:
        with self.db.session() as session:
            actor_row = self._actor_row(session, actor, admin=True)
            now = self.clock().astimezone(timezone.utc)
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            organization_services = select(ServiceRow.id).where(
                ServiceRow.organization_id == actor_row.organization_id,
            )
            tickets = list(session.scalars(select(TicketRow).where(
                TicketRow.serviceId.in_(organization_services),
                TicketRow.createdAt >= start,
                TicketRow.createdAt < start + timedelta(days=1),
            )))

            def average(items):
                samples = [(row.calledAt - row.createdAt).total_seconds() / 60 for row in items if row.calledAt is not None]
                return math.floor(sum(samples) / len(samples) * 10 + 0.5) / 10 if samples else None

            by_service = []
            for service in session.scalars(select(ServiceRow).where(
                ServiceRow.organization_id == actor_row.organization_id,
                ServiceRow.deleted.is_(False),
            ).order_by(ServiceRow.id)):
                group = [row for row in tickets if row.serviceId == service.id]
                by_service.append(ServiceStats(serviceId=service.id, serviceName=service.name,
                    total=len(group), waiting=sum(row.status == "waiting" for row in group),
                    completed=sum(row.status == "completed" for row in group),
                    noShows=sum(row.status == "no_show" for row in group),
                    cancelled=sum(row.status == "cancelled" for row in group), avgWaitMinutes=average(group)))
            waiting = session.scalar(select(func.count()).select_from(TicketRow).join(
                ServiceRow, ServiceRow.id == TicketRow.serviceId).where(
                ServiceRow.organization_id == actor_row.organization_id,
                TicketRow.status == "waiting",
            ))
            return Stats(totalToday=len(tickets), waitingNow=waiting,
                         completedToday=sum(row.status == "completed" for row in tickets), avgWaitMinutes=average(tickets),
                         byService=by_service,
                         byHour=[HourlyStats(hour=h, count=sum(row.createdAt.hour == h for row in tickets)) for h in range(24)])


def get_store(request: Request) -> DatabaseStore:
    return request.app.state.store

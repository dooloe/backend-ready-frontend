"""Public wire models use the frontend's exact camelCase field names."""

from datetime import date, datetime, time
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["staff", "admin"]
TicketStatus = Literal["waiting", "called", "serving", "completed", "cancelled", "no_show"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ServiceCreate(Model):
    name: str
    description: str
    prefix: str
    isOpen: bool
    avgServiceMinutes: float = Field(gt=0)
    isActive: bool = True
    opensAt: time | None = None
    closesAt: time | None = None

    @model_validator(mode="after")
    def require_complete_schedule(self):
        if (self.opensAt is None) != (self.closesAt is None):
            raise ValueError("Both opening and closing hours must be configured")
        return self


class Service(ServiceCreate):
    id: str


class ServiceUpdate(Model):
    # Unset fields are excluded by the router. Explicit null remains invalid.
    name: str = Field(default=None)
    description: str = Field(default=None)
    prefix: str = Field(default=None)
    isOpen: bool = Field(default=None)
    avgServiceMinutes: float = Field(default=None, gt=0)
    isActive: bool = Field(default=None)
    opensAt: time | None = None
    closesAt: time | None = None


class CounterCreate(Model):
    name: str
    serviceIds: list[str]
    isActive: bool
    staffId: str | None


class Counter(CounterCreate):
    id: str


class CounterUpdate(Model):
    name: str = Field(default=None)
    serviceIds: list[str] = Field(default=None)
    isActive: bool = Field(default=None)
    staffId: str | None = None


class StaffUser(Model):
    id: str
    name: str
    username: str
    role: Role
    isActive: bool = Field(default=True, validation_alias="is_active")


class StaffCreate(Model):
    name: str
    username: str
    role: Role
    password: str = Field(repr=False)


class StaffUpdate(Model):
    name: str = Field(default=None, min_length=1)
    username: str = Field(default=None, min_length=1)
    role: Role = Field(default=None)
    isActive: bool = Field(default=None)


class LoginRequest(Model):
    username: str
    password: str = Field(repr=False)


class LoginResponse(Model):
    token: str
    user: StaffUser


class JoinQueueRequest(Model):
    serviceId: str
    customerName: str

    @field_validator("customerName")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value


class AnonymousJoinRequest(Model):
    accessToken: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class PushSubscriptionKeys(Model):
    p256dh: str = Field(pattern=r"^[A-Za-z0-9_-]{80,100}$")
    auth: str = Field(pattern=r"^[A-Za-z0-9_-]{20,30}$")


class PushSubscriptionRequest(Model):
    endpoint: AnyHttpUrl = Field(max_length=2048)
    keys: PushSubscriptionKeys

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_use_https(cls, value):
        if value.scheme != "https" or value.username is not None or value.password is not None:
            raise ValueError("Push endpoint must be HTTPS without embedded credentials")
        host = value.host.lower().rstrip(".")
        if not any(host == suffix or host.endswith("." + suffix)
                   for suffix in ("googleapis.com", "mozilla.com", "apple.com")):
            raise ValueError("Unsupported browser push endpoint")
        return value


class PushEndpointRequest(Model):
    endpoint: AnyHttpUrl = Field(max_length=2048)


class PushConfig(Model):
    enabled: bool
    publicKey: str | None


class QueueCallNextRequest(Model):
    counterId: str = Field(min_length=1, max_length=64)


class IssuedTicket(Model):
    id: str
    queueId: str
    organizationName: str
    ticketNumber: str
    serviceName: str
    status: TicketStatus
    position: int | None
    estimatedWaitMinutes: int | None
    counterId: str | None
    counterName: str | None
    createdAt: datetime
    calledAt: datetime | None
    startedAt: datetime | None
    completedAt: datetime | None
    cancelledAt: datetime | None
    noShowAt: datetime | None


class JoinResponse(Model):
    ticket: IssuedTicket
    ticketUrl: str


class Ticket(Model):
    id: str
    code: str
    serviceId: str
    customerName: str
    status: TicketStatus
    createdAt: datetime
    calledAt: datetime | None
    servedAt: datetime | None
    finishedAt: datetime | None
    counterId: str | None


class TicketView(Ticket):
    serviceName: str
    counterName: str | None
    position: int | None
    estimatedWaitMinutes: int | None


class QueueView(Model):
    current: TicketView | None
    waiting: list[TicketView]


class StaffCurrentTicket(Model):
    id: str
    queueId: str
    ticketNumber: str
    serviceName: str
    status: Literal["called", "serving"]
    position: int | None
    estimatedWaitMinutes: int | None
    counterId: str | None
    counterName: str | None
    createdAt: datetime
    calledAt: datetime | None
    startedAt: datetime | None
    completedAt: datetime | None
    cancelledAt: datetime | None
    noShowAt: datetime | None


class ServiceStats(Model):
    serviceId: str
    serviceName: str
    total: int
    waiting: int
    completed: int
    noShows: int
    cancelled: int
    avgWaitMinutes: float | None


class HourlyStats(Model):
    hour: int
    count: int


class Stats(Model):
    totalToday: int
    waitingNow: int
    completedToday: int
    avgWaitMinutes: float | None
    byService: list[ServiceStats]
    byHour: list[HourlyStats]


class ServiceMetrics(Model):
    serviceId: str
    serviceName: str
    issued: int
    waiting: int
    completed: int
    meanWaitMinutes: float | None
    meanServiceMinutes: float | None


class DayMetrics(Model):
    date: date
    issued: int
    completed: int


class Analytics(Model):
    dateFrom: date
    dateTo: date
    timezone: str
    issued: int
    waiting: int
    completed: int
    meanWaitMinutes: float | None
    meanServiceMinutes: float | None
    byService: list[ServiceMetrics]
    byDay: list[DayMetrics]


class PublicService(Service):
    waitingCount: int
    estimatedWaitMinutes: int | None
    operatingHours: str | None


class QueueSummary(Model):
    id: str
    serviceId: str
    queueDate: date
    isOpen: bool
    waiting: int
    activeCounters: int
    estimatedWaitMinutes: int | None


class QueueOverride(Model):
    isOpen: bool


class StaffCounterQueue(Model):
    counter: Counter
    queues: list[QueueSummary]
    current: StaffCurrentTicket | None


class ServiceSummary(Model):
    id: str
    organizationId: str
    name: str
    description: str
    prefix: str
    durationMinutes: float
    opensAt: str | None
    closesAt: str | None
    timezone: str
    queue: QueueSummary | None


class Organization(Model):
    id: str
    name: str
    slug: str
    description: str
    category: str
    location: str | None
    timezone: str
    services: list[PublicService]

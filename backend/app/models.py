"""Public wire models use the frontend's exact camelCase field names."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class Service(ServiceCreate):
    id: str


class ServiceUpdate(Model):
    # Unset fields are excluded by the router. Explicit null remains invalid.
    name: str = Field(default=None)
    description: str = Field(default=None)
    prefix: str = Field(default=None)
    isOpen: bool = Field(default=None)
    avgServiceMinutes: float = Field(default=None, gt=0)


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


class StaffCreate(Model):
    name: str
    username: str
    role: Role
    password: str = Field(repr=False)


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

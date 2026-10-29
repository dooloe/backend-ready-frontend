"""Database models, separate from the public Pydantic wire models."""

from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, ForeignKeyConstraint,
    Index, Integer, String, Time, UniqueConstraint, text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Round-trip aware UTC timestamps even on databases without timezone storage."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, _dialect):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Database timestamps must be timezone-aware")
            return value.astimezone(timezone.utc)
        return None

    def process_result_value(self, value, _dialect):
        if value is not None:
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return None


class Base(DeclarativeBase):
    pass


class StoreState(Base):
    __tablename__ = "store_state"
    __table_args__ = (CheckConstraint("id = 1", name="singleton_store_state"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    initialized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class OrganizationRow(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="Service Centers", server_default="Service Centers")
    location: Mapped[str | None] = mapped_column(String(255))


class UserRow(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('staff', 'admin')", name="user_role"),
        UniqueConstraint("organization_id", "id", name="unique_user_org_identity"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SessionRow(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    csrf_token_hash: Mapped[str | None] = mapped_column(String(64))


class DailyQueueRow(Base):
    __tablename__ = "daily_queues"
    __table_args__ = (
        CheckConstraint("status IN ('open','closed')", name="daily_queue_status"),
        UniqueConstraint("organization_id", "service_id", "business_date", name="unique_service_business_date"),
        UniqueConstraint("organization_id", "id", name="unique_daily_queue_org_identity"),
        ForeignKeyConstraint(
            ["organization_id", "service_id"], ["services.organization_id", "services.id"],
            ondelete="RESTRICT", name="fk_daily_queue_service_org",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    service_id: Mapped[str] = mapped_column(String(64), nullable=False)
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    ticket_prefix: Mapped[str] = mapped_column(String(32), nullable=False)


class ServiceRow(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("avg_service_minutes > 0", name="positive_service_duration"),
        CheckConstraint("next_sequence >= 0", name="nonnegative_sequence"),
        CheckConstraint("duration_minutes > 0", name="positive_duration_minutes"),
        UniqueConstraint("organization_id", "id", name="unique_service_org_identity"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False)
    isOpen: Mapped[bool] = mapped_column("is_open", Boolean, nullable=False)
    avgServiceMinutes: Mapped[float] = mapped_column("avg_service_minutes", Float, nullable=False)
    durationMinutes: Mapped[float] = mapped_column("duration_minutes", Float, nullable=False)
    opensAt: Mapped[time | None] = mapped_column("opens_at", Time)
    closesAt: Mapped[time | None] = mapped_column("closes_at", Time)
    isActive: Mapped[bool] = mapped_column("is_active", Boolean, default=True, nullable=False)
    next_sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CounterRow(Base):
    __tablename__ = "counters"
    __table_args__ = (UniqueConstraint("organization_id", "id", name="unique_counter_org_identity"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    isActive: Mapped[bool] = mapped_column("is_active", Boolean, nullable=False)
    staffId: Mapped[str | None] = mapped_column("staff_id", ForeignKey("users.id"))
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CounterServiceRow(Base):
    __tablename__ = "counter_services"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "counter_id"], ["counters.organization_id", "counters.id"],
            ondelete="RESTRICT", name="fk_counter_service_counter_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "service_id"], ["services.organization_id", "services.id"],
            ondelete="RESTRICT", name="fk_counter_service_service_org",
        ),
    )

    organization_id: Mapped[str] = mapped_column(String(64), nullable=False)
    counter_id: Mapped[str] = mapped_column(ForeignKey("counters.id"), primary_key=True)
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), primary_key=True)


class StaffAssignmentRow(Base):
    __tablename__ = "staff_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "user_id"], ["users.organization_id", "users.id"],
            ondelete="RESTRICT", name="fk_staff_assignment_user_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "counter_id"], ["counters.organization_id", "counters.id"],
            ondelete="RESTRICT", name="fk_staff_assignment_counter_org",
        ),
    )

    organization_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    counter_id: Mapped[str] = mapped_column(String(64), primary_key=True)


class TicketRow(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("service_id", "sequence", name="unique_service_ticket_sequence"),
        UniqueConstraint("daily_queue_id", "daily_number", name="unique_daily_ticket_number"),
        UniqueConstraint("daily_queue_id", "code", name="unique_daily_ticket_code"),
        UniqueConstraint("daily_queue_id", "idempotency_key_hash", name="unique_queue_idempotency_key_hash"),
        UniqueConstraint("access_token_hash", name="unique_ticket_access_token_hash"),
        ForeignKeyConstraint(
            ["daily_queue_id"], ["daily_queues.id"], ondelete="RESTRICT",
            name="fk_ticket_daily_queue",
        ),
        CheckConstraint("sequence > 0", name="positive_ticket_sequence"),
        CheckConstraint("daily_number IS NULL OR daily_number > 0", name="positive_daily_ticket_number"),
        CheckConstraint("access_token_hash IS NULL OR length(access_token_hash) = 64", name="ticket_access_hash_length"),
        CheckConstraint("idempotency_key_hash IS NULL OR length(idempotency_key_hash) = 64", name="ticket_idempotency_hash_length"),
        CheckConstraint("status IN ('waiting','called','serving','completed','cancelled','no_show')", name="ticket_status"),
        Index("ticket_waiting_order", "service_id", "status", "created_at", "ordinal"),
        Index(
            "unique_active_ticket_per_counter", "counter_id", unique=True,
            sqlite_where=text("status IN ('called', 'serving')"),
            postgresql_where=text("status IN ('called', 'serving')"),
        ),
    )

    # The portable integer key provides stable FIFO tie-breaking across workers.
    ordinal: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    serviceId: Mapped[str] = mapped_column("service_id", ForeignKey("services.id"), nullable=False)
    dailyQueueId: Mapped[str | None] = mapped_column("daily_queue_id", String(64))
    dailyNumber: Mapped[int | None] = mapped_column("daily_number", Integer)
    accessTokenHash: Mapped[str | None] = mapped_column("access_token_hash", String(64))
    idempotencyKeyHash: Mapped[str | None] = mapped_column("idempotency_key_hash", String(64))
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    customerName: Mapped[str] = mapped_column("customer_name", String, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", UTCDateTime(), nullable=False)
    calledAt: Mapped[datetime | None] = mapped_column("called_at", UTCDateTime())
    servedAt: Mapped[datetime | None] = mapped_column("served_at", UTCDateTime())
    finishedAt: Mapped[datetime | None] = mapped_column("finished_at", UTCDateTime())
    counterId: Mapped[str | None] = mapped_column("counter_id", ForeignKey("counters.id"))


class TicketEventRow(Base):
    __tablename__ = "ticket_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('issued','called','started','completed','cancelled','no_show')",
            name="ticket_event_type",
        ),
        Index("ticket_event_history", "ticket_id", "occurred_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="RESTRICT"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(16), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    counter_id: Mapped[str | None] = mapped_column(ForeignKey("counters.id", ondelete="RESTRICT"))


class PushSubscriptionRow(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("ticket_id", "endpoint", name="unique_ticket_push_endpoint"),
        Index("push_subscription_ticket", "ticket_id", "disabled_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(2048), nullable=False)
    p256dh: Mapped[str] = mapped_column(String(256), nullable=False)
    auth: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column("created_at", UTCDateTime(), nullable=False)
    disabled_at: Mapped[datetime | None] = mapped_column("disabled_at", UTCDateTime())


class PushDeliveryRow(Base):
    __tablename__ = "push_deliveries"
    __table_args__ = (UniqueConstraint("event_id", "subscription_id", name="unique_push_event_subscription"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("ticket_events.id", ondelete="CASCADE"), nullable=False)
    subscription_id: Mapped[str] = mapped_column(ForeignKey("push_subscriptions.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column("created_at", UTCDateTime(), nullable=False)


class ActiveTicketRow(Base):
    """Portable uniqueness for a counter's active ticket, without partial indexes."""

    __tablename__ = "active_tickets"

    counter_id: Mapped[str] = mapped_column(ForeignKey("counters.id"), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), unique=True, nullable=False)

"""Database models, separate from the public Pydantic wire models."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
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


class UserRow(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('staff', 'admin')", name="user_role"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class SessionRow(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)


class ServiceRow(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("avg_service_minutes > 0", name="positive_service_duration"),
        CheckConstraint("next_sequence >= 0", name="nonnegative_sequence"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False)
    isOpen: Mapped[bool] = mapped_column("is_open", Boolean, nullable=False)
    avgServiceMinutes: Mapped[float] = mapped_column("avg_service_minutes", Float, nullable=False)
    next_sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CounterRow(Base):
    __tablename__ = "counters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    isActive: Mapped[bool] = mapped_column("is_active", Boolean, nullable=False)
    staffId: Mapped[str | None] = mapped_column("staff_id", ForeignKey("users.id"))
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CounterServiceRow(Base):
    __tablename__ = "counter_services"

    counter_id: Mapped[str] = mapped_column(ForeignKey("counters.id"), primary_key=True)
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), primary_key=True)


class TicketRow(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("service_id", "sequence", name="unique_service_ticket_sequence"),
        CheckConstraint("sequence > 0", name="positive_ticket_sequence"),
        CheckConstraint("status IN ('waiting','called','serving','completed','cancelled','no_show')", name="ticket_status"),
        Index("ticket_waiting_order", "service_id", "status", "created_at", "ordinal"),
    )

    # The portable integer key provides stable FIFO tie-breaking across workers.
    ordinal: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    serviceId: Mapped[str] = mapped_column("service_id", ForeignKey("services.id"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    customerName: Mapped[str] = mapped_column("customer_name", String, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", UTCDateTime(), nullable=False)
    calledAt: Mapped[datetime | None] = mapped_column("called_at", UTCDateTime())
    servedAt: Mapped[datetime | None] = mapped_column("served_at", UTCDateTime())
    finishedAt: Mapped[datetime | None] = mapped_column("finished_at", UTCDateTime())
    counterId: Mapped[str | None] = mapped_column("counter_id", ForeignKey("counters.id"))


class ActiveTicketRow(Base):
    """Portable uniqueness for a counter's active ticket, without partial indexes."""

    __tablename__ = "active_tickets"

    counter_id: Mapped[str] = mapped_column(ForeignKey("counters.id"), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), unique=True, nullable=False)

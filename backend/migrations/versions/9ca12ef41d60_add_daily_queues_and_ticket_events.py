"""Add daily queues, ticket events and private/idempotency hash constraints.

Revision ID: 9ca12ef41d60
Revises: e48f901cd256
"""

from collections import defaultdict
from datetime import date, datetime, timezone
import hashlib
from typing import Sequence, Union
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa

from app.orm import UTCDateTime


revision: str = "9ca12ef41d60"
down_revision: Union[str, None] = "e48f901cd256"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _utc(value) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _queue_id(organization_id: str, service_id: str, business_date: date) -> str:
    identity = f"{organization_id}\0{service_id}\0{business_date.isoformat()}".encode()
    return "dq_" + hashlib.sha256(identity).hexdigest()[:48]


def upgrade() -> None:
    op.create_table(
        "daily_queues",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), nullable=False),
        sa.Column("service_id", sa.String(64), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("opened_at", UTCDateTime(), nullable=False),
        sa.Column("closed_at", UTCDateTime(), nullable=True),
        sa.Column("ticket_prefix", sa.String(32), nullable=False),
        sa.CheckConstraint("status IN ('open','closed')", name="daily_queue_status"),
        sa.UniqueConstraint("organization_id", "service_id", "business_date", name="unique_service_business_date"),
        sa.UniqueConstraint("organization_id", "id", name="unique_daily_queue_org_identity"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["organization_id", "service_id"], ["services.organization_id", "services.id"],
            name="fk_daily_queue_service_org", ondelete="RESTRICT",
        ),
    )

    with op.batch_alter_table("tickets") as batch:
        batch.add_column(sa.Column("daily_queue_id", sa.String(64), nullable=True))
        batch.add_column(sa.Column("daily_number", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("access_token_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("idempotency_key_hash", sa.String(64), nullable=True))
        batch.create_check_constraint(
            "positive_daily_ticket_number", "daily_number IS NULL OR daily_number > 0"
        )
        batch.create_check_constraint(
            "ticket_access_hash_length", "access_token_hash IS NULL OR length(access_token_hash) = 64"
        )
        batch.create_check_constraint(
            "ticket_idempotency_hash_length", "idempotency_key_hash IS NULL OR length(idempotency_key_hash) = 64"
        )
        batch.create_unique_constraint(
            "unique_daily_ticket_number", ["daily_queue_id", "daily_number"]
        )
        batch.create_unique_constraint(
            "unique_daily_ticket_code", ["daily_queue_id", "code"]
        )
        batch.create_unique_constraint(
            "unique_ticket_access_token_hash", ["access_token_hash"]
        )
        batch.create_unique_constraint(
            "unique_queue_idempotency_key_hash", ["daily_queue_id", "idempotency_key_hash"]
        )
        batch.create_foreign_key(
            "fk_ticket_daily_queue", "daily_queues", ["daily_queue_id"], ["id"], ondelete="RESTRICT"
        )

    op.create_table(
        "ticket_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("ticket_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(16), nullable=False),
        sa.Column("occurred_at", UTCDateTime(), nullable=False),
        sa.Column("actor_user_id", sa.String(64), nullable=True),
        sa.Column("counter_id", sa.String(64), nullable=True),
        sa.CheckConstraint(
            "event_type IN ('issued','called','started','completed','cancelled','no_show')",
            name="ticket_event_type",
        ),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], name="fk_ticket_event_ticket", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name="fk_ticket_event_actor", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["counter_id"], ["counters.id"], name="fk_ticket_event_counter", ondelete="RESTRICT"),
    )
    op.create_index("ticket_event_history", "ticket_events", ["ticket_id", "occurred_at", "id"])

    bind = op.get_bind()
    service = sa.table(
        "services", sa.column("id"), sa.column("organization_id"), sa.column("prefix")
    )
    organizations = sa.table(
        "organizations", sa.column("id"), sa.column("timezone")
    )
    tickets = sa.table(
        "tickets", sa.column("ordinal"), sa.column("id"), sa.column("service_id"),
        sa.column("sequence"), sa.column("code"), sa.column("status"),
        sa.column("created_at"), sa.column("called_at"), sa.column("served_at"),
        sa.column("finished_at"), sa.column("counter_id"),
    )
    rows = bind.execute(sa.select(
        tickets.c.ordinal, tickets.c.id, tickets.c.service_id, tickets.c.sequence,
        tickets.c.code, tickets.c.status, tickets.c.created_at, tickets.c.called_at,
        tickets.c.served_at, tickets.c.finished_at, tickets.c.counter_id,
        service.c.organization_id, service.c.prefix, organizations.c.timezone,
    ).select_from(tickets.join(service, tickets.c.service_id == service.c.id).join(
        organizations, service.c.organization_id == organizations.c.id
    )).order_by(tickets.c.ordinal)).mappings().all()

    grouped = defaultdict(list)
    for row in rows:
        created_at = _utc(row["created_at"])
        local_date = created_at.astimezone(ZoneInfo(row["timezone"])).date()
        key = (row["organization_id"], row["service_id"], local_date)
        grouped[key].append((row, created_at))

    for (organization_id, service_id, business_date), items in grouped.items():
        queue_id = _queue_id(organization_id, service_id, business_date)
        has_active_work = any(row["status"] in {"waiting", "called", "serving"} for row, _ in items)
        last_activity = max(_utc(
            row["finished_at"] or row["served_at"] or row["called_at"] or row["created_at"]
        ) for row, _ in items)
        bind.execute(sa.text(
            "INSERT INTO daily_queues "
            "(id, organization_id, service_id, business_date, status, opened_at, closed_at, ticket_prefix) "
            "VALUES (:id, :organization_id, :service_id, :business_date, :status, :opened_at, :closed_at, :ticket_prefix)"
        ), {
            "id": queue_id,
            "organization_id": organization_id,
            "service_id": service_id,
            "business_date": business_date,
            "status": "open" if has_active_work else "closed",
            "opened_at": min(created_at for _, created_at in items),
            "closed_at": None if has_active_work else last_activity,
            "ticket_prefix": items[0][0]["prefix"],
        })
        for daily_number, (row, created_at) in enumerate(items, start=1):
            bind.execute(sa.text(
                "UPDATE tickets SET daily_queue_id=:queue_id, daily_number=:daily_number "
                "WHERE ordinal=:ordinal"
            ), {"queue_id": queue_id, "daily_number": daily_number, "ordinal": row["ordinal"]})
            events = [("issued", created_at)]
            if row["called_at"] is not None:
                events.append(("called", _utc(row["called_at"])))
            if row["served_at"] is not None:
                events.append(("started", _utc(row["served_at"])))
            final_event = {
                "completed": "completed", "cancelled": "cancelled", "no_show": "no_show",
            }.get(row["status"])
            final_time = row["finished_at"] or row["served_at"] or row["called_at"] or row["created_at"]
            if final_event:
                events.append((final_event, _utc(final_time)))
            for event_type, occurred_at in events:
                event_id = f"legacy-{row['ordinal']}-{event_type}"
                bind.execute(sa.text(
                    "INSERT INTO ticket_events "
                    "(id, ticket_id, event_type, occurred_at, actor_user_id, counter_id) "
                    "VALUES (:id, :ticket_id, :event_type, :occurred_at, NULL, :counter_id)"
                ), {
                    "id": event_id,
                    "ticket_id": row["id"],
                    "event_type": event_type,
                    "occurred_at": occurred_at,
                    "counter_id": row["counter_id"] if event_type != "issued" else None,
                })

    # Fail the upgrade rather than inventing which active-looking ticket owns a
    # counter if the legacy data violates the newly enforced invariant.
    op.create_index(
        "unique_active_ticket_per_counter", "tickets", ["counter_id"], unique=True,
        sqlite_where=sa.text("status IN ('called', 'serving')"),
        postgresql_where=sa.text("status IN ('called', 'serving')"),
    )


def downgrade() -> None:
    # Keep the event history and daily queue records; dropping them would erase
    # operational evidence. The schema migration is intentionally irreversible.
    raise RuntimeError("Daily queue and ticket event migration is intentionally irreversible")

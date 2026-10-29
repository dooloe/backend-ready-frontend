"""Add private ticket browser push subscriptions and delivery deduplication."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.orm


revision: str = "7e1cf9d924ab"
down_revision: Union[str, None] = "9ca12ef41d60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("ticket_id", sa.String(64), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False),
        sa.Column("p256dh", sa.String(256), nullable=False),
        sa.Column("auth", sa.String(128), nullable=False),
        sa.Column("created_at", app.orm.UTCDateTime(), nullable=False),
        sa.Column("disabled_at", app.orm.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(["ticket_id"], ["tickets.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("ticket_id", "endpoint", name="unique_ticket_push_endpoint"),
    )
    op.create_index("push_subscription_ticket", "push_subscriptions", ["ticket_id", "disabled_at"])
    op.create_table(
        "push_deliveries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("subscription_id", sa.String(64), nullable=False),
        sa.Column("created_at", app.orm.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["ticket_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["push_subscriptions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("event_id", "subscription_id", name="unique_push_event_subscription"),
    )


def downgrade() -> None:
    op.drop_table("push_deliveries")
    op.drop_index("push_subscription_ticket", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")

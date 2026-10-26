"""Add organization-owned configuration and staff assignments.

Revision ID: d0dce8f73d88
Revises: af7168bb27f8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d0dce8f73d88"
down_revision: Union[str, None] = "af7168bb27f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
    )
    op.execute(sa.text(
        "INSERT INTO organizations (id, name, slug, description, timezone) "
        "VALUES ('org-demo', 'Kezek Demo', 'kezek-demo', 'Migrated default organization', 'Asia/Almaty')"
    ))

    # Backfill existing rows before making organization ownership mandatory.
    op.add_column("users", sa.Column("organization_id", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("email", sa.String(320), nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=True))
    op.add_column("services", sa.Column("organization_id", sa.String(64), nullable=True))
    op.add_column("services", sa.Column("duration_minutes", sa.Float(), nullable=True))
    op.add_column("services", sa.Column("opens_at", sa.Time(), nullable=True))
    op.add_column("services", sa.Column("closes_at", sa.Time(), nullable=True))
    op.add_column("services", sa.Column("is_active", sa.Boolean(), nullable=True))
    op.add_column("counters", sa.Column("organization_id", sa.String(64), nullable=True))
    op.add_column("counter_services", sa.Column("organization_id", sa.String(64), nullable=True))

    bind = op.get_bind()
    users = sa.table("users", sa.column("id"), sa.column("username"),
                     sa.column("organization_id"), sa.column("email"), sa.column("is_active"))
    for user_id, username in bind.execute(sa.select(users.c.id, users.c.username)):
        bind.execute(users.update().where(users.c.id == user_id).values(
            organization_id="org-demo", email=f"{username.lower()}@legacy.invalid", is_active=True
        ))
    services = sa.table("services", sa.column("id"), sa.column("avg_service_minutes"),
                        sa.column("is_open"), sa.column("organization_id"),
                        sa.column("duration_minutes"), sa.column("is_active"))
    bind.execute(services.update().values(
        organization_id="org-demo", duration_minutes=services.c.avg_service_minutes,
        is_active=services.c.is_open,
    ))
    bind.execute(sa.text("UPDATE counters SET organization_id='org-demo'"))
    op.execute(sa.text(
        "UPDATE counter_services SET organization_id=(SELECT organization_id FROM counters "
        "WHERE counters.id=counter_services.counter_id)"
    ))

    with op.batch_alter_table("users") as batch:
        batch.alter_column("organization_id", existing_type=sa.String(64), nullable=False)
        batch.alter_column("email", existing_type=sa.String(320), nullable=False)
        batch.alter_column("is_active", existing_type=sa.Boolean(), nullable=False)
        batch.create_foreign_key("fk_users_organization", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
        batch.create_unique_constraint("uq_users_email", ["email"])
        batch.create_unique_constraint("unique_user_org_identity", ["organization_id", "id"])

    with op.batch_alter_table("services") as batch:
        batch.alter_column("organization_id", existing_type=sa.String(64), nullable=False)
        batch.alter_column("duration_minutes", existing_type=sa.Float(), nullable=False)
        batch.alter_column("is_active", existing_type=sa.Boolean(), nullable=False)
        batch.create_check_constraint("positive_duration_minutes", "duration_minutes > 0")
        batch.create_foreign_key("fk_services_organization", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
        batch.create_unique_constraint("unique_service_org_identity", ["organization_id", "id"])

    with op.batch_alter_table("counters") as batch:
        batch.alter_column("organization_id", existing_type=sa.String(64), nullable=False)
        batch.create_foreign_key("fk_counters_organization", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
        batch.create_unique_constraint("unique_counter_org_identity", ["organization_id", "id"])

    with op.batch_alter_table("counter_services") as batch:
        batch.alter_column("organization_id", existing_type=sa.String(64), nullable=False)
        batch.create_foreign_key("fk_counter_service_counter_org", "counters", ["organization_id", "counter_id"], ["organization_id", "id"], ondelete="RESTRICT")
        batch.create_foreign_key("fk_counter_service_service_org", "services", ["organization_id", "service_id"], ["organization_id", "id"], ondelete="RESTRICT")

    op.create_table(
        "staff_assignments",
        sa.Column("organization_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("counter_id", sa.String(64), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "counter_id"),
        sa.ForeignKeyConstraint(["organization_id", "user_id"], ["users.organization_id", "users.id"], name="fk_staff_assignment_user_org", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id", "counter_id"], ["counters.organization_id", "counters.id"], name="fk_staff_assignment_counter_org", ondelete="RESTRICT"),
    )
    assignments = sa.table("staff_assignments", sa.column("organization_id"),
                           sa.column("user_id"), sa.column("counter_id"))
    counters = sa.table("counters", sa.column("id"), sa.column("organization_id"), sa.column("staff_id"))
    for organization_id, user_id, counter_id in bind.execute(sa.select(
        counters.c.organization_id, counters.c.staff_id, counters.c.id
    ).where(counters.c.staff_id.is_not(None))):
        bind.execute(assignments.insert().values(
            organization_id=organization_id, user_id=user_id, counter_id=counter_id
        ))


def downgrade() -> None:
    # These are additive ownership fields; dropping them would erase organization data.
    raise RuntimeError("Organization ownership migration is intentionally irreversible")

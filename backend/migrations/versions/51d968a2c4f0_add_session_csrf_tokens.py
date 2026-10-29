"""Persist session-bound CSRF token hashes."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "51d968a2c4f0"
down_revision: Union[str, None] = "7e1cf9d924ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("csrf_token_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "csrf_token_hash")

"""Add explicit platform-admin scope."""

from alembic import op
import sqlalchemy as sa

revision = "7b3124a9c801"
down_revision = "51d968a2c4f0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column(
        "is_platform_admin", sa.Boolean(), server_default=sa.false(), nullable=False,
    ))


def downgrade():
    op.drop_column("users", "is_platform_admin")

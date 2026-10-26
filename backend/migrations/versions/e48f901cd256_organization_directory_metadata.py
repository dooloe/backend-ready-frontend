"""Add public organization directory metadata without altering existing data."""
from alembic import op
import sqlalchemy as sa

revision = "e48f901cd256"
down_revision = "d0dce8f73d88"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("category", sa.String(40), nullable=False, server_default="Service Centers"))
    op.add_column("organizations", sa.Column("location", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("organizations", "location")
    op.drop_column("organizations", "category")

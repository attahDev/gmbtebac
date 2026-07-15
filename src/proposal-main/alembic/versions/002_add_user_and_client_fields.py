from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("user_id", sa.String(255), nullable=False, server_default="default"))
    op.add_column("proposals", sa.Column("user_name", sa.String(255), nullable=True))
    op.add_column("proposals", sa.Column("client_name", sa.String(255), nullable=True))
    op.add_column("proposals", sa.Column("estimated_budget", sa.String(100), nullable=True))
    op.add_column("proposals", sa.Column("total_value", sa.String(100), nullable=True))
    op.create_index("idx_proposals_user_id", "proposals", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_proposals_user_id")
    op.drop_column("proposals", "total_value")
    op.drop_column("proposals", "estimated_budget")
    op.drop_column("proposals", "client_name")
    op.drop_column("proposals", "user_name")
    op.drop_column("proposals", "user_id")

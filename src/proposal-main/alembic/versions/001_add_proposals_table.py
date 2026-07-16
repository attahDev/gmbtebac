from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "proposals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("proposal_type", sa.String(100), nullable=False),
        sa.Column("raw_input", sa.Text, nullable=False),
        sa.Column("content", JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute("CREATE INDEX idx_proposals_created_at ON proposals (created_at DESC)")
    op.create_index("idx_proposals_type", "proposals", ["proposal_type"])


def downgrade() -> None:
    op.drop_index("idx_proposals_type")
    op.drop_index("idx_proposals_created_at")
    op.drop_table("proposals")

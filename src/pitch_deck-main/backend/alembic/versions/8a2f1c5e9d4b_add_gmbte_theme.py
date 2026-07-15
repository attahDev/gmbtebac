
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '8a2f1c5e9d4b'
down_revision: Union[str, None] = '51c47a9fd603'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE themetype ADD VALUE IF NOT EXISTS 'gmbte'")
    
    op.execute("ALTER TABLE pitch_decks ALTER COLUMN theme SET DEFAULT 'gmbte'")


def downgrade() -> None:
    op.execute("ALTER TABLE pitch_decks ALTER COLUMN theme SET DEFAULT 'dark'")

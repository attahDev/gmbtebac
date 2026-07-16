
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '51c47a9fd603'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    themetype = sa.Enum('dark', 'light', 'corporate', 'minimal', 'bold', name='themetype')
    themetype.create(op.get_bind(), checkfirst=True)
    op.add_column('pitch_decks', sa.Column('theme', themetype, nullable=True))
    op.execute("UPDATE pitch_decks SET theme = 'dark' WHERE theme IS NULL")
    op.alter_column('pitch_decks', 'theme', nullable=False)


def downgrade() -> None:
    op.drop_column('pitch_decks', 'theme')
    sa.Enum(name='themetype').drop(op.get_bind(), checkfirst=True)

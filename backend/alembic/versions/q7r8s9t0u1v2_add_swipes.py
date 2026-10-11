"""Add swipes table (every kiosk card read / member lookup, with outcome)

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-10-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'q7r8s9t0u1v2'
down_revision: Union[str, None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SOURCE = sa.Enum('card', 'search', name='swipesource')
OUTCOME = sa.Enum('checked_in', 'no_action', 'no_plan', 'expired', 'frozen', 'outside_hours',
                  'unknown_card', 'inactive_member', name='swipeoutcome')


def upgrade() -> None:
    op.create_table(
        'swipes',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('member_id', sa.Uuid(), sa.ForeignKey('members.id'), nullable=True, index=True),
        sa.Column('card_uid', sa.String(100), nullable=True),
        sa.Column('source', SOURCE, nullable=False, server_default='card'),
        sa.Column('outcome', OUTCOME, nullable=False, index=True),
        sa.Column('checkin_id', sa.Uuid(), sa.ForeignKey('checkins.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table('swipes')
    OUTCOME.drop(op.get_bind(), checkfirst=True)
    SOURCE.drop(op.get_bind(), checkfirst=True)

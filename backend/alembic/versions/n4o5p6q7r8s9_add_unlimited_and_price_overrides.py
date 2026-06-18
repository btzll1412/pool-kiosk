"""Add is_unlimited to members and member_price_overrides table

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, None] = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('members', sa.Column('is_unlimited', sa.Boolean(), nullable=True, server_default='false'))

    op.create_table(
        'member_price_overrides',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('member_id', sa.Uuid(), sa.ForeignKey('members.id'), nullable=False, index=True),
        sa.Column('plan_id', sa.Uuid(), sa.ForeignKey('plans.id'), nullable=False, index=True),
        sa.Column('custom_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('member_id', 'plan_id', name='uq_member_plan_override'),
    )


def downgrade() -> None:
    op.drop_table('member_price_overrides')
    op.drop_column('members', 'is_unlimited')

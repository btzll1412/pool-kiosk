"""Item plans: one-time sales with a fixed or open amount, no membership created

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-10-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'r8s9t0u1v2w3'
down_revision: Union[str, None] = 'q7r8s9t0u1v2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Enum values can't be added inside the migration transaction
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE plantype ADD VALUE IF NOT EXISTS 'item'")

    op.add_column('plans', sa.Column('open_amount', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('plans', sa.Column('min_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column('plans', sa.Column('max_amount', sa.Numeric(10, 2), nullable=True))

    op.add_column('pending_terminal_payments', sa.Column('item_description', sa.String(200), nullable=True))
    op.add_column('pending_terminal_payments', sa.Column('item_amount', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('pending_terminal_payments', 'item_amount')
    op.drop_column('pending_terminal_payments', 'item_description')
    op.drop_column('plans', 'max_amount')
    op.drop_column('plans', 'min_amount')
    op.drop_column('plans', 'open_amount')
    # The 'item' enum value is left in place: PostgreSQL cannot drop enum values.

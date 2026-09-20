"""Add charge-to-account, one-time scheduled charge, and terminal billing options

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-09-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o5p6q7r8s9t0'
down_revision: Union[str, None] = 'n4o5p6q7r8s9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plans', sa.Column('allow_charge_to_account', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('members', sa.Column('charge_to_account_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('members', sa.Column('charge_to_account_limit', sa.Numeric(10, 2), nullable=True))
    op.add_column('saved_cards', sa.Column('charge_once', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('pending_terminal_payments', sa.Column('billing_mode', sa.String(10), nullable=True))
    op.add_column('pending_terminal_payments', sa.Column('start_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('pending_terminal_payments', 'start_date')
    op.drop_column('pending_terminal_payments', 'billing_mode')
    op.drop_column('saved_cards', 'charge_once')
    op.drop_column('members', 'charge_to_account_limit')
    op.drop_column('members', 'charge_to_account_enabled')
    op.drop_column('plans', 'allow_charge_to_account')

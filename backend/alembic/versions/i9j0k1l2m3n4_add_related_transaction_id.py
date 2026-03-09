"""Add related_transaction_id to transactions

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-03-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add related_transaction_id column to transactions table (self-referencing)
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE transactions ADD COLUMN related_transaction_id UUID REFERENCES transactions(id);
            CREATE INDEX IF NOT EXISTS ix_transactions_related_transaction_id ON transactions(related_transaction_id);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_transactions_related_transaction_id;"))
    conn.execute(sa.text("ALTER TABLE transactions DROP COLUMN IF EXISTS related_transaction_id;"))

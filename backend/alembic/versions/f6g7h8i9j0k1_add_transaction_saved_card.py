"""Add saved_card_id to transactions

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2025-02-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6g7h8i9j0k1'
down_revision: Union[str, None] = 'e5f6g7h8i9j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add saved_card_id column to transactions table
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE transactions ADD COLUMN saved_card_id UUID REFERENCES saved_cards(id);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE transactions DROP COLUMN IF EXISTS saved_card_id;"))

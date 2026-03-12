"""Add plan_price and change_given to guest_visits

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-03-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add plan_price column (nullable for existing records)
    conn = op.get_bind()
    conn.execute(sa.text("""
        ALTER TABLE guest_visits ADD COLUMN IF NOT EXISTS plan_price NUMERIC(10, 2);
    """))

    # Add change_given column with default 0
    conn.execute(sa.text("""
        ALTER TABLE guest_visits ADD COLUMN IF NOT EXISTS change_given NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;
    """))

    # Update existing records to set plan_price from the plan table
    conn.execute(sa.text("""
        UPDATE guest_visits gv
        SET plan_price = p.price
        FROM plans p
        WHERE gv.plan_id = p.id AND gv.plan_price IS NULL;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE guest_visits DROP COLUMN IF EXISTS plan_price;"))
    conn.execute(sa.text("ALTER TABLE guest_visits DROP COLUMN IF EXISTS change_given;"))

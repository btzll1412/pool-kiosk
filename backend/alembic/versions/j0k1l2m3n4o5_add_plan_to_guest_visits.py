"""Add plan fields to guest_visits

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add plan_id and plan_name columns to guest_visits table
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE guest_visits ADD COLUMN plan_id UUID REFERENCES plans(id);
            ALTER TABLE guest_visits ADD COLUMN plan_name VARCHAR(200);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE guest_visits DROP COLUMN IF EXISTS plan_name;"))
    conn.execute(sa.text("ALTER TABLE guest_visits DROP COLUMN IF EXISTS plan_id;"))

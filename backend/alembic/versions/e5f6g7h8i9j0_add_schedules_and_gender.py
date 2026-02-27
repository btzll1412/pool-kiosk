"""Add pool schedules tables and member gender field

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2025-05-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6g7h8i9j0'
down_revision: Union[str, None] = 'd4e5f6g7h8i9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create ScheduleType enum using raw SQL with IF NOT EXISTS
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE scheduletype AS ENUM ('open', 'men_only', 'women_only', 'lap_swim', 'lessons', 'maintenance', 'closed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    # Create pool_schedules table using raw SQL to avoid SQLAlchemy trying to create the enum
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS pool_schedules (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            schedule_type scheduletype NOT NULL,
            day_of_week SMALLINT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            priority INTEGER NOT NULL DEFAULT 0,
            notes VARCHAR(500),
            created_at TIMESTAMP NOT NULL DEFAULT now()
        );
    """))

    # Create schedule_overrides table using raw SQL
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS schedule_overrides (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            schedule_type scheduletype NOT NULL,
            start_datetime TIMESTAMP NOT NULL,
            end_datetime TIMESTAMP NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            notes VARCHAR(500),
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            created_by UUID
        );
    """))

    # Add gender column to members table
    conn.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE members ADD COLUMN gender VARCHAR(10);
        EXCEPTION
            WHEN duplicate_column THEN null;
        END $$;
    """))


def downgrade() -> None:
    conn = op.get_bind()

    # Remove gender column from members table
    conn.execute(sa.text("ALTER TABLE members DROP COLUMN IF EXISTS gender;"))

    # Drop schedule_overrides table
    conn.execute(sa.text("DROP TABLE IF EXISTS schedule_overrides;"))

    # Drop pool_schedules table
    conn.execute(sa.text("DROP TABLE IF EXISTS pool_schedules;"))

    # Drop ScheduleType enum
    conn.execute(sa.text("DROP TYPE IF EXISTS scheduletype;"))

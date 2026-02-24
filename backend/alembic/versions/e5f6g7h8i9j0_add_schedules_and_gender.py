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
    # Create ScheduleType enum using raw SQL with IF NOT EXISTS
    conn = op.get_bind()
    conn.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE scheduletype AS ENUM ('open', 'men_only', 'women_only', 'lap_swim', 'lessons', 'maintenance', 'closed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    schedule_type = sa.Enum(
        'open', 'men_only', 'women_only', 'lap_swim', 'lessons', 'maintenance', 'closed',
        name='scheduletype',
        create_type=False  # Don't try to create, we did it above
    )

    # Create pool_schedules table
    op.create_table(
        'pool_schedules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('schedule_type', schedule_type, nullable=False),
        sa.Column('day_of_week', sa.SmallInteger(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    # Create schedule_overrides table
    op.create_table(
        'schedule_overrides',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('schedule_type', schedule_type, nullable=False),
        sa.Column('start_datetime', sa.DateTime(), nullable=False),
        sa.Column('end_datetime', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Add gender column to members table
    op.add_column('members', sa.Column('gender', sa.String(10), nullable=True))


def downgrade() -> None:
    # Remove gender column from members table
    op.drop_column('members', 'gender')

    # Drop schedule_overrides table
    op.drop_table('schedule_overrides')

    # Drop pool_schedules table
    op.drop_table('pool_schedules')

    # Drop ScheduleType enum
    sa.Enum(name='scheduletype').drop(op.get_bind(), checkfirst=True)

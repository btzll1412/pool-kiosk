"""Fix date_of_birth column type from DateTime to Date

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'h8i9j0k1l2m3'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change date_of_birth from DateTime to Date
    # PostgreSQL allows this conversion directly
    op.alter_column(
        'members',
        'date_of_birth',
        type_=sa.Date(),
        existing_type=sa.DateTime(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'members',
        'date_of_birth',
        type_=sa.DateTime(),
        existing_type=sa.Date(),
        existing_nullable=True,
    )

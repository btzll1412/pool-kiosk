"""Add monthly billing fields

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2024-02-22

"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6g7h8i9"
down_revision = "c3d4e5f6g7h8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("duration_months", sa.Integer(), nullable=True))
    op.add_column("memberships", sa.Column("next_billing_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("plans", "duration_months")
    op.drop_column("memberships", "next_billing_date")

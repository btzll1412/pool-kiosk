"""Add is_senior_plan field to plans

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2024-02-22

"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6g7h8"
down_revision = "b2c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("is_senior_plan", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("plans", "is_senior_plan")

"""Add senior citizen fields

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6g7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("members", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("members", sa.Column("is_senior", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("members", "is_senior")
    op.drop_column("members", "date_of_birth")

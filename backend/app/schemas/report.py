from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DashboardResponse(BaseModel):
    total_checkins_today: int
    unique_members_today: int
    revenue_today: Decimal
    active_memberships: int
    guests_today: int


class RevenueReportItem(BaseModel):
    period: str
    total: Decimal
    cash: Decimal
    card: Decimal
    credit: Decimal


class RevenueReportResponse(BaseModel):
    items: list[RevenueReportItem]
    grand_total: Decimal


class SwimReportResponse(BaseModel):
    total_swims: int
    unique_swimmers: int
    average_daily: float
    by_type: dict[str, int]


class MembershipReportResponse(BaseModel):
    total_active: int
    by_plan: dict[str, int]
    expiring_soon: int

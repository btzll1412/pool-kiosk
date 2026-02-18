import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.report import (
    DashboardResponse,
    MembershipReportResponse,
    RevenueReportResponse,
    SwimReportResponse,
)
from app.services.auth_service import get_current_user
from app.services.report_service import (
    get_dashboard_stats,
    get_membership_report,
    get_revenue_report,
    get_swim_report,
)

router = APIRouter()


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_dashboard_stats(db)


@router.get("/revenue", response_model=RevenueReportResponse)
def revenue_report(
    start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=30)),
    end_date: date = Query(default_factory=date.today),
    group_by: str = Query("day", regex="^(day|week|month)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, grand_total = get_revenue_report(db, start_date, end_date, group_by)
    return RevenueReportResponse(items=items, grand_total=grand_total)


@router.get("/swims", response_model=SwimReportResponse)
def swim_report(
    start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=30)),
    end_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_swim_report(db, start_date, end_date)


@router.get("/memberships", response_model=MembershipReportResponse)
def membership_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_membership_report(db)


@router.get("/export")
def export_csv(
    start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=30)),
    end_date: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime
    from app.models.transaction import Transaction

    start = datetime.combine(start_date, datetime.min.time())
    end = datetime.combine(end_date, datetime.max.time())
    transactions = db.query(Transaction).filter(Transaction.created_at.between(start, end)).order_by(Transaction.created_at).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Method", "Amount", "Member ID", "Notes"])
    for tx in transactions:
        writer.writerow([
            tx.created_at.isoformat(),
            tx.transaction_type.value,
            tx.payment_method.value,
            str(tx.amount),
            str(tx.member_id) if tx.member_id else "",
            tx.notes or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transactions_{start_date}_{end_date}.csv"},
    )

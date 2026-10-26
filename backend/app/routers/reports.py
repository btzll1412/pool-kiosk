import csv
import io
import logging
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.schemas.report import (
    DashboardResponse,
    MembershipReportResponse,
    RevenueReportResponse,
    SwimReportResponse,
)
from app.services.auth_service import get_current_user
from app.services.monthly_report_service import (
    get_monthly_report,
    get_report_bounds,
)
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

    logger.info("CSV export: %d transactions, range=%s to %s", len(transactions), start_date, end_date)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transactions_{start_date}_{end_date}.csv"},
    )


@router.get("/kiosk-errors")
def kiosk_errors(
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Problems the kiosk reported about itself (crashes, hung requests) in the last N days."""
    since = date.today() - timedelta(days=days)
    query = db.query(ActivityLog).filter(
        ActivityLog.action_type == "kiosk.client_error",
        ActivityLog.created_at >= since,
    )
    items = query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return {
        "total": query.count(),
        "items": [
            {
                "id": entry.id,
                "created_at": entry.created_at,
                "message": entry.note,
                "screen": (entry.after_value or {}).get("screen"),
            }
            for entry in items
        ],
    }



@router.get("/monthly/bounds")
def monthly_report_bounds(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """First and last month that can be picked on the monthly report."""
    return get_report_bounds(db)


@router.get("/monthly")
def monthly_report(
    start: str = Query(..., description="First month, YYYY-MM"),
    end: str | None = Query(None, description="Last month, YYYY-MM (defaults to start)"),
    member_ids: list[uuid.UUID] | None = Query(None, description="Narrow the report to these members"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Everything that happened in a month or a range of months, optionally for chosen customers."""
    return get_monthly_report(db, start, end or start, member_ids)


@router.get("/monthly/export")
def monthly_report_export(
    start: str = Query(...),
    end: str | None = Query(None),
    member_ids: list[uuid.UUID] | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """CSV of the monthly report: a summary block per month, then every transaction."""
    report = get_monthly_report(db, start, end or start, member_ids)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["Month", "Net total", "Cash", "Card", "Card on file", "Account credit", "Charged to account",
                     "Refunds", "Credits added", "Sales", "Swims", "Unique swimmers", "Guest visits",
                     "Memberships started", "Memberships expired", "Active at month end"])
    for m in report["months"] + [{"label": "TOTAL", **report["totals"]}]:
        writer.writerow([m["label"], m["total"], m["cash"], m["card"], m["card_on_file"], m["credit"], m["account"],
                         m["refunds"], m["credits_added"], m["sales"], m["swims"], m["unique_swimmers"], m["guest_visits"],
                         m["memberships_started"], m["memberships_expired"], m["active_at_end"]])

    writer.writerow([])
    writer.writerow(["Date", "Month", "Customer", "Type", "Method", "Card", "Plan", "Amount", "Notes"])
    for tx in report["transactions"]:
        writer.writerow([
            tx["created_at"].isoformat(),
            tx["period"],
            tx["member_name"] or (f"Guest: {tx['guest_name']}" if tx["guest_name"] else ""),
            tx["transaction_type"].replace("_", " "),
            tx["method_label"],
            tx["card"] or "",
            tx["plan_name"] or "",
            tx["amount"],
            tx["notes"] or "",
        ])

    if report["checkins"]:
        writer.writerow([])
        writer.writerow(["Check-in", "Month", "Customer", "Type", "Guests"])
        for c in report["checkins"]:
            writer.writerow([c["checked_in_at"].isoformat(), c["period"], c["member_name"], c["checkin_type"], c["guest_count"]])

    suffix = report["start"] if report["start"] == report["end"] else f"{report['start']}_to_{report['end']}"
    logger.info("Monthly report CSV: %s, %d transactions, members=%s", suffix, len(report["transactions"]), member_ids)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=monthly_report_{suffix}.csv"},
    )

"""Item Sales: every one-time item purchase (Misc, towels, snacks, ...) by members and
guests, with the buyer's phone — guests type it at the kiosk, members have it on file."""
import csv
import io
import uuid
from datetime import date, datetime

import pytz
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services.item_sale_service import (
    BUYER_FILTERS,
    METHOD_FILTERS,
    all_item_sales,
    item_plans_for_filter,
    list_item_sales,
)
from app.services.settings_service import get_setting

router = APIRouter()


def _filters(start, end, search, plan_id, method, buyer) -> dict:
    return {
        "start": start,
        "end": end,
        "search": search or None,
        "plan_id": plan_id,
        "method": method if method in METHOD_FILTERS else None,
        "buyer": buyer if buyer in BUYER_FILTERS else None,
    }


@router.get("")
def get_item_sales(
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = Query(None, max_length=100),
    plan_id: uuid.UUID | None = None,
    method: str | None = None,
    buyer: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_item_sales(db, page=page, per_page=per_page,
                           **_filters(start_date, end_date, search, plan_id, method, buyer))


@router.get("/plans")
def get_item_sale_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return item_plans_for_filter(db)


@router.get("/export")
def export_item_sales(
    start_date: date | None = None,
    end_date: date | None = None,
    search: str | None = Query(None, max_length=100),
    plan_id: uuid.UUID | None = None,
    method: str | None = None,
    buyer: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = all_item_sales(db, **_filters(start_date, end_date, search, plan_id, method, buyer))
    try:
        tz = pytz.timezone(get_setting(db, "timezone", "America/New_York"))
    except pytz.UnknownTimeZoneError:
        tz = pytz.timezone("America/New_York")

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Time", "Buyer", "Name", "Phone", "Item", "Description", "Amount", "Payment", "Recorded By"])
    for r in rows:
        local = pytz.UTC.localize(datetime.fromisoformat(r["created_at"])).astimezone(tz)
        w.writerow([
            local.strftime("%Y-%m-%d"), local.strftime("%I:%M %p"), r["buyer"], r["name"], r["phone"] or "",
            r["plan_name"] or "", r["description"] or "", r["amount"], r["method_label"], r["recorded_by"],
        ])
    out.seek(0)
    name = "item-sales"
    if start_date or end_date:
        name += f"_{start_date or 'start'}_to_{end_date or 'today'}"
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={name}.csv"},
    )

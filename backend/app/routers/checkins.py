import logging
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.checkin import Checkin, CheckinType
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.user import User
from app.schemas.checkin import CheckinListResponse, CheckinResponse, CheckinWithMemberResponse
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("", response_model=CheckinListResponse)
def list_checkins(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    checkin_type: str | None = None,
    unique_only: bool = False,
    include_guests: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List check-ins with filtering options.

    - search: Filter by member/guest name
    - start_date: Filter check-ins from this date (inclusive)
    - end_date: Filter check-ins until this date (inclusive)
    - checkin_type: Filter by check-in type (or "guest" for guest visits)
    - unique_only: If true, return only the most recent check-in per member
    - include_guests: If true, include guest visits in results
    """
    # Build date range
    start_datetime = datetime.combine(start_date, time.min) if start_date else None
    end_datetime = datetime.combine(end_date, time.max) if end_date else None

    # Collect all items (member check-ins + guest visits)
    all_items = []

    # Only filter out guests if checkin_type is a specific member type
    include_member_checkins = checkin_type != "guest"
    include_guest_visits = include_guests and (checkin_type is None or checkin_type == "guest")

    # --- Member Check-ins ---
    if include_member_checkins:
        query = db.query(Checkin).join(Member, Checkin.member_id == Member.id)

        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Member.first_name.ilike(pattern),
                    Member.last_name.ilike(pattern),
                    (Member.first_name + " " + Member.last_name).ilike(pattern),
                )
            )

        if start_datetime:
            query = query.filter(Checkin.checked_in_at >= start_datetime)
        if end_datetime:
            query = query.filter(Checkin.checked_in_at <= end_datetime)

        if checkin_type and checkin_type != "guest":
            try:
                ct = CheckinType(checkin_type)
                query = query.filter(Checkin.checkin_type == ct)
            except ValueError:
                pass

        if unique_only:
            subquery = (
                db.query(Checkin.member_id, func.max(Checkin.checked_in_at).label("latest"))
                .group_by(Checkin.member_id)
                .subquery()
            )
            query = query.join(
                subquery,
                (Checkin.member_id == subquery.c.member_id) &
                (Checkin.checked_in_at == subquery.c.latest)
            )

        checkins = query.all()
        for checkin in checkins:
            member = db.query(Member).filter(Member.id == checkin.member_id).first()
            member_name = f"{member.first_name} {member.last_name}" if member else "Unknown"
            all_items.append({
                "id": checkin.id,
                "member_id": checkin.member_id,
                "member_name": member_name,
                "membership_id": checkin.membership_id,
                "checkin_type": checkin.checkin_type.value,
                "guest_count": checkin.guest_count,
                "checked_in_at": checkin.checked_in_at,
                "notes": checkin.notes,
                "is_guest": False,
            })

    # --- Guest Visits ---
    if include_guest_visits:
        guest_query = db.query(GuestVisit)

        if search:
            pattern = f"%{search}%"
            guest_query = guest_query.filter(GuestVisit.name.ilike(pattern))

        if start_datetime:
            guest_query = guest_query.filter(GuestVisit.created_at >= start_datetime)
        if end_datetime:
            guest_query = guest_query.filter(GuestVisit.created_at <= end_datetime)

        guests = guest_query.all()
        for guest in guests:
            all_items.append({
                "id": guest.id,
                "member_id": None,
                "member_name": f"{guest.name} (Guest)",
                "membership_id": None,
                "checkin_type": "guest",
                "guest_count": 0,
                "checked_in_at": guest.created_at,
                "notes": f"Paid ${guest.amount_paid} ({guest.payment_method.value})",
                "is_guest": True,
            })

    # Sort all items by date descending
    all_items.sort(key=lambda x: x["checked_in_at"], reverse=True)

    # Calculate unique members (excluding guests)
    unique_members = len(set(item["member_id"] for item in all_items if item["member_id"] is not None))

    # Pagination
    total = len(all_items)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_items = all_items[start_idx:end_idx]

    # Build response
    items = [CheckinWithMemberResponse(**item) for item in paginated_items]

    return CheckinListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        unique_members=unique_members,
    )

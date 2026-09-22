"""Regression tests for admin fixes: plan deletion, membership expiry, card data handling."""

from datetime import date, timedelta
from decimal import Decimal

from app.models.guest_visit import GuestVisit
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.transaction import PaymentMethod
from app.services.membership_service import expire_lapsed_memberships


def test_delete_plan_with_guest_history_archives_it(client, db, admin_headers, single_swim_plan):
    """Guest visits are finished the moment they're recorded — they never block a delete."""
    visit = GuestVisit(
        name="Walk In", payment_method=PaymentMethod.cash, amount_paid=Decimal("2.00"),
        plan_id=single_swim_plan.id, plan_name=single_swim_plan.name, plan_price=single_swim_plan.price,
    )
    db.add(visit)
    db.commit()

    response = client.delete(f"/api/plans/{single_swim_plan.id}/permanent", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert "kept" in response.json()["message"]

    # Hidden everywhere, can't come back, but history still points at it
    db.expire_all()
    plan = db.get(Plan, single_swim_plan.id)
    assert plan is not None and plan.deleted_at is not None and plan.is_active is False
    assert db.get(GuestVisit, visit.id).plan_id == plan.id
    assert all(p["id"] != str(plan.id) for p in client.get("/api/plans", headers=admin_headers).json())
    assert all(p["id"] != str(plan.id) for p in client.get("/api/kiosk/plans").json())
    assert client.post(f"/api/plans/{plan.id}/reactivate", headers=admin_headers).status_code == 404


def test_delete_plan_blocked_only_by_active_members(client, db, admin_headers, member_with_pin, monthly_plan):
    from datetime import date as _date
    today = _date.today()
    membership = _monthly(db, member_with_pin, monthly_plan, today + timedelta(days=10))

    blocked = client.delete(f"/api/plans/{monthly_plan.id}/permanent", headers=admin_headers)
    assert blocked.status_code == 400
    assert "1 member(s) are actively on this plan" in blocked.json()["detail"]

    # Deactivate that person's membership -> delete goes through, membership history kept
    membership.is_active = False
    db.commit()
    assert client.delete(f"/api/plans/{monthly_plan.id}/permanent", headers=admin_headers).status_code == 200
    db.expire_all()
    assert db.get(Membership, membership.id).plan_id == monthly_plan.id
    assert db.get(Plan, monthly_plan.id).deleted_at is not None


def test_delete_unused_plan_succeeds(client, db, admin_headers, single_swim_plan):
    response = client.delete(f"/api/plans/{single_swim_plan.id}/permanent", headers=admin_headers)
    assert response.status_code == 200
    assert db.get(Plan, single_swim_plan.id) is None


def _monthly(db, member, plan, valid_until):
    membership = Membership(
        member_id=member.id, plan_id=plan.id, plan_type=PlanType.monthly,
        valid_from=valid_until - timedelta(days=30), valid_until=valid_until, is_active=True,
    )
    db.add(membership)
    db.commit()
    return membership


def test_membership_expires_the_day_after_valid_until(db, member_with_pin, monthly_plan):
    today = date(2026, 9, 20)
    last_day = _monthly(db, member_with_pin, monthly_plan, today)
    lapsed = _monthly(db, member_with_pin, monthly_plan, today - timedelta(days=1))

    expired = expire_lapsed_memberships(db, today)

    assert [m.id for m in expired] == [lapsed.id]
    assert lapsed.is_active is False
    assert last_day.is_active is True
    # Second run finds nothing — members are notified only once
    assert expire_lapsed_memberships(db, today) == []


def test_card_data_is_rejected_in_query_string(client, admin_headers, member_with_pin):
    base = f"/api/members/{member_with_pin.id}"
    in_url = client.post(
        f"{base}/saved-cards/tokenize-full?card_number=4111111111111111&exp_date=1230&cvv=123",
        headers=admin_headers,
    )
    assert in_url.status_code == 422


def test_tokenize_full_requires_cvv(client, admin_headers, member_with_pin):
    response = client.post(
        f"/api/members/{member_with_pin.id}/saved-cards/tokenize-full",
        headers=admin_headers,
        json={"card_number": "4111111111111111", "exp_date": "1230"},
    )
    assert response.status_code == 422

    bad_cvv = client.post(
        f"/api/members/{member_with_pin.id}/saved-cards/tokenize-full",
        headers=admin_headers,
        json={"card_number": "4111111111111111", "exp_date": "1230", "cvv": "12"},
    )
    assert bad_cvv.status_code == 422

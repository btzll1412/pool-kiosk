"""Regression tests for admin fixes: plan deletion, membership expiry, card data handling."""

from datetime import date, timedelta
from decimal import Decimal

from app.models.guest_visit import GuestVisit
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.transaction import PaymentMethod
from app.services.membership_service import expire_lapsed_memberships


def test_delete_plan_blocked_by_guest_visits(client, db, admin_headers, single_swim_plan):
    db.add(GuestVisit(
        name="Walk In", payment_method=PaymentMethod.cash,
        amount_paid=Decimal("2.00"), plan_id=single_swim_plan.id,
    ))
    db.commit()

    response = client.delete(f"/api/plans/{single_swim_plan.id}/permanent", headers=admin_headers)

    assert response.status_code == 400
    assert "1 guest visit(s)" in response.json()["detail"]
    assert "Deactivate it instead" in response.json()["detail"]
    assert db.get(Plan, single_swim_plan.id) is not None


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

"""Kiosk "My History": PIN-gated, member-scoped, no internal fields."""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.checkin import Checkin, CheckinType
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.auth_service import hash_pin
from app.services.time_service import local_today


@pytest.fixture()
def history_member(db, seed_settings, member_with_pin):
    m = member_with_pin
    today = local_today(db)
    monthly = Plan(name="Monthly Swim", plan_type=PlanType.monthly, price=Decimal("135.00"), duration_months=1, is_active=True)
    pack = Plan(name="10-Swim Pack", plan_type=PlanType.swim_pass, price=Decimal("40.00"), swim_count=10, is_active=True)
    db.add_all([monthly, pack]); db.flush()
    active = Membership(member_id=m.id, plan_id=monthly.id, plan_type=PlanType.monthly,
                        valid_from=today.replace(day=1), valid_until=today + timedelta(days=20), is_active=True)
    upcoming = Membership(member_id=m.id, plan_id=monthly.id, plan_type=PlanType.monthly,
                          valid_from=today + timedelta(days=21), valid_until=today + timedelta(days=50), is_active=True)
    ended = Membership(member_id=m.id, plan_id=monthly.id, plan_type=PlanType.monthly,
                       valid_from=today - timedelta(days=90), valid_until=today - timedelta(days=60), is_active=False)
    used = Membership(member_id=m.id, plan_id=pack.id, plan_type=PlanType.swim_pass, swims_total=10, swims_used=10, is_active=True)
    db.add_all([active, upcoming, ended, used]); db.flush()
    card = SavedCard(member_id=m.id, processor_token="tqb9-o076-tpfk-lb8l", card_last4="9137", card_brand="Visa",
                     friendly_name="Visa ending 9137", auto_charge_enabled=True, auto_charge_plan_id=monthly.id,
                     next_charge_date=today + timedelta(days=21))
    db.add(card); db.flush()
    now = datetime.utcnow()
    for i in range(3):
        db.add(Checkin(member_id=m.id, membership_id=active.id, checkin_type=CheckinType.membership,
                       guest_count=1 if i == 0 else 0, checked_in_at=now - timedelta(hours=i)))
    db.add(Transaction(member_id=m.id, transaction_type=TransactionType.payment, payment_method=PaymentMethod.card,
                       amount=Decimal("135.00"), plan_id=monthly.id, saved_card_id=card.id,
                       notes="INTERNAL: owner said ok to discount next time", created_at=now - timedelta(days=1)))
    db.add(Transaction(member_id=m.id, transaction_type=TransactionType.credit_add, payment_method=PaymentMethod.cash,
                       amount=Decimal("20.00"), created_at=now - timedelta(days=2)))
    db.add(Transaction(member_id=m.id, transaction_type=TransactionType.refund, payment_method=PaymentMethod.card,
                       amount=Decimal("5.00"), created_at=now - timedelta(days=3)))
    # someone else's data must never show up
    other = Member(first_name="Other", last_name="Person", pin_hash=hash_pin("9999"), credit_balance=Decimal("0"))
    db.add(other); db.flush()
    db.add(Checkin(member_id=other.id, checkin_type=CheckinType.paid_single, checked_in_at=now))
    db.add(Transaction(member_id=other.id, transaction_type=TransactionType.payment, payment_method=PaymentMethod.cash,
                       amount=Decimal("999.00"), created_at=now))
    db.commit()
    return {"member": m, "other": other}


def _get(client, member_id, pin):
    return client.post("/api/kiosk/account-history", json={"member_id": str(member_id), "pin": pin})


def test_history_requires_correct_pin(client, history_member):
    assert _get(client, history_member["member"].id, "0000").status_code in (401, 403)
    assert client.post("/api/kiosk/account-history", json={"member_id": str(history_member["member"].id)}).status_code == 422


def test_history_get_not_allowed(client, history_member):
    # PIN must never be accepted in a URL for this endpoint
    r = client.get(f"/api/kiosk/account-history?member_id={history_member['member'].id}&pin=1234")
    assert r.status_code == 405


def test_history_plans_and_upcoming_charge(client, history_member):
    body = _get(client, history_member["member"].id, "1234").json()
    statuses = [p["status"] for p in body["plans"]]
    assert statuses == ["active", "upcoming", "used_up", "ended"]
    assert body["plans"][2]["swims_remaining"] == 0 and body["plans"][2]["swims_total"] == 10
    assert len(body["upcoming_charges"]) == 1
    c = body["upcoming_charges"][0]
    assert c["plan_name"] == "Monthly Swim" and c["amount"] == "135.00" and c["card"] == "Visa ending 9137"


def test_history_visits_and_payments_are_member_scoped(client, history_member):
    body = _get(client, history_member["member"].id, "1234").json()
    assert len(body["visits"]) == 3
    assert body["visits"][0]["guests"] == 1 and body["visits"][0]["plan_name"] == "Monthly Swim"
    assert body["visits_this_year"] >= 3
    amounts = [p["amount"] for p in body["payments"]]
    assert amounts == ["135.00", "20.00", "5.00"]
    assert "999.00" not in amounts
    pay, add, refund = body["payments"]
    assert pay["method"] == "Visa ending 9137" and pay["description"] == "Monthly Swim"
    assert add["type"] == "Money added" and add["method"] == "Cash"
    assert refund["is_refund"] is True


def test_history_never_exposes_internal_fields(client, history_member):
    raw = _get(client, history_member["member"].id, "1234").text
    assert "INTERNAL" not in raw
    assert "tqb9-o076" not in raw          # processor token
    assert "created_by" not in raw and "notes" not in raw


def test_history_empty_member(client, seed_settings, member_with_pin):
    body = _get(client, member_with_pin.id, "1234").json()
    assert body["plans"] == [] and body["visits"] == [] and body["payments"] == [] and body["upcoming_charges"] == []
    assert body["visits_this_month"] == 0

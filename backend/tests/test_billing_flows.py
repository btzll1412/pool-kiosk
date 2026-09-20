"""End-to-end tests: billing modes at the kiosk and admin, charge-to-account, scheduled charges."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction
from app.services import auto_charge_service, membership_service
from app.services.auto_charge_service import process_due_charges
from app.services.billing_service import BillingMode, quote_membership
from app.services.membership_service import create_membership
from app.routers import kiosk as kiosk_router

D = Decimal
TODAY = date(2026, 9, 15)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    """Pin 'today' to Sep 15, 2026 everywhere dates are computed."""
    for module in (kiosk_router, membership_service):
        monkeypatch.setattr(module, "_get_local_today", lambda db: TODAY)
    from app.routers import memberships as memberships_router
    monkeypatch.setattr(memberships_router, "_get_local_today", lambda db: TODAY)

    class _Date(date):
        @classmethod
        def today(cls):
            return TODAY
    monkeypatch.setattr(auto_charge_service, "date", _Date)


@pytest.fixture()
def quarterly_plan(db) -> Plan:
    plan = Plan(name="Quarterly", plan_type=PlanType.monthly, price=D("360.00"), duration_months=3, is_active=True)
    db.add(plan)
    db.commit()
    return plan


@pytest.fixture()
def saved_card(db, member_with_pin) -> SavedCard:
    card = SavedCard(member_id=member_with_pin.id, processor_token="tok_test", card_last4="4242", card_brand="Visa")
    db.add(card)
    db.commit()
    return card


def _pay_cash(client, member, plan, amount, **extra):
    return client.post("/api/kiosk/pay/cash", json={
        "member_id": str(member.id), "plan_id": str(plan.id),
        "amount_tendered": str(amount), "pin": "1234", **extra,
    })


# --- Kiosk billing modes ------------------------------------------------------

def test_kiosk_plans_offer_both_billing_options(client, member_with_pin, quarterly_plan, seed_settings):
    plans = client.get(f"/api/kiosk/plans?member_id={member_with_pin.id}").json()
    options = next(p for p in plans if p["id"] == str(quarterly_plan.id))["billing_options"]
    assert options["full"]["amount"] == "360.00"
    assert options["full"]["valid_until"] == "2026-12-14"
    assert options["prorate"]["amount"] == "304.00"
    assert options["prorate"]["next_billing_date"] == "2026-12-01"


def test_kiosk_full_price_starts_today_and_bills_on_that_day(client, db, member_with_pin, quarterly_plan, seed_settings):
    resp = _pay_cash(client, member_with_pin, quarterly_plan, "360.00")
    assert resp.status_code == 200, resp.text
    m = db.get(Membership, uuid.UUID(resp.json()["membership_id"]))
    assert (m.valid_from, m.valid_until, m.next_billing_date) == (TODAY, date(2026, 12, 14), date(2026, 12, 15))


def test_kiosk_prorated_single_charge(client, db, member_with_pin, quarterly_plan, seed_settings):
    short = _pay_cash(client, member_with_pin, quarterly_plan, "303.99", billing_mode="prorate")
    assert short.status_code == 400

    resp = _pay_cash(client, member_with_pin, quarterly_plan, "304.00", billing_mode="prorate")
    assert resp.status_code == 200, resp.text
    m = db.get(Membership, uuid.UUID(resp.json()["membership_id"]))
    assert (m.valid_until, m.next_billing_date) == (date(2026, 11, 30), date(2026, 12, 1))
    tx = db.query(Transaction).filter(Transaction.membership_id == m.id).one()
    assert tx.amount == D("304.00")


def test_kiosk_chosen_start_date_prorates_from_that_date(client, db, member_with_pin, monthly_plan, seed_settings):
    quote = client.post("/api/kiosk/quote", json={
        "member_id": str(member_with_pin.id), "plan_id": str(monthly_plan.id),
        "billing_mode": "prorate", "start_date": "2026-09-21",
    }).json()
    assert quote["amount"] == "16.67"  # 10/30 x $50

    resp = _pay_cash(client, member_with_pin, monthly_plan, "16.67", billing_mode="prorate", start_date="2026-09-21")
    assert resp.status_code == 200, resp.text
    m = db.get(Membership, uuid.UUID(resp.json()["membership_id"]))
    assert (m.valid_from, m.valid_until) == (date(2026, 9, 21), date(2026, 9, 30))


def test_kiosk_rejects_past_or_far_future_start(client, member_with_pin, monthly_plan, seed_settings):
    assert _pay_cash(client, member_with_pin, monthly_plan, "50", start_date="2026-09-14").status_code == 400
    assert _pay_cash(client, member_with_pin, monthly_plan, "50", start_date="2027-01-01").status_code == 400


# --- Future start dates (note 8) ------------------------------------------------

def test_future_membership_does_not_end_the_current_one_or_allow_early_checkin(client, db, member_with_pin, monthly_plan, seed_settings):
    current = create_membership(db, member_with_pin.id, monthly_plan.id, start_date=date(2026, 9, 1), billing_day=1)
    future = create_membership(db, member_with_pin.id, monthly_plan.id, start_date=date(2026, 10, 1), billing_day=1)
    db.commit()
    assert current.is_active and future.is_active
    assert current.valid_until == date(2026, 9, 30)

    status = client.post("/api/kiosk/search", json={"query": "Test"}).json()[0]
    assert status["active_membership"]["membership_id"] == str(current.id)


def test_future_membership_alone_cannot_check_in_yet(client, db, member_with_pin, monthly_plan, seed_settings):
    create_membership(db, member_with_pin.id, monthly_plan.id, start_date=date(2026, 10, 1))
    db.commit()
    status = client.post("/api/kiosk/search", json={"query": "Test"}).json()[0]
    assert status["active_membership"] is None


# --- Charge to account (note 1) ---------------------------------------------------

def _pay_account(client, member, plan, **extra):
    return client.post("/api/kiosk/pay/account", json={
        "member_id": str(member.id), "plan_id": str(plan.id), "pin": "1234", **extra,
    })


def test_account_needs_both_plan_and_member_switches(client, db, member_with_pin, monthly_plan, seed_settings):
    assert _pay_account(client, member_with_pin, monthly_plan).status_code == 403
    monthly_plan.allow_charge_to_account = True
    db.commit()
    assert _pay_account(client, member_with_pin, monthly_plan).status_code == 403
    member_with_pin.charge_to_account_enabled = True
    db.commit()

    plans = client.get(f"/api/kiosk/plans?member_id={member_with_pin.id}").json()
    assert next(p for p in plans if p["id"] == str(monthly_plan.id))["allow_charge_to_account"] is True

    resp = _pay_account(client, member_with_pin, monthly_plan)
    assert resp.status_code == 200, resp.text
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-50.00")
    membership = db.get(Membership, uuid.UUID(resp.json()["membership_id"]))
    assert membership.is_active and membership.valid_from == TODAY
    tx = db.get(Transaction, uuid.UUID(resp.json()["transaction_id"]))
    assert tx.payment_method == PaymentMethod.credit and tx.amount == D("50.00")


def test_account_limit_is_enforced_and_no_limit_by_default(client, db, member_with_pin, monthly_plan, seed_settings):
    monthly_plan.allow_charge_to_account = True
    member_with_pin.charge_to_account_enabled = True
    member_with_pin.charge_to_account_limit = D("75.00")
    db.commit()

    assert _pay_account(client, member_with_pin, monthly_plan).status_code == 200   # owes 50
    blocked = _pay_account(client, member_with_pin, monthly_plan)                   # would owe 100
    assert blocked.status_code == 400 and "limit" in blocked.json()["detail"].lower()

    member_with_pin.charge_to_account_limit = None
    db.commit()
    assert _pay_account(client, member_with_pin, monthly_plan).status_code == 200
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-100.00")


def test_adding_money_pays_off_the_balance(client, db, member_with_pin, seed_settings):
    member_with_pin.credit_balance = D("-50.00")
    db.commit()
    resp = client.post("/api/kiosk/add-credit", json={"member_id": str(member_with_pin.id), "amount": "30.00", "pin": "1234"})
    assert resp.status_code == 200, resp.text
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-20.00")


def test_admin_sets_account_permission_and_limit(client, db, admin_headers, member_with_pin):
    url = f"/api/members/{member_with_pin.id}/charge-to-account"
    assert client.put(url, headers=admin_headers, json={"enabled": True, "limit": "200"}).status_code == 200
    db.refresh(member_with_pin)
    assert member_with_pin.charge_to_account_enabled and member_with_pin.charge_to_account_limit == D("200")
    assert client.put(url, headers=admin_headers, json={"enabled": True, "limit": "0"}).status_code == 422
    assert client.put(url, headers=admin_headers, json={"enabled": True, "limit": None}).status_code == 200


# --- Admin: prorate + charge on start date (notes 4, 5) ----------------------------

def test_admin_quote_and_prorated_cash_membership(client, db, admin_headers, member_with_pin, quarterly_plan):
    quote = client.get("/api/memberships/quote", headers=admin_headers, params={
        "member_id": str(member_with_pin.id), "plan_id": str(quarterly_plan.id), "billing_mode": "prorate",
    }).json()
    assert quote["amount"] == "304.00"

    resp = client.post("/api/memberships", headers=admin_headers, json={
        "member_id": str(member_with_pin.id), "plan_id": str(quarterly_plan.id),
        "billing_mode": "prorate", "payment": {"payment_method": "cash"},
    })
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["valid_until"] == "2026-11-30"
    tx = db.get(Transaction, uuid.UUID(resp.json()["transaction_id"]))
    assert tx.amount == D("304.00")


def test_admin_charge_on_start_date_schedules_instead_of_charging(client, db, admin_headers, member_with_pin, monthly_plan, saved_card):
    body = {
        "member_id": str(member_with_pin.id), "plan_id": str(monthly_plan.id),
        "start_date": "2026-10-01", "billing_mode": "prorate", "charge_timing": "start_date",
        "payment": {"payment_method": "card", "saved_card_id": str(saved_card.id)},
    }
    resp = client.post("/api/memberships", headers=admin_headers, json=body)
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["scheduled_charge_date"] == "2026-10-01" and resp.json()["id"] is None
    assert db.query(Membership).count() == 0 and db.query(Transaction).count() == 0
    db.refresh(saved_card)
    assert saved_card.auto_charge_enabled and saved_card.charge_once
    assert saved_card.next_charge_date == date(2026, 10, 1)

    # Needs a future date and a card on file
    assert client.post("/api/memberships", headers=admin_headers, json={**body, "start_date": "2026-09-15"}).status_code == 400
    assert client.post("/api/memberships", headers=admin_headers, json={**body, "payment": {"payment_method": "cash"}}).status_code == 400


# --- Auto-charge ----------------------------------------------------------------------

def test_quarterly_auto_charge_renews_quarterly_not_monthly(db, member_with_pin, quarterly_plan, saved_card, seed_settings, monkeypatch):
    class _Oct1(date):
        @classmethod
        def today(cls):
            return date(2026, 10, 1)
    monkeypatch.setattr(auto_charge_service, "date", _Oct1)
    monkeypatch.setattr(membership_service, "_get_local_today", lambda db: date(2026, 10, 1))

    saved_card.auto_charge_enabled = True
    saved_card.auto_charge_plan_id = quarterly_plan.id
    saved_card.billing_day = 1
    saved_card.next_charge_date = date(2026, 10, 1)
    db.commit()

    result = process_due_charges(db)
    assert result["succeeded"] == 1, result
    db.refresh(saved_card)
    assert saved_card.next_charge_date == date(2027, 1, 1)
    tx = db.query(Transaction).one()
    assert tx.amount == D("360.00")
    membership = db.query(Membership).one()
    assert membership.valid_until == date(2026, 12, 31)


def test_one_time_scheduled_charge_turns_itself_off(db, member_with_pin, monthly_plan, saved_card, seed_settings):
    saved_card.auto_charge_enabled = True
    saved_card.auto_charge_plan_id = monthly_plan.id
    saved_card.billing_day = 1
    saved_card.next_charge_date = TODAY
    saved_card.charge_once = True
    db.commit()

    assert process_due_charges(db)["succeeded"] == 1
    db.refresh(saved_card)
    assert not saved_card.auto_charge_enabled and saved_card.next_charge_date is None
    # Started mid-cycle on the 15th -> prorated to the 1st
    assert db.query(Transaction).one().amount == quote_membership(D("50"), 1, TODAY, BillingMode.prorate, 1).amount


def test_kiosk_saved_card_charges_the_amount_due_not_list_price(client, db, member_with_pin, monthly_plan, saved_card, seed_settings):
    member_with_pin.credit_balance = D("20.00")
    db.commit()
    resp = client.post("/api/kiosk/pay/card", json={
        "member_id": str(member_with_pin.id), "plan_id": str(monthly_plan.id), "pin": "1234",
        "saved_card_id": str(saved_card.id), "use_credit": True,
    })
    assert resp.status_code == 200, resp.text
    card_tx = db.query(Transaction).filter(Transaction.payment_method == PaymentMethod.card).one()
    assert card_tx.amount == D("30.00")


def test_admin_can_record_partial_payment_toward_owed_balance(client, db, admin_headers, member_with_pin):
    member_with_pin.credit_balance = D("-145.00")
    db.commit()
    url = f"/api/members/{member_with_pin.id}/credit"
    partial = client.post(url, headers=admin_headers, json={"amount": "50.00", "notes": "Balance payment"})
    assert partial.status_code == 200, partial.text
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-95.00")
    # Deductions still may not push a balance below zero
    assert client.post(url, headers=admin_headers, json={"amount": "-10.00", "notes": "x"}).status_code == 400

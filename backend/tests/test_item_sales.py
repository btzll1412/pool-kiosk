"""Item plans: one-time sales (fixed or open amount) that create no membership."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.membership_service import create_membership

D = Decimal


@pytest.fixture()
def towel_plan(db) -> Plan:
    plan = Plan(name="Towel", plan_type=PlanType.item, price=D("5.00"), is_active=True, allow_charge_to_account=True)
    db.add(plan)
    db.commit()
    return plan


@pytest.fixture()
def shop_plan(db) -> Plan:
    plan = Plan(name="Snack Bar", plan_type=PlanType.item, price=D("0.00"), open_amount=True,
                min_amount=D("1.00"), max_amount=D("50.00"), is_active=True)
    db.add(plan)
    db.commit()
    return plan


@pytest.fixture()
def saved_card(db, member_with_pin) -> SavedCard:
    card = SavedCard(member_id=member_with_pin.id, processor_token="tok_test", card_last4="4242", card_brand="Visa")
    db.add(card)
    db.commit()
    return card


def _cash(client, member, plan, tendered, **extra):
    return client.post("/api/kiosk/pay/cash", json={
        "member_id": str(member.id), "plan_id": str(plan.id), "amount_tendered": str(tendered), "pin": "1234", **extra,
    })


def _payments(db, member_id=None):
    q = db.query(Transaction).filter(Transaction.transaction_type == TransactionType.payment)
    if member_id:
        q = q.filter(Transaction.member_id == member_id)
    return q.order_by(Transaction.created_at).all()


# --- Plan rules ----------------------------------------------------------------

def test_admin_creates_fixed_and_open_item_plans(client, admin_headers):
    r = client.post("/api/plans", json={"name": "Goggles", "plan_type": "item", "price": "12.00"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    assert r.json()["open_amount"] is False and r.json()["price"] == "12.00"

    r = client.post("/api/plans", json={"name": "Shop", "plan_type": "item", "open_amount": True,
                                        "min_amount": "1.00", "max_amount": "100.00"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["open_amount"] is True and body["min_amount"] == "1.00" and body["price"] == "0.00"

    listed = client.get("/api/plans", headers=admin_headers).json()
    shop = next(p for p in listed if p["name"] == "Shop")
    assert shop["open_amount"] is True and shop["max_amount"] == "100.00"


def test_plan_rules_reject_bad_combinations(client, admin_headers):
    bad = [
        {"name": "A", "plan_type": "item", "price": "0.00"},                       # fixed item needs a price
        {"name": "B", "plan_type": "item", "open_amount": True, "min_amount": "10", "max_amount": "5"},
        {"name": "C", "plan_type": "single", "price": "5.00", "open_amount": True},  # only items are open
        {"name": "D", "plan_type": "item", "price": "5.00", "max_amount": "9"},     # limits only with open amount
    ]
    for payload in bad:
        r = client.post("/api/plans", json=payload, headers=admin_headers)
        assert r.status_code == 400, payload


def test_item_plan_never_becomes_a_membership(db, member_with_pin, towel_plan, client, admin_headers):
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        create_membership(db, member_with_pin.id, towel_plan.id)
    r = client.post("/api/memberships", json={"member_id": str(member_with_pin.id), "plan_id": str(towel_plan.id)}, headers=admin_headers)
    assert r.status_code == 400


def test_kiosk_plans_show_item_fields(client, member_with_pin, towel_plan, shop_plan, seed_settings):
    plans = client.get("/api/kiosk/plans", params={"member_id": str(member_with_pin.id)}).json()
    by_name = {p["name"]: p for p in plans}
    assert by_name["Towel"]["plan_type"] == "item" and by_name["Towel"]["open_amount"] is False
    assert by_name["Towel"]["billing_options"] is None
    assert by_name["Snack Bar"]["open_amount"] is True
    assert by_name["Snack Bar"]["min_amount"] == "1.00" and by_name["Snack Bar"]["max_amount"] == "50.00"


# --- Kiosk member purchases -----------------------------------------------------

def test_cash_item_sale_records_description_and_no_membership(client, db, member_with_pin, towel_plan, seed_settings):
    r = _cash(client, member_with_pin, towel_plan, "5.00", description="Blue towel")
    assert r.status_code == 200, r.text
    assert r.json()["membership_id"] is None
    assert db.query(Membership).count() == 0
    [tx] = _payments(db, member_with_pin.id)
    assert tx.amount == D("5.00") and tx.plan_id == towel_plan.id and tx.notes == "Blue towel"
    assert tx.membership_id is None


def test_description_is_required(client, db, member_with_pin, towel_plan, seed_settings):
    assert _cash(client, member_with_pin, towel_plan, "5.00").status_code == 400
    assert _cash(client, member_with_pin, towel_plan, "5.00", description="   ").status_code == 400
    assert db.query(Transaction).count() == 0


def test_open_amount_respects_min_and_max(client, db, member_with_pin, shop_plan, seed_settings):
    assert _cash(client, member_with_pin, shop_plan, "5.00", description="Chips").status_code == 400  # no amount
    assert _cash(client, member_with_pin, shop_plan, "0.50", description="Chips", amount="0.50").status_code == 400
    assert _cash(client, member_with_pin, shop_plan, "60.00", description="Chips", amount="60.00").status_code == 400
    r = _cash(client, member_with_pin, shop_plan, "7.25", description="Chips and a drink", amount="7.25")
    assert r.status_code == 200, r.text
    [tx] = _payments(db, member_with_pin.id)
    assert tx.amount == D("7.25") and tx.notes == "Chips and a drink"


def test_fixed_price_item_ignores_amount_sent(client, db, member_with_pin, towel_plan, seed_settings):
    r = _cash(client, member_with_pin, towel_plan, "5.00", description="Towel", amount="1.00")
    assert r.status_code == 200, r.text
    assert _payments(db, member_with_pin.id)[0].amount == D("5.00")


def test_quote_returns_item_amount(client, member_with_pin, shop_plan, seed_settings):
    r = client.post("/api/kiosk/quote", json={"member_id": str(member_with_pin.id), "plan_id": str(shop_plan.id),
                                              "description": "Ice cream", "amount": "3.50"})
    assert r.status_code == 200 and r.json() == {"amount": "3.50", "quote": None}


def test_item_on_account_goes_negative_and_creates_nothing(client, db, member_with_pin, towel_plan, seed_settings):
    member_with_pin.charge_to_account_enabled = True
    db.commit()
    r = client.post("/api/kiosk/pay/account", json={"member_id": str(member_with_pin.id), "plan_id": str(towel_plan.id),
                                                    "pin": "1234", "description": "Towel for guest"})
    assert r.status_code == 200, r.text
    assert "swim" not in r.json()["message"].lower()
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-5.00")
    assert db.query(Membership).count() == 0
    [tx] = _payments(db, member_with_pin.id)
    assert tx.notes.startswith("Towel for guest — Charged to account")


def test_item_paid_with_saved_card_charges_amount_entered(client, db, member_with_pin, shop_plan, saved_card, seed_settings):
    r = client.post("/api/kiosk/pay/card", json={"member_id": str(member_with_pin.id), "plan_id": str(shop_plan.id),
                                                 "pin": "1234", "saved_card_id": str(saved_card.id),
                                                 "description": "Sunscreen", "amount": "9.99"})
    assert r.status_code == 200, r.text
    [tx] = _payments(db, member_with_pin.id)
    assert tx.amount == D("9.99") and tx.payment_method == PaymentMethod.card and tx.notes == "Sunscreen"
    assert tx.membership_id is None and db.query(Membership).count() == 0


def test_item_paid_with_credit(client, db, member_with_pin, towel_plan, seed_settings):
    member_with_pin.credit_balance = D("20.00")
    db.commit()
    r = client.post("/api/kiosk/pay/credit", json={"member_id": str(member_with_pin.id), "plan_id": str(towel_plan.id),
                                                   "pin": "1234", "description": "Towel"})
    assert r.status_code == 200 and r.json()["success"] is True
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("15.00")
    assert db.query(Membership).count() == 0


def test_item_split_payment(client, db, member_with_pin, shop_plan, saved_card, seed_settings):
    r = client.post("/api/kiosk/pay/split", json={"member_id": str(member_with_pin.id), "plan_id": str(shop_plan.id),
                                                  "pin": "1234", "cash_amount": "4.00", "saved_card_id": str(saved_card.id),
                                                  "description": "Lunch", "amount": "10.00"})
    assert r.status_code == 200, r.text
    txs = _payments(db, member_with_pin.id)
    assert sorted(t.amount for t in txs) == [D("4.00"), D("6.00")]
    assert all(t.notes.startswith("Lunch") and t.membership_id is None for t in txs)


def test_membership_plans_still_work_unchanged(client, db, member_with_pin, single_swim_plan, seed_settings):
    r = _cash(client, member_with_pin, single_swim_plan, "5.00")
    assert r.status_code == 200 and r.json()["membership_id"]
    assert db.query(Membership).count() == 1


# --- Guests -------------------------------------------------------------------

def test_guest_buys_item_with_cash(client, db, towel_plan, seed_settings):
    r = client.post("/api/kiosk/guest", json={"name": "Visitor", "phone": "555", "payment_method": "cash",
                                              "plan_id": str(towel_plan.id), "cash_tendered": "5.00",
                                              "description": "Towel"})
    assert r.status_code == 200, r.text
    assert r.json()["visit_id"] is None and r.json()["amount_paid"] == "5.00"
    from app.models.guest_visit import GuestVisit
    assert db.query(GuestVisit).count() == 0
    [tx] = _payments(db)
    assert tx.member_id is None and tx.guest_name == "Visitor" and tx.plan_id == towel_plan.id
    assert tx.notes.startswith("Towel — Guest: Visitor")


def test_guest_item_needs_description_and_valid_amount(client, db, shop_plan, seed_settings):
    base = {"name": "Visitor", "phone": "555", "payment_method": "cash", "plan_id": str(shop_plan.id)}
    assert client.post("/api/kiosk/guest", json={**base, "amount": "5.00"}).status_code == 400
    assert client.post("/api/kiosk/guest", json={**base, "description": "Soda", "amount": "99.00"}).status_code == 400
    assert db.query(Transaction).count() == 0


def test_guest_item_with_card(client, db, shop_plan, seed_settings, monkeypatch):
    from app.payments.base import SavedCardChargeResult
    from app.payments.stub import StubPaymentAdapter
    captured = {}

    def fake_sale(self, **kwargs):
        captured.update(kwargs)
        return SavedCardChargeResult(success=True, reference_id="ref-123")
    monkeypatch.setattr(StubPaymentAdapter, "process_manual_card_sale", fake_sale, raising=False)

    r = client.post("/api/kiosk/guest/pay/card", json={"name": "Visitor", "plan_id": str(shop_plan.id),
                                                       "card_number": "4111111111111111", "exp_date": "1230", "cvv": "123",
                                                       "description": "Two sodas", "amount": "4.00"})
    assert r.status_code == 200, r.text
    [tx] = _payments(db)
    assert tx.amount == D("4.00") and tx.payment_method == PaymentMethod.card and tx.guest_name == "Visitor"
    assert tx.reference_id == "ref-123" and captured["amount"] == D("4.00")
    assert "Two sodas" in tx.notes


# --- Admin record sale -----------------------------------------------------------

def _sale(client, headers, member, plan, **body):
    return client.post(f"/api/members/{member.id}/sales", json={"plan_id": str(plan.id), **body}, headers=headers)


def test_admin_records_cash_sale(client, db, admin_headers, member_with_pin, shop_plan):
    r = _sale(client, admin_headers, member_with_pin, shop_plan, description="Swim cap", amount="8.00", payment_method="cash")
    assert r.status_code == 200, r.text
    [tx] = _payments(db, member_with_pin.id)
    assert tx.amount == D("8.00") and tx.payment_method == PaymentMethod.cash and tx.notes == "Swim cap"
    assert tx.created_by is not None and db.query(Membership).count() == 0


def test_admin_charges_sale_to_account_and_credit(client, db, admin_headers, member_with_pin, towel_plan):
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="account")
    assert r.status_code == 200, r.text
    assert r.json()["credit_balance"] == "-5.00"

    member_with_pin.credit_balance = D("3.00")
    db.commit()
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="credit")
    assert r.status_code == 400  # not enough credit
    member_with_pin.credit_balance = D("5.00")
    db.commit()
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="credit")
    assert r.status_code == 200 and r.json()["credit_balance"] == "0.00"


def test_admin_sale_with_saved_card(client, db, admin_headers, member_with_pin, towel_plan, saved_card):
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="saved_card",
              saved_card_id=str(saved_card.id))
    assert r.status_code == 200, r.text
    [tx] = _payments(db, member_with_pin.id)
    assert tx.saved_card_id == saved_card.id and tx.notes == "Towel" and tx.membership_id is None


def test_admin_sale_rejects_membership_plans(client, admin_headers, member_with_pin, single_swim_plan):
    r = _sale(client, admin_headers, member_with_pin, single_swim_plan, description="x", payment_method="cash")
    assert r.status_code == 404


def test_admin_sale_with_new_card_and_save(client, db, admin_headers, member_with_pin, shop_plan, monkeypatch):
    from app.payments.base import SavedCardChargeResult
    from app.payments.stub import StubPaymentAdapter
    captured = {}

    def fake_sale(self, **kwargs):
        captured.update(kwargs)
        return SavedCardChargeResult(success=True, reference_id="ref-777", card_token="tok_new")
    monkeypatch.setattr(StubPaymentAdapter, "process_manual_card_sale", fake_sale, raising=False)

    r = _sale(client, admin_headers, member_with_pin, shop_plan, description="Lesson", amount="25.00",
              payment_method="new_card", card_number="4111 1111 1111 1111", exp_date="12/30", cvv="123", save_card=True)
    assert r.status_code == 200, r.text
    assert captured["amount"] == D("25.00") and captured["save_card"] is True
    [tx] = _payments(db, member_with_pin.id)
    assert tx.amount == D("25.00") and tx.reference_id == "ref-777" and tx.notes == "Lesson — Card ****1111"
    card = db.query(SavedCard).filter(SavedCard.member_id == member_with_pin.id).one()
    assert card.card_last4 == "1111" and tx.saved_card_id == card.id and db.query(Membership).count() == 0


def test_admin_sale_new_card_requires_card_fields(client, admin_headers, member_with_pin, towel_plan):
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="new_card")
    assert r.status_code == 400
    r = _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="new_card",
              card_number="12", exp_date="1230", cvv="123")
    assert r.status_code == 422


# --- Item Sales page --------------------------------------------------------------

def _fake_card(monkeypatch, reference="ref-xyz"):
    from app.payments.base import SavedCardChargeResult
    from app.payments.stub import StubPaymentAdapter
    monkeypatch.setattr(StubPaymentAdapter, "process_manual_card_sale",
                        lambda self, **kw: SavedCardChargeResult(success=True, reference_id=reference), raising=False)


def test_guest_item_sale_keeps_the_phone(client, db, towel_plan, seed_settings):
    r = client.post("/api/kiosk/guest", json={"name": "Frady", "phone": "(845) 555-1234", "payment_method": "cash",
                                              "plan_id": str(towel_plan.id), "cash_tendered": "5.00", "description": "Towel"})
    assert r.status_code == 200, r.text
    [tx] = _payments(db)
    assert tx.phone == "(845) 555-1234" and tx.guest_name == "Frady"


def _seed_sales(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, monkeypatch):
    """One member cash sale, one guest cash sale, one guest split sale."""
    assert _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel for Test", payment_method="cash").status_code == 200
    assert client.post("/api/kiosk/guest", json={"name": "Walk In", "phone": "845-555-0001", "payment_method": "cash",
                                                 "plan_id": str(shop_plan.id), "cash_tendered": "6.00",
                                                 "description": "Two sodas", "amount": "6.00"}).status_code == 200
    _fake_card(monkeypatch)
    r = client.post("/api/kiosk/guest/pay/split", json={"name": "Split Guest", "phone": "212-555-0002", "plan_id": str(shop_plan.id),
                                                        "cash_amount": "10.00", "card_number": "4111111111111111",
                                                        "exp_date": "1230", "cvv": "123", "description": "Goggles", "amount": "25.00"})
    assert r.status_code == 200, r.text


def test_item_sales_page_lists_members_and_guests_with_phone(client, db, admin_headers, member_with_pin, towel_plan, shop_plan,
                                                             seed_settings, monkeypatch):
    _seed_sales(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, monkeypatch)

    assert client.get("/api/item-sales").status_code in (401, 403)

    body = client.get("/api/item-sales", headers=admin_headers).json()
    assert body["total"] == 3
    rows = {r["name"]: r for r in body["items"]}

    member_row = rows["Test Member"]
    assert member_row["buyer"] == "member" and member_row["phone"] == "555-0100" and member_row["member_id"] == str(member_with_pin.id)
    assert member_row["plan_name"] == "Towel" and member_row["description"] == "Towel for Test"
    assert member_row["amount"] == "5.00" and member_row["method"] == "cash" and member_row["recorded_by"] == "testadmin"

    guest_row = rows["Walk In"]
    assert guest_row["buyer"] == "guest" and guest_row["phone"] == "845-555-0001" and guest_row["member_id"] is None
    assert guest_row["description"] == "Two sodas" and guest_row["amount"] == "6.00" and guest_row["recorded_by"] == "kiosk"

    split_row = rows["Split Guest"]
    assert split_row["phone"] == "212-555-0002" and split_row["amount"] == "25.00" and split_row["method"] == "split"
    assert [p["method"] for p in split_row["parts"]] == ["cash", "card"]
    assert split_row["parts"][1]["card_last4"] == "1111" and "****1111" in split_row["method_label"]

    s = body["summary"]
    assert s["count"] == 3 and s["amount"] == "36.00" and s["cash"] == "21.00" and s["card"] == "15.00"


def test_item_sales_filters(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, seed_settings, monkeypatch):
    _seed_sales(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, monkeypatch)
    names = lambda **params: sorted(r["name"] for r in client.get("/api/item-sales", params=params, headers=admin_headers).json()["items"])

    assert names(buyer="guest") == ["Split Guest", "Walk In"]
    assert names(buyer="member") == ["Test Member"]
    assert names(plan_id=str(towel_plan.id)) == ["Test Member"]
    assert names(method="card") == ["Split Guest"]
    assert names(method="split") == ["Split Guest"]
    assert names(method="cash") == ["Split Guest", "Test Member", "Walk In"]
    assert names(method="account") == []
    assert names(search="0002") == ["Split Guest"]          # guest phone, digits only
    assert names(search="555-0100") == ["Test Member"]      # member phone from profile
    assert names(search="soda") == ["Walk In"]              # description
    assert names(search="walk") == ["Walk In"]              # guest name
    assert names(search="test mem") == ["Test Member"]      # member full name

    today = date.today()
    assert len(names(start_date=str(today - timedelta(days=1)), end_date=str(today + timedelta(days=1)))) == 3
    assert names(start_date=str(today + timedelta(days=2))) == []
    assert names(end_date=str(today - timedelta(days=2))) == []

    plans = client.get("/api/item-sales/plans", headers=admin_headers).json()
    assert {p["name"] for p in plans} == {"Towel", "Snack Bar"} and all(p["archived"] is False for p in plans)


def test_item_sales_csv_has_phone_column(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, seed_settings, monkeypatch):
    _seed_sales(client, db, admin_headers, member_with_pin, towel_plan, shop_plan, monkeypatch)
    r = client.get("/api/item-sales/export", params={"buyer": "guest"}, headers=admin_headers)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "Date,Time,Buyer,Name,Phone,Item,Description,Amount,Payment,Recorded By"
    assert len(lines) == 3
    assert any("Walk In,845-555-0001,Snack Bar,Two sodas,6.00,cash,kiosk" in l for l in lines)
    assert any("Split Guest,212-555-0002,Snack Bar,Goggles,25.00,split: cash $10.00 + card $15.00 ****1111,kiosk" in l for l in lines)


def test_item_sales_page_ignores_memberships_and_refunds(client, db, admin_headers, member_with_pin, single_swim_plan, towel_plan, seed_settings):
    assert _cash(client, member_with_pin, single_swim_plan, single_swim_plan.price).status_code == 200
    assert _sale(client, admin_headers, member_with_pin, towel_plan, description="Towel", payment_method="cash").status_code == 200
    body = client.get("/api/item-sales", headers=admin_headers).json()
    assert body["total"] == 1 and body["items"][0]["plan_name"] == "Towel"

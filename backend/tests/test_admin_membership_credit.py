"""Admin Add Membership: account credit first (any chosen amount), the rest by cash / card / account."""
from decimal import Decimal

import pytest

from app.models.membership import Membership
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType

D = Decimal


@pytest.fixture()
def rich_member(db, member_with_pin):
    member_with_pin.credit_balance = D("30.00")
    db.commit()
    return member_with_pin


@pytest.fixture()
def saved_card(db, member_with_pin) -> SavedCard:
    card = SavedCard(member_id=member_with_pin.id, processor_token="tok_test", card_last4="4242", card_brand="Visa")
    db.add(card)
    db.commit()
    return card


def _create(client, headers, member, plan, payment, **extra):
    return client.post("/api/memberships", json={"member_id": str(member.id), "plan_id": str(plan.id), "payment": payment, **extra},
                       headers=headers)


def _payments(db):
    return db.query(Transaction).filter(Transaction.transaction_type == TransactionType.payment).order_by(Transaction.amount).all()


def test_credit_covers_the_whole_price(client, db, admin_headers, rich_member, single_swim_plan, seed_settings):
    r = _create(client, admin_headers, rich_member, single_swim_plan, {"payment_method": "credit", "credit_amount": "5.00"})
    assert r.status_code in (200, 201), r.text
    assert r.json()["credit_used"] == "5.00" and "account credit" in r.json()["message"]
    db.refresh(rich_member)
    assert rich_member.credit_balance == D("25.00")
    [tx] = _payments(db)
    assert tx.payment_method == PaymentMethod.credit and tx.amount == D("5.00") and tx.related_transaction_id is None
    assert tx.membership_id is not None and db.query(Membership).count() == 1
    assert "Charged to account" not in tx.notes  # this is credit, not a debt


def test_credit_method_must_cover_full_price(client, db, admin_headers, rich_member, monthly_plan, seed_settings):
    r = _create(client, admin_headers, rich_member, monthly_plan, {"payment_method": "credit", "credit_amount": "20.00"},
                billing_mode="full")
    assert r.status_code == 400 and "cover the full" in r.json()["detail"]
    assert db.query(Membership).count() == 0


def test_partial_credit_then_cash(client, db, admin_headers, rich_member, monthly_plan, seed_settings):
    r = _create(client, admin_headers, rich_member, monthly_plan,
                {"payment_method": "cash", "credit_amount": "20.00", "amount_tendered": "40.00"}, billing_mode="full")
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["credit_used"] == "20.00" and body["credit_added"] == "10.00"   # $50 price: 20 credit + 30 cash, 10 over
    db.refresh(rich_member)
    assert rich_member.credit_balance == D("20.00")  # 30 - 20 used + 10 overpayment
    credit_tx, cash_tx = _payments(db)
    assert cash_tx.payment_method == PaymentMethod.cash and cash_tx.amount == D("30.00")
    assert credit_tx.payment_method == PaymentMethod.credit and credit_tx.amount == D("20.00")
    assert credit_tx.related_transaction_id == cash_tx.id and credit_tx.membership_id == cash_tx.membership_id


def test_partial_credit_then_saved_card_charges_only_the_rest(client, db, admin_headers, rich_member, monthly_plan, saved_card, seed_settings):
    r = _create(client, admin_headers, rich_member, monthly_plan,
                {"payment_method": "card", "saved_card_id": str(saved_card.id), "credit_amount": "12.50"}, billing_mode="full")
    assert r.status_code in (200, 201), r.text
    credit_tx, card_tx = _payments(db)
    assert card_tx.payment_method == PaymentMethod.card and card_tx.amount == D("37.50") and card_tx.saved_card_id == saved_card.id
    assert credit_tx.amount == D("12.50") and credit_tx.related_transaction_id == card_tx.id
    db.refresh(rich_member)
    assert rich_member.credit_balance == D("17.50")


def test_partial_credit_then_charge_to_account(client, db, admin_headers, rich_member, monthly_plan, seed_settings):
    r = _create(client, admin_headers, rich_member, monthly_plan, {"payment_method": "account", "credit_amount": "30.00"},
                billing_mode="full")
    assert r.status_code in (200, 201), r.text
    db.refresh(rich_member)
    assert rich_member.credit_balance == D("-20.00")  # used all 30, owes the other 20
    account_tx, credit_tx = _payments(db)
    assert account_tx.amount == D("20.00") and "Charged to account" in account_tx.notes and "-20.00" in account_tx.notes
    assert credit_tx.amount == D("30.00") and credit_tx.related_transaction_id == account_tx.id
    assert db.query(Membership).count() == 1


def test_charge_to_account_without_credit(client, db, admin_headers, member_with_pin, single_swim_plan, seed_settings):
    r = _create(client, admin_headers, member_with_pin, single_swim_plan, {"payment_method": "account"})
    assert r.status_code in (200, 201), r.text
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("-5.00")
    [tx] = _payments(db)
    assert tx.payment_method == PaymentMethod.credit and tx.amount == D("5.00")


def test_credit_amount_is_validated(client, db, admin_headers, rich_member, monthly_plan, seed_settings):
    too_much = _create(client, admin_headers, rich_member, monthly_plan, {"payment_method": "cash", "credit_amount": "31.00"}, billing_mode="full")
    assert too_much.status_code == 400 and "only has $30.00" in too_much.json()["detail"]
    over_price = _create(client, admin_headers, rich_member, monthly_plan,
                         {"payment_method": "cash", "credit_amount": "25.00", "charge_amount": "20.00"}, billing_mode="full")
    assert over_price.status_code == 400 and "cannot exceed" in over_price.json()["detail"]
    assert db.query(Membership).count() == 0 and db.query(Transaction).count() == 0
    db.refresh(rich_member)
    assert rich_member.credit_balance == D("30.00")


def test_plain_cash_unchanged(client, db, admin_headers, member_with_pin, single_swim_plan, seed_settings):
    r = _create(client, admin_headers, member_with_pin, single_swim_plan, {"payment_method": "cash", "amount_tendered": "5.00"})
    assert r.status_code in (200, 201), r.text
    assert r.json()["credit_used"] == "0.00"
    [tx] = _payments(db)
    assert tx.payment_method == PaymentMethod.cash and tx.amount == D("5.00")

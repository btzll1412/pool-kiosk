"""Kiosk Add Money: credit only after a real payment, admin-set limit and message."""
from decimal import Decimal as D

import pytest

from app.models.activity_log import ActivityLog
from app.models.saved_card import SavedCard
from app.models.setting import Setting
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.payments.base import SavedCardChargeResult


class FakeAdapter:
    def __init__(self, approve=True, token="tqb9-o076-tpfk-lb8l"):
        self.approve, self.token, self.calls = approve, token, []

    def charge_saved_card(self, token, amount, member_id, description, customer_name=None):
        self.calls.append(("saved", token, amount, description))
        return SavedCardChargeResult(success=self.approve, reference_id="ref123" if self.approve else None,
                                     message="ok" if self.approve else "Card Declined (05)")

    def process_manual_card_sale(self, card_number, exp_date, cvv, amount, member_id, description, save_card=False, customer_name=None):
        self.calls.append(("manual", card_number[-4:], amount, description, save_card))
        return SavedCardChargeResult(success=self.approve, reference_id="ref456" if self.approve else None,
                                     message="ok" if self.approve else "Card Declined (05)",
                                     card_token=self.token if (self.approve and save_card) else None)


@pytest.fixture()
def adapter(monkeypatch):
    a = FakeAdapter()
    monkeypatch.setattr("app.services.topup_service.get_payment_adapter", lambda db: a)
    return a


@pytest.fixture()
def card(db, member_with_pin):
    c = SavedCard(member_id=member_with_pin.id, processor_token="tok_test", card_last4="4242", card_brand="Visa")
    db.add(c); db.commit()
    return c


def _body(member, **kw):
    return {"member_id": str(member.id), "pin": "1234", "amount": "50.00", "description": "Season credit", **kw}


def _set(db, key, value):
    row = db.query(Setting).filter(Setting.key == key).first()
    row.value = value
    db.commit()


def test_old_free_credit_endpoint_is_gone(client, member_with_pin, seed_settings):
    r = client.post("/api/kiosk/add-credit", json={"member_id": str(member_with_pin.id), "amount": "30.00", "pin": "1234"})
    assert r.status_code in (404, 405)


def test_cash_topup_credits_what_was_put_in(client, db, member_with_pin, seed_settings):
    r = client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount_tendered="60.00"))
    assert r.status_code == 200, r.text
    assert r.json()["amount_added"] == "60.00"
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("60.00")
    tx = db.query(Transaction).one()
    assert tx.transaction_type == TransactionType.credit_add and tx.payment_method == PaymentMethod.cash
    assert tx.notes == "Kiosk add money: Season credit (cash)"
    assert db.query(ActivityLog).filter(ActivityLog.action_type == "credit.kiosk_topup").count() == 1


def test_cash_less_than_amount_is_refused(client, db, member_with_pin, seed_settings):
    r = client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount_tendered="40.00"))
    assert r.status_code == 400
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("0.00") and db.query(Transaction).count() == 0


def test_saved_card_topup_only_after_approval(client, db, member_with_pin, seed_settings, card, adapter):
    r = client.post("/api/kiosk/topup/card", json=_body(member_with_pin, saved_card_id=str(card.id)))
    assert r.status_code == 200, r.text
    assert adapter.calls[0][:3] == ("saved", "tok_test", D("50.00"))
    assert "Season credit" in adapter.calls[0][3]
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("50.00")
    tx = db.query(Transaction).one()
    assert tx.payment_method == PaymentMethod.card and tx.reference_id == "ref123" and tx.saved_card_id == card.id


def test_declined_card_adds_nothing(client, db, member_with_pin, seed_settings, card, adapter):
    adapter.approve = False
    r = client.post("/api/kiosk/topup/card", json=_body(member_with_pin, saved_card_id=str(card.id)))
    assert r.status_code == 402 and "Declined" in r.json()["detail"]
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("0.00") and db.query(Transaction).count() == 0


def test_cannot_use_someone_elses_card(client, db, member_with_pin, seed_settings, adapter):
    from app.models.member import Member
    other = Member(first_name="O", last_name="P", credit_balance=D("0"))
    db.add(other); db.flush()
    their = SavedCard(member_id=other.id, processor_token="tok_other", card_last4="1111", card_brand="Visa")
    db.add(their); db.commit()
    r = client.post("/api/kiosk/topup/card", json=_body(member_with_pin, saved_card_id=str(their.id)))
    assert r.status_code == 404 and adapter.calls == []


def test_new_card_topup_and_save(client, db, member_with_pin, seed_settings, adapter):
    r = client.post("/api/kiosk/topup/card/manual", json=_body(
        member_with_pin, card_number="4111 1111 1111 1111", exp_date="1230", cvv="123", save_card=True))
    assert r.status_code == 200, r.text
    assert r.json()["card_saved"] is True
    saved = db.query(SavedCard).one()
    assert saved.processor_token == "tqb9-o076-tpfk-lb8l" and saved.card_last4 == "1111"
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("50.00")


def test_wrong_pin_and_missing_description(client, db, member_with_pin, seed_settings):
    assert client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, pin="0000", amount_tendered="50")).status_code in (401, 403)
    r = client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, description="   ", amount_tendered="50"))
    assert r.status_code == 400
    assert client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="0", amount_tendered="0")).status_code == 400
    assert client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="-5", amount_tendered="5")).status_code == 400
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("0.00")


def test_limit_and_message_come_from_settings(client, db, member_with_pin, seed_settings, card, adapter):
    r = client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="500.01", amount_tendered="500.01"))
    assert r.status_code == 400
    assert r.json()["detail"] == "Amounts over $500.00 can't be added at the kiosk. Please contact support."
    # cash: putting more than the limit in the box is refused too
    assert client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="100", amount_tendered="900")).status_code == 400
    assert client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="500", amount_tendered="500")).status_code == 200

    _set(db, "kiosk_topup_max", "100")
    _set(db, "kiosk_topup_limit_message", "Max {limit} here, see the office.")
    r = client.post("/api/kiosk/topup/card", json=_body(member_with_pin, amount="150", saved_card_id=str(card.id)))
    assert r.status_code == 400 and r.json()["detail"] == "Max $100.00 here, see the office."
    assert adapter.calls == []  # never sent to the processor
    s = client.get("/api/kiosk/settings").json()
    assert s["kiosk_topup_max"] == "100" and s["kiosk_topup_limit_message"] == "Max {limit} here, see the office."


def test_paying_off_a_debt(client, db, member_with_pin, seed_settings):
    member_with_pin.credit_balance = D("-50.00"); db.commit()
    r = client.post("/api/kiosk/topup/cash", json=_body(member_with_pin, amount="50.00", amount_tendered="50.00", description="Balance payment"))
    assert r.status_code == 200 and "paid toward your balance" in r.json()["message"]
    db.refresh(member_with_pin)
    assert member_with_pin.credit_balance == D("0.00")

"""Tests for payment endpoints (cash, card, split)."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan
from app.models.saved_card import SavedCard
from app.models.transaction import Transaction


class TestCashPayment:
    def test_exact_payment(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "1234",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert Decimal(data["change_due"]) == Decimal("0.00")
        assert Decimal(data["credit_added"]) == Decimal("0.00")
        assert data["membership_id"] is not None

    def test_overpay_adds_credit(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "7.50",
            "pin": "1234",
            "wants_change": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert Decimal(data["credit_added"]) == Decimal("2.50")
        assert Decimal(data["change_due"]) == Decimal("0.00")

        # Verify credit was added to member
        db.refresh(member_with_pin)
        assert member_with_pin.credit_balance == Decimal("2.50")

    def test_overpay_wants_change(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "10.00",
            "pin": "1234",
            "wants_change": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert Decimal(data["change_due"]) == Decimal("5.00")
        assert Decimal(data["credit_added"]) == Decimal("0.00")

        # Verify credit was NOT added
        db.refresh(member_with_pin)
        assert member_with_pin.credit_balance == Decimal("0.00")

    def test_underpay_rejected(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "3.00",
            "pin": "1234",
        })
        assert resp.status_code == 400

    def test_wrong_pin_rejected(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "9999",
        })
        assert resp.status_code == 401

    def test_creates_membership(self, client, db: Session, member_with_pin, monthly_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(monthly_plan.id),
            "amount_tendered": "50.00",
            "pin": "1234",
        })
        assert resp.status_code == 200

        # Verify membership was created
        membership = db.query(Membership).filter(
            Membership.member_id == member_with_pin.id,
        ).first()
        assert membership is not None
        assert membership.plan_type.value == "monthly"
        assert membership.valid_from is not None
        assert membership.valid_until is not None


class TestCardPayment:
    def test_card_payment_new_card(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/card", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "pin": "1234",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["membership_id"] is not None

    def test_card_payment_saved_card(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        # Create a saved card first
        card = SavedCard(
            member_id=member_with_pin.id,
            processor_token="tok_test_123",
            card_last4="4242",
            card_brand="Visa",
            friendly_name="My Visa",
        )
        db.add(card)
        db.commit()
        db.refresh(card)

        resp = client.post("/api/kiosk/pay/card", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "pin": "1234",
            "saved_card_id": str(card.id),
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_card_payment_save_new_card(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/card", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "pin": "1234",
            "save_card": True,
            "card_last4": "5555",
            "card_brand": "Mastercard",
            "friendly_name": "My MC",
        })
        assert resp.status_code == 200

        # Verify card was saved
        saved = db.query(SavedCard).filter(
            SavedCard.member_id == member_with_pin.id,
            SavedCard.card_last4 == "5555",
        ).first()
        assert saved is not None
        assert saved.friendly_name == "My MC"


class TestSplitPayment:
    def test_split_cash_and_card(self, client, db: Session, member_with_pin, monthly_plan, seed_settings):
        # Create a saved card for the card portion
        card = SavedCard(
            member_id=member_with_pin.id,
            processor_token="tok_split_123",
            card_last4="4242",
            card_brand="Visa",
        )
        db.add(card)
        db.commit()
        db.refresh(card)

        resp = client.post("/api/kiosk/pay/split", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(monthly_plan.id),
            "cash_amount": "20.00",
            "pin": "1234",
            "saved_card_id": str(card.id),
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "20" in data["message"]
        assert "30" in data["message"]

        # Verify two transactions were created
        transactions = db.query(Transaction).filter(
            Transaction.member_id == member_with_pin.id,
        ).all()
        assert len(transactions) == 2
        amounts = sorted([float(t.amount) for t in transactions])
        assert amounts == [20.0, 30.0]

    def test_split_cash_covers_full_amount(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/split", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "cash_amount": "10.00",
            "pin": "1234",
        })
        assert resp.status_code == 200
        assert "cash" in resp.json()["message"].lower()

    def test_split_zero_cash_rejected(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/split", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "cash_amount": "0.00",
            "pin": "1234",
        })
        assert resp.status_code == 400

    def test_split_disabled(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        from app.models.setting import Setting
        setting = db.query(Setting).filter(Setting.key == "split_payment_enabled").first()
        if setting:
            setting.value = "false"
        else:
            db.add(Setting(key="split_payment_enabled", value="false"))
        db.commit()

        resp = client.post("/api/kiosk/pay/split", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "cash_amount": "2.00",
            "pin": "1234",
        })
        assert resp.status_code == 400
        assert "disabled" in resp.json()["detail"].lower()

"""Tests for PIN verification and lockout."""

import pytest
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.pin_lockout import PinLockout


class TestPinVerification:
    def test_correct_pin(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "1234",
        })
        assert resp.status_code == 200

    def test_wrong_pin(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "0000",
        })
        assert resp.status_code == 401
        assert "attempts remaining" in resp.json()["detail"].lower()

    def test_lockout_after_max_attempts(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        # Default max_attempts is 3
        for i in range(3):
            resp = client.post("/api/kiosk/pay/cash", json={
                "member_id": str(member_with_pin.id),
                "plan_id": str(single_swim_plan.id),
                "amount_tendered": "5.00",
                "pin": "0000",
            })

        # Should be locked now
        assert resp.status_code == 423

        # Correct PIN should also fail while locked
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "1234",
        })
        assert resp.status_code == 423

    def test_successful_pin_resets_attempts(self, client, db: Session, member_with_pin, single_swim_plan, seed_settings):
        # Fail twice
        for _ in range(2):
            client.post("/api/kiosk/pay/cash", json={
                "member_id": str(member_with_pin.id),
                "plan_id": str(single_swim_plan.id),
                "amount_tendered": "5.00",
                "pin": "0000",
            })

        # Succeed
        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member_with_pin.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "1234",
        })
        assert resp.status_code == 200

        # Verify lockout was reset
        lockout = db.query(PinLockout).filter(
            PinLockout.member_id == member_with_pin.id,
        ).first()
        assert lockout.failed_attempts == 0

    def test_no_pin_set(self, client, db: Session, single_swim_plan, seed_settings):
        member = Member(
            first_name="No",
            last_name="Pin",
            pin_hash=None,
        )
        db.add(member)
        db.commit()
        db.refresh(member)

        resp = client.post("/api/kiosk/pay/cash", json={
            "member_id": str(member.id),
            "plan_id": str(single_swim_plan.id),
            "amount_tendered": "5.00",
            "pin": "1234",
        })
        assert resp.status_code == 400
        assert "PIN not set" in resp.json()["detail"]

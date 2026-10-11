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


class TestKioskPinChange:
    def _update(self, client, member, **fields):
        return client.post("/api/kiosk/profile", json={
            "member_id": str(member.id), "pin": "1234",
            "first_name": member.first_name, "last_name": member.last_name, "phone": member.phone,
            **fields,
        })

    def test_member_can_change_pin(self, client, db, member_with_pin, seed_settings):
        resp = self._update(client, member_with_pin, new_pin="9876")
        assert resp.status_code == 200, resp.text

        old = client.post("/api/kiosk/verify-pin", json={"member_id": str(member_with_pin.id), "pin": "1234"})
        new = client.post("/api/kiosk/verify-pin", json={"member_id": str(member_with_pin.id), "pin": "9876"})
        assert old.status_code != 200
        assert new.status_code == 200
        from app.models.activity_log import ActivityLog
        assert db.query(ActivityLog).filter(ActivityLog.action_type == "member.pin_changed").count() == 1

    def test_new_pin_must_be_four_digits_and_different(self, client, member_with_pin, seed_settings):
        assert self._update(client, member_with_pin, new_pin="12").status_code == 400
        assert self._update(client, member_with_pin, new_pin="abcd").status_code == 400
        assert self._update(client, member_with_pin, new_pin="1234").status_code == 400

    def test_wrong_current_pin_cannot_change_pin(self, client, member_with_pin, seed_settings):
        resp = client.post("/api/kiosk/profile", json={
            "member_id": str(member_with_pin.id), "pin": "0000", "new_pin": "9876",
        })
        assert resp.status_code in (401, 403)
        assert client.post("/api/kiosk/verify-pin", json={"member_id": str(member_with_pin.id), "pin": "1234"}).status_code == 200

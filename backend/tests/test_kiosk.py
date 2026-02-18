"""Tests for kiosk endpoints (scan, search, checkin)."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.card import Card
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import PlanType
from app.services.auth_service import hash_pin


class TestScan:
    def test_scan_valid_card(self, client, db: Session, member_with_pin):
        card = Card(member_id=member_with_pin.id, rfid_uid="ABCD1234")
        db.add(card)
        db.commit()

        resp = client.post("/api/kiosk/scan", json={"rfid_uid": "ABCD1234"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "Test"
        assert data["last_name"] == "Member"
        assert data["has_pin"] is True

    def test_scan_unknown_card(self, client):
        resp = client.post("/api/kiosk/scan", json={"rfid_uid": "UNKNOWN"})
        assert resp.status_code == 404

    def test_scan_inactive_card(self, client, db: Session, member_with_pin):
        card = Card(member_id=member_with_pin.id, rfid_uid="INACTIVE1", is_active=False)
        db.add(card)
        db.commit()

        resp = client.post("/api/kiosk/scan", json={"rfid_uid": "INACTIVE1"})
        assert resp.status_code == 404


class TestSearch:
    def test_search_by_name(self, client, db: Session, member_with_pin):
        resp = client.post("/api/kiosk/search", json={"query": "Test"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["first_name"] == "Test"

    def test_search_by_phone(self, client, db: Session, member_with_pin):
        resp = client.post("/api/kiosk/search", json={"query": "555-0100"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_search_no_results(self, client):
        resp = client.post("/api/kiosk/search", json={"query": "NOBODY"})
        assert resp.status_code == 200
        assert resp.json() == []


class TestCheckin:
    def test_checkin_with_monthly(self, client, db: Session, member_with_pin, monthly_plan, seed_settings):
        from app.services.membership_service import create_membership
        create_membership(db, member_with_pin.id, monthly_plan.id)

        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "Checked in" in data["message"]
        assert data["checkin_type"] == "membership"

    def test_checkin_with_swim_pass(self, client, db: Session, member_with_pin, swim_pass_plan, seed_settings):
        from app.services.membership_service import create_membership
        membership = create_membership(db, member_with_pin.id, swim_pass_plan.id)

        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 0,
        })
        assert resp.status_code == 200
        assert resp.json()["checkin_type"] == "swim_pass"

        # Verify swim was deducted
        db.refresh(membership)
        assert membership.swims_used == 1

    def test_checkin_with_guests_deducts_correctly(self, client, db: Session, member_with_pin, swim_pass_plan, seed_settings):
        from app.services.membership_service import create_membership
        membership = create_membership(db, member_with_pin.id, swim_pass_plan.id)

        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 2,
        })
        assert resp.status_code == 200
        db.refresh(membership)
        assert membership.swims_used == 3  # 1 member + 2 guests

    def test_checkin_no_membership(self, client, db: Session, member_with_pin, seed_settings):
        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 0,
        })
        assert resp.status_code == 402

    def test_checkin_swim_pass_exhausted(self, client, db: Session, member_with_pin, swim_pass_plan, seed_settings):
        from app.services.membership_service import create_membership
        membership = create_membership(db, member_with_pin.id, swim_pass_plan.id)
        membership.swims_used = membership.swims_total
        db.commit()

        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 0,
        })
        assert resp.status_code == 402

    def test_checkin_too_many_guests(self, client, db: Session, member_with_pin, monthly_plan, seed_settings):
        from app.services.membership_service import create_membership
        create_membership(db, member_with_pin.id, monthly_plan.id)

        resp = client.post("/api/kiosk/checkin", json={
            "member_id": str(member_with_pin.id),
            "guest_count": 99,
        })
        assert resp.status_code == 400

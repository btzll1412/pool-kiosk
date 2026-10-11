"""Tests for the swipe log: every kiosk card read / lookup is recorded with an outcome."""

from datetime import date, timedelta

from app.models.card import Card
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.swipe import Swipe, SwipeOutcome, SwipeSource


def _card(db, member, uid="CARD123"):
    card = Card(member_id=member.id, rfid_uid=uid, is_active=True)
    db.add(card)
    db.commit()
    return card


def test_unknown_card_is_logged(client, db, seed_settings):
    assert client.post("/api/kiosk/scan", json={"rfid_uid": "NOPE"}).status_code == 404
    swipe = db.query(Swipe).one()
    assert swipe.outcome == SwipeOutcome.unknown_card and swipe.card_uid == "NOPE" and swipe.member_id is None


def test_member_without_plan_is_logged_as_no_plan(client, db, member_with_pin, seed_settings):
    _card(db, member_with_pin)
    assert client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"}).status_code == 200
    swipe = db.query(Swipe).one()
    assert swipe.outcome == SwipeOutcome.no_plan and swipe.member_id == member_with_pin.id
    assert swipe.source == SwipeSource.card


def test_expired_plan_is_logged_as_expired(client, db, member_with_pin, monthly_plan, seed_settings):
    _card(db, member_with_pin)
    db.add(Membership(
        member_id=member_with_pin.id, plan_id=monthly_plan.id, plan_type=PlanType.monthly,
        valid_from=date.today() - timedelta(days=60), valid_until=date.today() - timedelta(days=30), is_active=False,
    ))
    db.commit()
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})
    assert db.query(Swipe).one().outcome == SwipeOutcome.expired


def test_swipe_then_checkin_links_the_two(client, db, member_with_pin, monthly_plan, seed_settings):
    _card(db, member_with_pin)
    db.add(Membership(
        member_id=member_with_pin.id, plan_id=monthly_plan.id, plan_type=PlanType.monthly,
        valid_from=date.today() - timedelta(days=1), valid_until=date.today() + timedelta(days=20), is_active=True,
    ))
    db.commit()
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})
    assert db.query(Swipe).one().outcome == SwipeOutcome.no_action

    resp = client.post("/api/kiosk/checkin", json={"member_id": str(member_with_pin.id), "guest_count": 0})
    assert resp.status_code == 200, resp.text
    swipe = db.query(Swipe).one()  # same row, not a second one
    assert swipe.outcome == SwipeOutcome.checked_in and swipe.checkin_id is not None


def test_failed_checkin_marks_no_plan(client, db, member_with_pin, seed_settings):
    _card(db, member_with_pin)
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})
    assert client.post("/api/kiosk/checkin", json={"member_id": str(member_with_pin.id), "guest_count": 0}).status_code == 402
    assert db.query(Swipe).count() == 1 and db.query(Swipe).one().outcome == SwipeOutcome.no_plan


def test_name_search_selection_is_logged(client, db, member_with_pin, seed_settings):
    resp = client.post("/api/kiosk/presence", json={"member_id": str(member_with_pin.id)})
    assert resp.status_code == 200
    swipe = db.query(Swipe).one()
    assert swipe.source == SwipeSource.search and swipe.outcome == SwipeOutcome.no_plan


def test_admin_list_filters_and_counts(client, db, admin_headers, member_with_pin, seed_settings):
    _card(db, member_with_pin)
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})
    client.post("/api/kiosk/scan", json={"rfid_uid": "GHOST"})

    assert client.get("/api/swipes").status_code in (401, 403)
    body = client.get("/api/swipes", headers=admin_headers).json()
    assert body["total"] == 2 and body["unique_members"] == 1
    assert body["outcome_counts"] == {"no_plan": 1, "unknown_card": 1}
    assert body["items"][0]["created_at"] >= body["items"][1]["created_at"]

    only = client.get("/api/swipes", headers=admin_headers, params={"outcome": "unknown_card"}).json()
    assert only["total"] == 1 and only["items"][0]["card_uid"] == "GHOST" and only["items"][0]["member_name"] is None

    by_name = client.get("/api/swipes", headers=admin_headers, params={"search": member_with_pin.last_name}).json()
    assert by_name["total"] == 1 and by_name["items"][0]["member_name"].endswith(member_with_pin.last_name)

    none_today = client.get("/api/swipes", headers=admin_headers, params={"start_date": "2020-01-01", "end_date": "2020-01-02"}).json()
    assert none_today["total"] == 0


def test_dashboard_counts_members_who_came_without_a_plan(client, db, admin_headers, member_with_pin, seed_settings):
    _card(db, member_with_pin)
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})
    client.post("/api/kiosk/scan", json={"rfid_uid": "CARD123"})  # same person twice = 1
    stats = client.get("/api/reports/dashboard", headers=admin_headers).json()
    assert stats["no_plan_swipes_today"] == 1

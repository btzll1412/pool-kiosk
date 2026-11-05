"""Guard against per-row (N+1) queries on the admin list pages.

The check-ins page once issued ~2 queries per row (member lookup + membership lookup,
each dragging in the member's selectin relationships), i.e. ~7,800 queries and a 5 s
load with ~1,000 check-ins. These tests build a few dozen rows and assert the list
endpoints stay within a flat query budget, so a lazy ``row.member`` cannot creep back.
"""
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.checkin import Checkin, CheckinType
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import Plan, PlanType
from app.models.swipe import Swipe, SwipeOutcome, SwipeSource
from app.models.transaction import PaymentMethod, Transaction, TransactionType

N_MEMBERS = 12
CHECKINS_PER_MEMBER = 3
N_GUESTS = 4
QUERY_BUDGET = 12  # auth + settings + a handful of bulk loads; never grows with rows


class QueryCounter:
    def __init__(self, session):
        self.engine = session.get_bind()
        self.count = 0

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._inc)
        return self

    def __exit__(self, *exc):
        event.remove(self.engine, "before_cursor_execute", self._inc)

    def _inc(self, *args, **kwargs):
        self.count += 1


@pytest.fixture()
def populated(db, admin_user):
    plan = Plan(name="Season Pass", plan_type=PlanType.monthly, price=Decimal("100.00"), swim_count=None, is_active=True)
    db.add(plan)
    db.flush()
    base = datetime(2026, 7, 1, 14, 0, 0)  # 10:00 America/New_York
    members = []
    for i in range(N_MEMBERS):
        m = Member(first_name=f"First{i}", last_name=f"Last{i:02d}", phone=f"555-01{i:02d}", credit_balance=Decimal("0.00"))
        db.add(m)
        db.flush()
        ms = Membership(member_id=m.id, plan_id=plan.id, plan_type=PlanType.monthly, valid_from=base.date(),
                        valid_until=base.date() + timedelta(days=3650), is_active=True)
        db.add(ms)
        db.flush()
        for j in range(CHECKINS_PER_MEMBER):
            ci = Checkin(member_id=m.id, membership_id=ms.id, checkin_type=CheckinType.membership,
                         checked_in_at=base + timedelta(hours=i, minutes=j))
            db.add(ci)
            db.flush()
            db.add(Swipe(member_id=m.id, card_uid=f"CARD{i:02d}", source=SwipeSource.card,
                         outcome=SwipeOutcome.checked_in, checkin_id=ci.id, created_at=ci.checked_in_at))
        db.add(Transaction(member_id=m.id, transaction_type=TransactionType.payment, payment_method=PaymentMethod.cash,
                           amount=Decimal("100.00"), plan_id=plan.id, membership_id=ms.id, created_at=base + timedelta(hours=i)))
        members.append(m)
    for g in range(N_GUESTS):
        db.add(GuestVisit(name=f"Guest {g}", payment_method=PaymentMethod.cash, amount_paid=Decimal("12.00"),
                          plan_id=plan.id, plan_name=plan.name, plan_price=plan.price, created_at=base + timedelta(days=1, hours=g)))
    db.commit()
    return {"plan": plan, "members": members}


def test_checkins_list_uses_bulk_loads(client, admin_headers, db, populated):
    with QueryCounter(db) as qc:
        r = client.get("/api/checkins", headers=admin_headers, params={"page": 1, "per_page": 25})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == N_MEMBERS * CHECKINS_PER_MEMBER + N_GUESTS
    assert body["unique_members"] == N_MEMBERS
    assert len(body["items"]) == 25
    # Newest first: the guests (day 2) come before member check-ins
    assert body["items"][0]["is_guest"] is True
    assert body["items"][0]["member_name"] == f"Guest {N_GUESTS - 1} (Guest)"
    assert "Overpaid" not in body["items"][0]["notes"]
    first_member_row = next(i for i in body["items"] if not i["is_guest"])
    assert first_member_row["member_name"] == f"First{N_MEMBERS - 1} Last{N_MEMBERS - 1:02d}"
    assert first_member_row["plan_name"] == "Season Pass"
    assert qc.count <= QUERY_BUDGET, f"check-ins list ran {qc.count} queries"

    # Second page is the rest, same budget
    with QueryCounter(db) as qc:
        r2 = client.get("/api/checkins", headers=admin_headers, params={"page": 2, "per_page": 25})
    assert len(r2.json()["items"]) == body["total"] - 25
    assert qc.count <= QUERY_BUDGET

    # Search still works and total reflects the filter
    r3 = client.get("/api/checkins", headers=admin_headers, params={"search": "Last03"}).json()
    assert r3["total"] == CHECKINS_PER_MEMBER
    assert all(i["member_name"] == "First3 Last03" for i in r3["items"])


def test_checkins_guest_overpaid_note_still_computed(client, admin_headers, db, populated):
    plan = populated["plan"]
    db.add(GuestVisit(name="Big Tipper", payment_method=PaymentMethod.cash, amount_paid=Decimal("120.00"),
                      plan_id=plan.id, plan_name=plan.name, plan_price=plan.price, created_at=datetime(2026, 8, 1, 12, 0)))
    db.commit()
    r = client.get("/api/checkins", headers=admin_headers, params={"checkin_type": "guest"}).json()
    assert r["items"][0]["member_name"] == "Big Tipper (Guest)"
    assert r["items"][0]["notes"] == "Paid $120.00 (cash) - Overpaid $20.00"


def test_swipes_list_uses_bulk_loads(client, admin_headers, db, populated):
    with QueryCounter(db) as qc:
        r = client.get("/api/swipes", headers=admin_headers, params={"page": 1, "per_page": 25})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == N_MEMBERS * CHECKINS_PER_MEMBER
    assert body["unique_members"] == N_MEMBERS
    assert body["items"][0]["member_name"] == f"First{N_MEMBERS - 1} Last{N_MEMBERS - 1:02d}"
    assert qc.count <= QUERY_BUDGET, f"swipes list ran {qc.count} queries"


def test_transactions_list_uses_bulk_loads(client, admin_headers, db, populated):
    with QueryCounter(db) as qc:
        r = client.get("/api/transactions", headers=admin_headers, params={"page": 1, "per_page": 25})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == N_MEMBERS
    assert body["items"][0]["member_name"] == f"First{N_MEMBERS - 1} Last{N_MEMBERS - 1:02d}"
    assert body["items"][0]["plan_name"] == "Season Pass"
    assert qc.count <= QUERY_BUDGET, f"transactions list ran {qc.count} queries"


def test_members_list_uses_bulk_loads(client, admin_headers, db, populated):
    with QueryCounter(db) as qc:
        r = client.get("/api/members", headers=admin_headers, params={"page": 1, "per_page": 25})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == N_MEMBERS
    assert all(len(i["active_plans"]) == 1 and i["active_plans"][0]["plan_name"] == "Season Pass" for i in body["items"])
    assert qc.count <= QUERY_BUDGET, f"members list ran {qc.count} queries"

    with QueryCounter(db) as qc:
        r = client.get("/api/members", headers=admin_headers, params={"has_plan": "true", "per_page": 25})
    assert r.json()["total"] == N_MEMBERS
    assert qc.count <= QUERY_BUDGET
    assert client.get("/api/members", headers=admin_headers, params={"has_plan": "false"}).json()["total"] == 0

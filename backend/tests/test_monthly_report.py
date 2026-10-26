"""Monthly report: month/year range, customer filter, CSV export, picker bounds."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from app.models.checkin import Checkin, CheckinType
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.saved_card import SavedCard
from app.models.transaction import PaymentMethod, Transaction, TransactionType


def _member(db, first, last, balance="0.00"):
    m = Member(first_name=first, last_name=last, credit_balance=Decimal(balance))
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def _tx(db, member, amount, when, kind=TransactionType.payment, method=PaymentMethod.cash, plan=None, **extra):
    tx = Transaction(
        member_id=member.id if member else None,
        transaction_type=kind,
        payment_method=method,
        amount=Decimal(amount),
        plan_id=plan.id if plan else None,
        created_at=when,
        **extra,
    )
    db.add(tx)
    db.commit()
    return tx


def _seed(db, member_with_pin, single_swim_plan, monthly_plan):
    alice = member_with_pin
    bob = _member(db, "Bob", "Owes", "-20.00")
    card = SavedCard(member_id=alice.id, processor_token="tok", card_last4="4242", card_brand="Visa", friendly_name="Alice Visa")
    db.add(card)
    db.commit()

    # August 2026 (times are UTC; 15:00 UTC is 11 AM New York)
    _tx(db, alice, "50.00", datetime(2026, 8, 5, 15, 0), plan=monthly_plan)
    _tx(db, alice, "5.00", datetime(2026, 8, 20, 15, 0), method=PaymentMethod.card, plan=single_swim_plan, saved_card_id=card.id)
    _tx(db, bob, "20.00", datetime(2026, 8, 22, 15, 0), method=PaymentMethod.credit, plan=single_swim_plan,
        notes="Charged to account — balance after: $-20.00")
    _tx(db, None, "5.00", datetime(2026, 8, 23, 15, 0), notes="Guest visit: Gary Guest - Single Swim")
    db.add(GuestVisit(name="Gary Guest", payment_method="cash", amount_paid=Decimal("5.00"), plan_name="Single Swim",
                      plan_price=Decimal("5.00"), created_at=datetime(2026, 8, 23, 15, 0)))
    # September 2026
    _tx(db, alice, "10.00", datetime(2026, 9, 2, 15, 0), kind=TransactionType.refund)
    _tx(db, alice, "15.00", datetime(2026, 9, 3, 15, 0), kind=TransactionType.credit_add, method=PaymentMethod.manual)
    _tx(db, bob, "5.00", datetime(2026, 9, 10, 15, 0), method=PaymentMethod.card, plan=single_swim_plan)
    # Just outside: 1 Oct 2026 03:00 UTC is still 30 Sep 11 PM in New York -> September
    _tx(db, bob, "7.00", datetime(2026, 10, 1, 3, 0), method=PaymentMethod.cash, plan=single_swim_plan)
    # October, excluded from an Aug-Sep report
    _tx(db, alice, "99.00", datetime(2026, 10, 15, 15, 0), plan=monthly_plan)

    db.add_all([
        Checkin(member_id=alice.id, checkin_type=CheckinType.membership, guest_count=2, checked_in_at=datetime(2026, 8, 6, 15, 0)),
        Checkin(member_id=alice.id, checkin_type=CheckinType.membership, checked_in_at=datetime(2026, 8, 7, 15, 0)),
        Checkin(member_id=bob.id, checkin_type=CheckinType.paid_single, checked_in_at=datetime(2026, 9, 10, 15, 30)),
        Membership(member_id=alice.id, plan_id=monthly_plan.id, plan_type=PlanType.monthly,
                   valid_from=date(2026, 8, 5), valid_until=date(2026, 9, 4), is_active=True),
        Membership(member_id=alice.id, plan_id=monthly_plan.id, plan_type=PlanType.monthly,
                   valid_from=date(2026, 10, 15), valid_until=date(2026, 11, 14), is_active=True),
    ])
    db.commit()
    return alice, bob


def test_monthly_report_range_totals(client, db, admin_headers, seed_settings, member_with_pin, single_swim_plan, monthly_plan):
    alice, bob = _seed(db, member_with_pin, single_swim_plan, monthly_plan)
    r = client.get("/api/reports/monthly", headers=admin_headers, params={"start": "2026-08", "end": "2026-09"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [m["period"] for m in body["months"]] == ["2026-08", "2026-09"]
    assert body["months"][0]["label"] == "August 2026"

    aug, sep = body["months"]
    assert Decimal(aug["total"]) == Decimal("80.00")
    assert Decimal(aug["cash"]) == Decimal("55.00")  # 50 + guest 5
    assert Decimal(aug["card_on_file"]) == Decimal("5.00")
    assert Decimal(aug["account"]) == Decimal("20.00")
    assert aug["sales"] == 4 and aug["swims"] == 2 and aug["swim_guests"] == 2 and aug["guest_visits"] == 1
    assert aug["unique_swimmers"] == 1 and aug["memberships_started"] == 1 and aug["active_at_end"] == 1

    assert Decimal(sep["total"]) == Decimal("2.00")  # 5 + 7 (late-night tx counts as Sep local) - 10 refund
    assert Decimal(sep["refunds"]) == Decimal("10.00") and Decimal(sep["credits_added"]) == Decimal("15.00")
    assert Decimal(sep["card"]) == Decimal("5.00") and sep["memberships_expired"] == 1 and sep["active_at_end"] == 0

    t = body["totals"]
    assert Decimal(t["total"]) == Decimal("82.00") and t["swims"] == 3 and t["unique_swimmers"] == 2
    assert t["memberships_started"] == 1 and t["memberships_expired"] == 1

    plans = {p["plan"]: p for p in body["sales_by_plan"]}
    assert plans["Single Swim"]["count"] == 4 and Decimal(plans["Single Swim"]["amount"]) == Decimal("37.00")
    assert plans["Guest visit"]["count"] == 1

    # October transaction is excluded, guest's name is recovered from the note
    assert all(tx["period"] in ("2026-08", "2026-09") for tx in body["transactions"])
    guest = [tx for tx in body["transactions"] if tx["guest_name"]]
    assert guest and guest[0]["guest_name"] == "Gary Guest" and guest[0]["member_name"] is None
    on_file = [tx for tx in body["transactions"] if tx["method"] == "card_on_file"]
    assert on_file[0]["card"] == "Alice Visa" and on_file[0]["method_label"] == "Card on file"
    assert [tx["amount"] for tx in body["transactions"] if tx["transaction_type"] == "refund"] == ["-10.00"]

    # balances as of today: Bob owes
    assert body["balances"] == [{"member_id": str(bob.id), "name": "Bob Owes", "balance": "-20.00", "owes": True}]
    # per-member summary, biggest spender first
    assert body["members"][0]["name"] == "Test Member" and body["members"][0]["swims"] == 2
    assert body["members"][0]["memberships_started"] == ["Monthly Pass"] or body["members"][0]["memberships_started"] == [monthly_plan.name]
    # check-in list only when a customer filter is on
    assert body["checkins"] == []


def test_monthly_report_customer_filter(client, db, admin_headers, seed_settings, member_with_pin, single_swim_plan, monthly_plan):
    alice, bob = _seed(db, member_with_pin, single_swim_plan, monthly_plan)
    r = client.get("/api/reports/monthly", headers=admin_headers,
                   params={"start": "2026-08", "end": "2026-09", "member_ids": [str(bob.id)]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["filter_members"] == [{"member_id": str(bob.id), "name": "Bob Owes"}]
    assert Decimal(body["totals"]["total"]) == Decimal("32.00")
    assert Decimal(body["months"][0]["account"]) == Decimal("20.00")
    assert body["totals"]["guest_visits"] == 0  # guests are not a customer
    assert {tx["member_id"] for tx in body["transactions"]} == {str(bob.id)}
    assert len(body["checkins"]) == 1 and body["checkins"][0]["member_name"] == "Bob Owes"
    assert body["members"] == [body["members"][0]] and body["members"][0]["member_id"] == str(bob.id)
    assert body["members"][0]["balance"] == "-20.00" and Decimal(body["members"][0]["account"]) == Decimal("20.00")
    assert body["memberships_started"] == [] and body["totals"]["memberships_started"] == 0

    # two customers at once
    both = client.get("/api/reports/monthly", headers=admin_headers,
                      params={"start": "2026-08", "end": "2026-09", "member_ids": [str(bob.id), str(alice.id)]}).json()
    assert Decimal(both["totals"]["total"]) == Decimal("77.00")  # everything except the guest
    assert {m["name"] for m in both["members"]} == {"Bob Owes", "Test Member"}

    # a customer with nothing in the period is still listed, with zeros
    quiet = _member(db, "Quiet", "Person")
    q = client.get("/api/reports/monthly", headers=admin_headers,
                   params={"start": "2026-08", "member_ids": [str(quiet.id)]}).json()
    assert q["end"] == "2026-08" and q["members"][0]["name"] == "Quiet Person" and q["members"][0]["sales"] == 0

    assert client.get("/api/reports/monthly", headers=admin_headers,
                      params={"start": "2026-08", "member_ids": [str(uuid.uuid4())]}).status_code == 404


def test_monthly_report_validation_and_bounds(client, db, admin_headers, seed_settings, member_with_pin, single_swim_plan, monthly_plan):
    bad = client.get("/api/reports/monthly", headers=admin_headers, params={"start": "2026-13"})
    assert bad.status_code == 400
    assert client.get("/api/reports/monthly", headers=admin_headers, params={"start": "2026-09", "end": "2026-08"}).status_code == 400
    assert client.get("/api/reports/monthly", headers=admin_headers, params={"start": "2020-01", "end": "2026-12"}).status_code == 400
    assert client.get("/api/reports/monthly", params={"start": "2026-08"}).status_code in (401, 403)

    # empty database: picker bounds fall back to the current month
    b = client.get("/api/reports/monthly/bounds", headers=admin_headers).json()
    assert b["first_month"] == b["last_month"]

    _seed(db, member_with_pin, single_swim_plan, monthly_plan)
    b = client.get("/api/reports/monthly/bounds", headers=admin_headers).json()
    assert b["first_month"] == "2026-08"

    # a month with nothing in it still returns a zero row
    empty = client.get("/api/reports/monthly", headers=admin_headers, params={"start": "2025-01"}).json()
    assert empty["months"][0]["sales"] == 0 and empty["transactions"] == [] and Decimal(empty["totals"]["total"]) == 0


def test_monthly_report_csv(client, db, admin_headers, seed_settings, member_with_pin, single_swim_plan, monthly_plan):
    alice, bob = _seed(db, member_with_pin, single_swim_plan, monthly_plan)
    r = client.get("/api/reports/monthly/export", headers=admin_headers,
                   params={"start": "2026-08", "end": "2026-09", "member_ids": [str(bob.id)]})
    assert r.status_code == 200
    assert r.headers["content-disposition"].endswith("monthly_report_2026-08_to_2026-09.csv")
    lines = r.text.splitlines()
    assert lines[0].startswith("Month,Net total,Cash")
    assert lines[1].startswith("August 2026,20.00")
    assert any(line.startswith("TOTAL,32.00") for line in lines)
    assert "Bob Owes,payment,Charged to account" in r.text
    assert "Check-in,Month,Customer" in r.text  # check-ins included for a customer filter
    assert "Test Member" not in r.text

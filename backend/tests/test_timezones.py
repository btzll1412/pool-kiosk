"""The configured timezone decides which day it is — not the server clock, not the browser."""
from datetime import date, datetime, timedelta

import pytz

from app.models.activity_log import ActivityLog
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services.settings_service import set_setting
from app.services.time_service import local_today, to_local_naive, utc_bounds

NY = pytz.timezone("America/New_York")


def test_local_today_follows_the_setting(db, seed_settings):
    set_setting(db, "timezone", "Pacific/Kiritimati")  # UTC+14: the earliest "today" on earth
    east = local_today(db)
    set_setting(db, "timezone", "Pacific/Pago_Pago")   # UTC-11
    west = local_today(db)
    assert east >= west and (east - west).days in (0, 1)


def test_utc_bounds_cover_the_local_day():
    start, end = utc_bounds(NY, date(2026, 10, 27))
    assert start == datetime(2026, 10, 27, 4, 0, 0)          # midnight EDT
    assert end.replace(microsecond=0) == datetime(2026, 10, 28, 3, 59, 59)


def test_override_times_are_stored_as_pool_wall_clock(client, db, admin_headers, seed_settings):
    # Browser sent UTC: 2 PM–4 PM Eastern is 18:00–20:00Z
    r = client.post("/api/schedules/overrides", json={
        "name": "Maintenance", "schedule_type": "closed",
        "start_datetime": "2026-11-03T18:00:00Z", "end_datetime": "2026-11-03T20:00:00Z",
    }, headers=admin_headers)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["start_datetime"].startswith("2026-11-03T13:00") and body["end_datetime"].startswith("2026-11-03T15:00")  # EST by Nov 3

    # Naive = already wall-clock; kept as typed
    r = client.put(f"/api/schedules/overrides/{body['id']}", json={
        "start_datetime": "2026-11-03T14:00:00", "end_datetime": "2026-11-03T16:00:00",
    }, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["start_datetime"].startswith("2026-11-03T14:00") and r.json()["end_datetime"].startswith("2026-11-03T16:00")

    assert to_local_naive(db, None) is None


def test_kiosk_errors_window_starts_at_local_midnight(client, db, admin_headers, seed_settings, monkeypatch):
    import app.routers.reports as reports
    monkeypatch.setattr(reports, "local_today", lambda db: date(2026, 10, 27))
    # 7 days back = Oct 20 local → window starts Oct 20 04:00 UTC. An error at 03:00 UTC Oct 20 is Oct 19 evening local.
    for when, msg in [(datetime(2026, 10, 20, 3, 0), "before"), (datetime(2026, 10, 20, 5, 0), "after")]:
        db.add(ActivityLog(action_type="kiosk.client_error", entity_type="kiosk", note=msg, created_at=when))
    db.commit()
    body = client.get("/api/reports/kiosk-errors?days=7", headers=admin_headers).json()
    assert [e["message"] for e in body["items"]] == ["after"]


def test_transactions_csv_uses_local_days_and_local_times(client, db, admin_headers, member_with_pin, seed_settings):
    # 11:30 PM Oct 26 Eastern = 03:30 UTC Oct 27 — must land in the Oct 26 export, shown as 23:30
    late = Transaction(member_id=member_with_pin.id, transaction_type=TransactionType.payment,
                       payment_method=PaymentMethod.cash, amount=10, notes="late night", created_at=datetime(2026, 10, 27, 3, 30))
    early = Transaction(member_id=member_with_pin.id, transaction_type=TransactionType.payment,
                        payment_method=PaymentMethod.cash, amount=20, notes="next morning", created_at=datetime(2026, 10, 27, 13, 0))
    db.add_all([late, early]); db.commit()
    text = client.get("/api/reports/export?start_date=2026-10-26&end_date=2026-10-26", headers=admin_headers).text
    assert "2026-10-26 23:30:00,payment,cash,10.00" in text and "next morning" not in text
    text = client.get("/api/reports/export?start_date=2026-10-27&end_date=2026-10-27", headers=admin_headers).text
    assert "2026-10-27 09:00:00,payment,cash,20.00" in text and "late night" not in text


def test_report_defaults_still_work_without_dates(client, admin_headers, seed_settings):
    assert client.get("/api/reports/revenue", headers=admin_headers).status_code == 200
    assert client.get("/api/reports/swims", headers=admin_headers).status_code == 200
    assert client.get("/api/reports/export", headers=admin_headers).status_code == 200

"""Tests for the backup & restore system."""

import gzip
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.database import Base
from app.models.member import Member
from app.models.membership import Membership
from app.models.plan import PlanType
from app.models.transaction import PaymentMethod, Transaction, TransactionType
from app.services import backup_service
from app.services.backup_service import (
    BackupError,
    create_backup_data,
    decode_backup,
    encode_backup,
    is_backup_due,
    restore_backup_data,
    run_backup,
)
from app.services.settings_service import get_setting, set_setting, update_settings


@pytest.fixture()
def backup_dir(db, tmp_path):
    set_setting(db, "backup_local_path", str(tmp_path))
    set_setting(db, "backup_remote_type", "local")
    return tmp_path


@pytest.fixture()
def populated(db, admin_user, member_with_pin, swim_pass_plan):
    """A member with a membership and two linked (self-referencing) transactions."""
    member_with_pin.credit_balance = Decimal("12.50")
    membership = Membership(
        member_id=member_with_pin.id,
        plan_id=swim_pass_plan.id,
        plan_type=PlanType.swim_pass,
        swims_total=10,
        swims_used=3,
        valid_from=date(2026, 1, 1),
        is_active=True,
    )
    db.add(membership)
    db.flush()

    refund_id, payment_id = uuid.uuid4(), uuid.uuid4()
    # The refund is inserted first but references the payment inserted after it
    payment = Transaction(
        id=payment_id,
        member_id=member_with_pin.id,
        transaction_type=TransactionType.payment,
        payment_method=PaymentMethod.cash,
        amount=Decimal("50.00"),
        plan_id=swim_pass_plan.id,
        membership_id=membership.id,
    )
    db.add(payment)
    db.flush()
    db.add(Transaction(
        id=refund_id,
        member_id=member_with_pin.id,
        transaction_type=TransactionType.refund,
        payment_method=PaymentMethod.cash,
        amount=Decimal("-50.00"),
        related_transaction_id=payment_id,
    ))
    db.commit()
    return {"member_id": member_with_pin.id, "payment_id": payment_id, "refund_id": refund_id}


def _snapshot(db) -> dict:
    return create_backup_data(db)["data"]


def test_backup_covers_every_table(db, populated):
    data = create_backup_data(db)
    assert set(data["data"]) == {t.name for t in Base.metadata.sorted_tables}
    assert data["table_counts"]["members"] == 1
    assert data["table_counts"]["transactions"] == 2
    # Every column is exported
    member_row = data["data"]["members"][0]
    assert set(member_row) == {c.name for c in Member.__table__.columns}


def test_archive_round_trip(db, populated):
    data = create_backup_data(db)
    archive = encode_backup(data)
    assert archive[:2] == b"\x1f\x8b"
    assert decode_backup(archive)["data"] == data["data"]
    # Plain JSON is accepted too
    assert decode_backup(json.dumps(data).encode())["data"] == data["data"]


@pytest.mark.parametrize("content", [b"not a backup", gzip.compress(b"{}"), b'{"data": []}', b"\x1f\x8bbroken"])
def test_decode_rejects_invalid_archives(content):
    with pytest.raises(BackupError):
        decode_backup(content)


def test_restore_is_lossless(db, populated):
    before = _snapshot(db)
    backup = decode_backup(encode_backup(create_backup_data(db)))

    # Mutate everything
    db.query(Transaction).delete()
    db.query(Membership).delete()
    member = db.get(Member, populated["member_id"])
    member.first_name = "Changed"
    member.credit_balance = Decimal("0")
    db.commit()

    stats = restore_backup_data(db, backup)
    assert stats["transactions"] == 2
    assert _snapshot(db) == before

    refund = db.get(Transaction, populated["refund_id"])
    assert refund.related_transaction_id == populated["payment_id"]
    assert refund.amount == Decimal("-50.00")
    assert db.get(Member, populated["member_id"]).credit_balance == Decimal("12.50")


def test_failed_restore_rolls_back(db, populated):
    before = _snapshot(db)
    backup = create_backup_data(db)
    backup["data"]["memberships"][0]["member_id"] = str(uuid.uuid4())  # broken foreign key

    with pytest.raises(Exception):
        restore_backup_data(db, backup)
    assert _snapshot(db) == before


def test_restore_refuses_empty_backup(db, populated):
    before = _snapshot(db)
    with pytest.raises(BackupError):
        restore_backup_data(db, {"export_version": "2.0", "data": {}})
    assert _snapshot(db) == before


def test_restore_legacy_v1_backup(db, populated):
    """v1 backups lack newer tables/columns — defaults must fill the gaps."""
    backup = create_backup_data(db)
    backup["export_version"] = "1.0"
    del backup["data"]["member_price_overrides"]
    for row in backup["data"]["members"]:
        del row["is_unlimited"]

    restore_backup_data(db, backup)
    assert db.get(Member, populated["member_id"]).is_unlimited is False


def test_run_backup_writes_archive_and_applies_retention(db, populated, backup_dir):
    set_setting(db, "backup_retention_count", "3")
    for i in range(5):
        (backup_dir / f"pool-backup-2026010{i + 1}-020000.json.gz").write_bytes(b"old")
    (backup_dir / "unrelated.txt").write_text("keep me")

    result = run_backup(db, export_type="manual")

    assert result["success"], result
    archives = sorted(p.name for p in backup_dir.glob("pool-backup-*"))
    assert len(archives) == 3
    assert result["filename"] in archives
    assert (backup_dir / "unrelated.txt").exists()
    restored = decode_backup((backup_dir / result["filename"]).read_bytes())
    assert restored["table_counts"]["members"] == 1
    assert get_setting(db, "backup_last_status") == "success"
    assert get_setting(db, "backup_last_success")


def test_run_backup_failure_is_recorded(db, populated, backup_dir, monkeypatch):
    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(backup_service, "save_to_local", boom)
    result = run_backup(db)

    assert result == {"success": False, "error": "disk full"}
    assert get_setting(db, "backup_last_status") == "failed: disk full"
    assert get_setting(db, "backup_last_success", "") == ""


def test_settings_save_cannot_overwrite_backup_status(db, populated, backup_dir):
    run_backup(db)
    update_settings(db, {"backup_last_status": "tampered", "backup_hour": "5"})
    assert get_setting(db, "backup_last_status") == "success"
    assert get_setting(db, "backup_hour") == "5"


def test_is_backup_due():
    now = datetime(2026, 9, 20, 2, 5, tzinfo=timezone.utc)  # a Sunday, 02:05
    recent = now - timedelta(hours=3)

    assert is_backup_due("daily", 2, now, None)
    assert is_backup_due("daily", 2, now, recent)
    assert not is_backup_due("daily", 4, now, recent)
    # Missed slot (server was down) -> catch up
    assert is_backup_due("daily", 4, now, now - timedelta(hours=26))
    assert is_backup_due("hourly", 0, now, now - timedelta(minutes=59))
    assert is_backup_due("weekly", 2, now, recent)
    assert not is_backup_due("weekly", 2, now + timedelta(days=1), recent)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_backup_endpoints_require_auth(client):
    assert client.get("/api/backup/status").status_code in (401, 403)
    assert client.post("/api/backup/run").status_code in (401, 403)
    assert client.get("/api/backup/download/pool-backup-20260101-020000.json.gz").status_code in (401, 403)


def test_run_list_download_restore_flow(client, db, populated, backup_dir, admin_headers):
    run = client.post("/api/backup/run", headers=admin_headers)
    assert run.status_code == 200, run.text
    filename = run.json()["filename"]

    listing = client.get("/api/backup/list", headers=admin_headers).json()
    assert [b["filename"] for b in listing["backups"]] == [filename]

    download = client.get(f"/api/backup/download/{filename}", headers=admin_headers)
    assert download.status_code == 200
    assert decode_backup(download.content)["table_counts"]["members"] == 1

    member = db.get(Member, populated["member_id"])
    member.first_name = "Changed"
    db.commit()

    restore = client.post(f"/api/backup/restore/{filename}", headers=admin_headers)
    assert restore.status_code == 200, restore.text
    body = restore.json()
    assert body["stats"]["members"] == 1
    assert (backup_dir / body["safety_backup"]).exists()
    assert "pre-restore" in body["safety_backup"]
    db.expire_all()
    assert db.get(Member, populated["member_id"]).first_name != "Changed"

    status = client.get("/api/backup/status", headers=admin_headers).json()
    assert status["last_status"] == "success"


def test_import_uploaded_backup(client, db, populated, backup_dir, admin_headers):
    archive = encode_backup(create_backup_data(db))
    response = client.post(
        "/api/backup/import",
        headers=admin_headers,
        files={"file": ("pool-backup.json.gz", archive, "application/gzip")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["stats"]["transactions"] == 2


def test_import_rejects_garbage(client, backup_dir, admin_headers):
    response = client.post(
        "/api/backup/import",
        headers=admin_headers,
        files={"file": ("x.json", b"nope", "application/json")},
    )
    assert response.status_code == 400


@pytest.mark.parametrize("filename", ["..%2F..%2Fetc%2Fpasswd", "evil.json.gz", "pool-backup-1.json"])
def test_download_rejects_unsafe_filenames(client, backup_dir, admin_headers, filename):
    response = client.get(f"/api/backup/download/{filename}", headers=admin_headers)
    assert response.status_code in (400, 404)

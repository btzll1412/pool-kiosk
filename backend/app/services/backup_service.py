"""
Backup and restore service.

Backups are schema-driven: every table registered on ``Base.metadata`` is
exported with all of its columns, so new models and columns are picked up
automatically and a backup can never silently fall behind the schema.

Each backup is a gzip-compressed JSON archive. It is always written to the
local backup directory (a persistent Docker volume) and, when configured,
additionally uploaded to S3-compatible storage or an SFTP server.

Restores run inside a single database transaction — a failed restore rolls
back and leaves the existing data untouched.
"""
import enum
import gzip
import json
import logging
import os
import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator

import pytz
from sqlalchemy import Table, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal
from app.models.user import User
from app.services.settings_service import SYSTEM_MANAGED_KEYS, get_setting, set_setting

logger = logging.getLogger(__name__)

BACKUP_FORMAT_VERSION = "2.0"
BACKUP_FILENAME_RE = re.compile(r"^pool-backup-\d{8}-\d{6}(-[a-z-]+)?\.json(\.gz)?$")
GZIP_MAGIC = b"\x1f\x8b"
INSERT_CHUNK_SIZE = 500

SCHEDULE_INTERVALS: dict[str, timedelta] = {
    "hourly": timedelta(hours=1),
    "daily": timedelta(days=1),
    "weekly": timedelta(days=7),
}
# How far past its interval a backup may slip before a catch-up run is forced
# (covers the server being down at the scheduled time).
OVERDUE_GRACE = timedelta(hours=1)


class BackupError(Exception):
    """Raised for invalid backup archives or backup requests."""


@dataclass(frozen=True)
class BackupConfig:
    enabled: bool
    schedule: str
    hour: int
    retention_count: int
    remote_type: str
    local_path: str
    s3_bucket: str
    s3_prefix: str
    s3_access_key: str
    s3_secret_key: str
    s3_region: str
    s3_endpoint: str | None
    sftp_host: str
    sftp_port: int
    sftp_username: str
    sftp_password: str
    sftp_path: str
    sftp_key_path: str | None


def get_backup_config(db: Session) -> BackupConfig:
    """Load the backup configuration from system settings."""
    schedule = get_setting(db, "backup_schedule", "daily")
    return BackupConfig(
        enabled=get_setting(db, "backup_enabled", "false").lower() == "true",
        schedule=schedule if schedule in SCHEDULE_INTERVALS else "daily",
        hour=_safe_int(get_setting(db, "backup_hour", "2"), 2) % 24,
        retention_count=max(1, _safe_int(get_setting(db, "backup_retention_count", "7"), 7)),
        remote_type=get_setting(db, "backup_remote_type", "local"),
        local_path=get_setting(db, "backup_local_path", "/backups") or "/backups",
        s3_bucket=get_setting(db, "backup_s3_bucket", ""),
        s3_prefix=get_setting(db, "backup_s3_prefix", "backups"),
        s3_access_key=get_setting(db, "backup_s3_access_key", ""),
        s3_secret_key=get_setting(db, "backup_s3_secret_key", ""),
        s3_region=get_setting(db, "backup_s3_region", "us-east-1") or "us-east-1",
        s3_endpoint=get_setting(db, "backup_s3_endpoint", "") or None,
        sftp_host=get_setting(db, "backup_sftp_host", ""),
        sftp_port=_safe_int(get_setting(db, "backup_sftp_port", "22"), 22),
        sftp_username=get_setting(db, "backup_sftp_username", ""),
        sftp_password=get_setting(db, "backup_sftp_password", ""),
        sftp_path=get_setting(db, "backup_sftp_path", "/backups") or "/backups",
        sftp_key_path=get_setting(db, "backup_sftp_key_path", "") or None,
    )


def _safe_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _local_now(db: Session) -> datetime:
    """Current time in the configured system timezone."""
    tz_name = get_setting(db, "timezone", "America/New_York")
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.timezone("America/New_York")
    return datetime.now(local_tz)


def _parse_timestamp(value: str) -> datetime | None:
    """Parse a stored ISO timestamp; naive values are treated as UTC."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _serialize_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool, dict, list)):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value)


def _schema_revision(db: Session) -> str | None:
    try:
        return db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        db.rollback()
        return None


def create_backup_data(db: Session, export_type: str = "automatic") -> dict:
    """Create a complete backup of every table in the system."""
    data: dict[str, list[dict]] = {}
    for table in Base.metadata.sorted_tables:
        # Primary-key order keeps archives deterministic and diffable
        rows = db.execute(table.select().order_by(*table.primary_key.columns)).mappings().all()
        data[table.name] = [
            {column: _serialize_value(value) for column, value in row.items()}
            for row in rows
        ]

    return {
        "export_version": BACKUP_FORMAT_VERSION,
        "export_date": datetime.now(timezone.utc).isoformat(),
        "export_type": export_type,
        "schema_revision": _schema_revision(db),
        "table_counts": {name: len(rows) for name, rows in data.items()},
        "data": data,
    }


def encode_backup(backup_data: dict) -> bytes:
    """Serialize a backup to a gzip-compressed JSON archive."""
    return gzip.compress(json.dumps(backup_data).encode("utf-8"))


def decode_backup(content: bytes) -> dict:
    """Parse and validate a backup archive (gzip-compressed or plain JSON)."""
    try:
        if content[:2] == GZIP_MAGIC:
            content = gzip.decompress(content)
        backup_data = json.loads(content.decode("utf-8"))
    except (OSError, EOFError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BackupError("Backup file is corrupt or not a valid backup archive") from exc

    if (
        not isinstance(backup_data, dict)
        or "export_version" not in backup_data
        or not isinstance(backup_data.get("data"), dict)
    ):
        raise BackupError("Invalid backup file format")
    return backup_data


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def _coerce_value(column, value: Any) -> Any:
    """Convert a JSON value back to the Python type its column expects."""
    if value is None:
        return None
    try:
        python_type = column.type.python_type
    except NotImplementedError:
        return value

    if isinstance(python_type, type) and issubclass(python_type, enum.Enum):
        if isinstance(value, python_type):
            return value
        try:
            return python_type(value)
        except ValueError:
            return python_type[value]
    if python_type is uuid.UUID:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    if python_type is Decimal:
        return Decimal(str(value))
    if python_type is datetime:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    if python_type is date:
        return date.fromisoformat(value.split("T")[0]) if isinstance(value, str) else value
    if python_type is time:
        return time.fromisoformat(value) if isinstance(value, str) else value
    if python_type is bool:
        return value if isinstance(value, bool) else str(value).lower() in ("true", "1")
    return value


def _self_referencing_columns(table: Table) -> list[str]:
    return [
        column.name
        for column in table.columns
        if any(fk.column.table is table for fk in column.foreign_keys)
    ]


def _restore_table(db: Session, table: Table, rows: list[dict]) -> None:
    columns = [c for c in table.columns if any(c.name in row for row in rows)]
    self_refs = set(_self_referencing_columns(table))
    pk_columns = list(table.primary_key.columns)

    prepared: list[dict] = []
    deferred: list[tuple[dict, dict]] = []
    for row in rows:
        values = {c.name: _coerce_value(c, row.get(c.name)) for c in columns}
        # Rows may reference later rows of the same table — link them afterwards.
        links = {name: values[name] for name in self_refs if values.get(name) is not None}
        if links:
            for name in links:
                values[name] = None
            deferred.append(({c.name: values[c.name] for c in pk_columns}, links))
        prepared.append(values)

    for start in range(0, len(prepared), INSERT_CHUNK_SIZE):
        db.execute(table.insert(), prepared[start:start + INSERT_CHUNK_SIZE])

    for pk_values, links in deferred:
        statement = table.update().values(**links)
        for pk_column in pk_columns:
            statement = statement.where(pk_column == pk_values[pk_column.name])
        db.execute(statement)


def restore_backup_data(db: Session, backup_data: dict) -> dict[str, int]:
    """Replace all system data with the contents of a backup.

    Runs in a single transaction: on any error the restore is rolled back and
    the existing data is left untouched. Returns restored row counts per table.
    """
    export_data = backup_data["data"]
    tables = Base.metadata.sorted_tables
    known = {table.name for table in tables}

    ignored = sorted(set(export_data) - known)
    if ignored:
        logger.warning("Restore: ignoring unknown tables in backup: %s", ", ".join(ignored))
    if not any(export_data.get(name) for name in ("users", "settings")):
        raise BackupError("Backup contains no users or settings — refusing to restore")

    stats: dict[str, int] = {}
    try:
        for table in reversed(tables):
            db.execute(table.delete())
        for table in tables:
            rows = export_data.get(table.name) or []
            if rows:
                _restore_table(db, table, rows)
            stats[table.name] = len(rows)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.expire_all()

    logger.info("Restore completed: %d rows across %d tables", sum(stats.values()), len(stats))
    return stats


def restore_from_archive(db: Session, content: bytes, source: str) -> dict:
    """Validate an archive, take a safety backup of current data, then restore."""
    backup_data = decode_backup(content)

    safety = run_backup(db, export_type="pre-restore", update_status=False)
    if not safety["success"]:
        raise BackupError(f"Could not create pre-restore safety backup: {safety['error']}")

    # Backup run history describes this server, not the restored data
    run_history = {key: get_setting(db, key, "") for key in SYSTEM_MANAGED_KEYS}
    stats = restore_backup_data(db, backup_data)
    for key, value in run_history.items():
        set_setting(db, key, value)

    logger.info("System restored from %s (safety backup: %s)", source, safety["filename"])
    return {
        "success": True,
        "message": "System restored successfully",
        "safety_backup": safety["filename"],
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# Storage backends
# ---------------------------------------------------------------------------

def _is_backup_filename(name: str) -> bool:
    return bool(BACKUP_FILENAME_RE.match(name))


def resolve_local_backup(db: Session, filename: str) -> Path:
    """Return the path of a stored local backup, rejecting unsafe filenames."""
    if not _is_backup_filename(filename):
        raise BackupError("Invalid backup filename")
    path = Path(get_backup_config(db).local_path) / filename
    if not path.is_file():
        raise FileNotFoundError(filename)
    return path


def save_to_local(content: bytes, path: str, filename: str) -> str:
    """Atomically write a backup archive to the local backup directory."""
    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)

    file_path = directory / filename
    temp_path = directory / f".{filename}.tmp"
    temp_path.write_bytes(content)
    os.replace(temp_path, file_path)

    logger.info("Backup saved to local path: %s", file_path)
    return str(file_path)


def _local_backup_files(path: str) -> list[Path]:
    directory = Path(path)
    if not directory.exists():
        return []
    return sorted(
        (f for f in directory.iterdir() if f.is_file() and _is_backup_filename(f.name)),
        key=lambda f: f.name,
        reverse=True,
    )


def cleanup_old_backups_local(path: str, retention_count: int) -> None:
    for old_file in _local_backup_files(path)[retention_count:]:
        old_file.unlink()
        logger.info("Deleted old backup: %s", old_file)


def list_backups_local(path: str) -> list[dict]:
    backups = []
    for f in _local_backup_files(path):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "location": str(f),
            "storage": "local",
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        })
    return backups


def _s3_client(config: BackupConfig):
    import boto3
    from botocore.config import Config

    client_kwargs: dict[str, Any] = {
        "aws_access_key_id": config.s3_access_key,
        "aws_secret_access_key": config.s3_secret_key,
        "region_name": config.s3_region,
        "config": Config(signature_version="s3v4", connect_timeout=10, read_timeout=30),
    }
    if config.s3_endpoint:
        client_kwargs["endpoint_url"] = config.s3_endpoint
    return boto3.client("s3", **client_kwargs)


def _s3_prefix(config: BackupConfig) -> str:
    prefix = config.s3_prefix.strip("/")
    return f"{prefix}/" if prefix else ""


def _s3_backup_objects(client, config: BackupConfig) -> list[dict]:
    objects: list[dict] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=config.s3_bucket, Prefix=_s3_prefix(config)):
        objects.extend(
            obj for obj in page.get("Contents", [])
            if _is_backup_filename(obj["Key"].rsplit("/", 1)[-1])
        )
    return sorted(objects, key=lambda obj: obj["Key"], reverse=True)


def save_to_s3(content: bytes, config: BackupConfig, filename: str) -> str:
    if not config.s3_bucket:
        raise BackupError("S3 bucket is not configured")
    key = f"{_s3_prefix(config)}{filename}"
    _s3_client(config).put_object(
        Bucket=config.s3_bucket, Key=key, Body=content, ContentType="application/gzip",
    )
    location = f"s3://{config.s3_bucket}/{key}"
    logger.info("Backup uploaded to S3: %s", location)
    return location


def cleanup_old_backups_s3(config: BackupConfig) -> None:
    client = _s3_client(config)
    for old_obj in _s3_backup_objects(client, config)[config.retention_count:]:
        client.delete_object(Bucket=config.s3_bucket, Key=old_obj["Key"])
        logger.info("Deleted old S3 backup: s3://%s/%s", config.s3_bucket, old_obj["Key"])


def list_backups_s3(config: BackupConfig) -> list[dict]:
    return [
        {
            "filename": obj["Key"].rsplit("/", 1)[-1],
            "location": f"s3://{config.s3_bucket}/{obj['Key']}",
            "storage": "s3",
            "size": obj["Size"],
            "created": obj["LastModified"].isoformat(),
        }
        for obj in _s3_backup_objects(_s3_client(config), config)
    ]


@contextmanager
def _sftp_session(config: BackupConfig) -> Iterator[Any]:
    import paramiko

    if not config.sftp_host:
        raise BackupError("SFTP host is not configured")

    transport = paramiko.Transport((config.sftp_host, config.sftp_port))
    try:
        if config.sftp_key_path and os.path.exists(config.sftp_key_path):
            private_key = paramiko.RSAKey.from_private_key_file(config.sftp_key_path)
            transport.connect(username=config.sftp_username, pkey=private_key)
        else:
            transport.connect(username=config.sftp_username, password=config.sftp_password)
        yield paramiko.SFTPClient.from_transport(transport)
    finally:
        transport.close()


def _sftp_ensure_dir(sftp, remote_dir: str) -> None:
    current = ""
    for part in remote_dir.split("/"):
        if not part:
            continue
        current += "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def _sftp_backup_files(sftp, remote_dir: str) -> list[Any]:
    try:
        entries = sftp.listdir_attr(remote_dir)
    except FileNotFoundError:
        return []
    return sorted(
        (e for e in entries if _is_backup_filename(e.filename)),
        key=lambda e: e.filename,
        reverse=True,
    )


def save_to_sftp(content: bytes, config: BackupConfig, filename: str) -> str:
    remote_dir = config.sftp_path.rstrip("/") or "/"
    with _sftp_session(config) as sftp:
        _sftp_ensure_dir(sftp, remote_dir)
        remote_file = f"{remote_dir.rstrip('/')}/{filename}"
        with sftp.file(remote_file, "wb") as f:
            f.write(content)
    location = f"sftp://{config.sftp_host}{remote_file}"
    logger.info("Backup uploaded to SFTP: %s", location)
    return location


def cleanup_old_backups_sftp(config: BackupConfig) -> None:
    remote_dir = config.sftp_path.rstrip("/") or "/"
    with _sftp_session(config) as sftp:
        for old_file in _sftp_backup_files(sftp, remote_dir)[config.retention_count:]:
            sftp.remove(f"{remote_dir.rstrip('/')}/{old_file.filename}")
            logger.info("Deleted old SFTP backup: %s", old_file.filename)


def list_backups_sftp(config: BackupConfig) -> list[dict]:
    remote_dir = config.sftp_path.rstrip("/") or "/"
    with _sftp_session(config) as sftp:
        return [
            {
                "filename": entry.filename,
                "location": f"sftp://{config.sftp_host}{remote_dir.rstrip('/')}/{entry.filename}",
                "storage": "sftp",
                "size": entry.st_size,
                "created": datetime.fromtimestamp(entry.st_mtime, tz=timezone.utc).isoformat(),
            }
            for entry in _sftp_backup_files(sftp, remote_dir)
        ]


def list_backups(db: Session) -> dict:
    """List stored backups: local copies plus the remote copies, if configured."""
    config = get_backup_config(db)
    backups = list_backups_local(config.local_path)
    remote_error = None
    try:
        if config.remote_type == "s3":
            backups += list_backups_s3(config)
        elif config.remote_type == "sftp":
            backups += list_backups_sftp(config)
    except Exception as exc:
        logger.warning("Failed to list remote backups: %s", exc)
        remote_error = str(exc)
    return {"backups": backups, "type": config.remote_type, "remote_error": remote_error}


def test_backup_storage(db: Session) -> tuple[bool, str]:
    """Verify the configured backup storage is reachable and writable."""
    config = get_backup_config(db)
    try:
        directory = Path(config.local_path)
        directory.mkdir(parents=True, exist_ok=True)
        probe = directory / ".backup_test"
        probe.write_text("test")
        probe.unlink()

        if config.remote_type == "local":
            return True, f"Local path {config.local_path} is writable"
        if config.remote_type == "s3":
            _s3_client(config).head_bucket(Bucket=config.s3_bucket)
            return True, f"S3 bucket {config.s3_bucket} is accessible"
        if config.remote_type == "sftp":
            with _sftp_session(config) as sftp:
                _sftp_ensure_dir(sftp, config.sftp_path.rstrip("/") or "/")
            return True, f"SFTP connection to {config.sftp_host} successful"
        return False, f"Unknown backup type: {config.remote_type}"
    except Exception as exc:
        logger.exception("Backup storage test failed")
        return False, str(exc)


# ---------------------------------------------------------------------------
# Running backups
# ---------------------------------------------------------------------------

def _notify_backup_failed(db: Session, error: str) -> None:
    """Alert admins that a backup failed (webhook + email, both best-effort)."""
    from app.services.email_service import send_email
    from app.services.notification_service import notify_backup_failed

    try:
        notify_backup_failed(db, error)
    except Exception:
        logger.exception("Failed to send backup failure webhook")

    try:
        pool_name = get_setting(db, "pool_name", "Pool")
        recipients = db.query(User).filter(User.is_active.is_(True), User.email.isnot(None)).all()
        for user in recipients:
            if user.email:
                send_email(
                    db,
                    user.email,
                    f"[{pool_name}] Backup failed",
                    f"<p>The scheduled system backup for <strong>{pool_name}</strong> failed.</p>"
                    f"<p><strong>Error:</strong> {error}</p>"
                    "<p>Check Settings → Backup in the admin panel.</p>",
                )
    except Exception:
        logger.exception("Failed to send backup failure email")


def run_backup(
    db: Session | None = None,
    export_type: str = "automatic",
    update_status: bool = True,
) -> dict:
    """Create a backup, store it locally (and remotely if configured), apply retention."""
    close_db = db is None
    if db is None:
        db = SessionLocal()

    try:
        config = get_backup_config(db)
        now = _local_now(db)
        timestamp = now.strftime("%Y%m%d-%H%M%S")
        suffix = "" if export_type in ("automatic", "manual") else f"-{export_type}"
        filename = f"pool-backup-{timestamp}{suffix}.json.gz"

        backup_data = create_backup_data(db, export_type)
        content = encode_backup(backup_data)
        # Read the archive back before trusting it
        decode_backup(content)

        location = save_to_local(content, config.local_path, filename)
        cleanup_old_backups_local(config.local_path, config.retention_count)

        if config.remote_type == "s3":
            location = save_to_s3(content, config, filename)
            cleanup_old_backups_s3(config)
        elif config.remote_type == "sftp":
            location = save_to_sftp(content, config, filename)
            cleanup_old_backups_sftp(config)
        elif config.remote_type != "local":
            raise BackupError(f"Unknown backup type: {config.remote_type}")

        if update_status:
            finished = datetime.now(timezone.utc).isoformat()
            set_setting(db, "backup_last_run", finished)
            set_setting(db, "backup_last_success", finished)
            set_setting(db, "backup_last_status", "success")
            set_setting(db, "backup_last_location", location)

        logger.info("Backup completed: %s (%d bytes, type=%s)", location, len(content), export_type)
        return {
            "success": True,
            "location": location,
            "filename": filename,
            "timestamp": timestamp,
            "type": config.remote_type,
            "size": len(content),
            "rows": sum(backup_data["table_counts"].values()),
        }

    except Exception as exc:
        logger.exception("Backup failed")
        db.rollback()
        error = str(exc) or exc.__class__.__name__
        if update_status:
            try:
                set_setting(db, "backup_last_run", datetime.now(timezone.utc).isoformat())
                set_setting(db, "backup_last_status", f"failed: {error}")
            except Exception:
                logger.exception("Could not record backup failure status")
            _notify_backup_failed(db, error)
        return {"success": False, "error": error}

    finally:
        if close_db:
            db.close()


# ---------------------------------------------------------------------------
# Scheduling & status
# ---------------------------------------------------------------------------

def is_backup_due(schedule: str, hour: int, now: datetime, last_success: datetime | None) -> bool:
    """Decide whether the hourly scheduler tick should run a backup.

    ``now`` is local time. A backup runs at its scheduled slot, or immediately
    when the last successful backup is overdue (e.g. the server was off).
    """
    interval = SCHEDULE_INTERVALS.get(schedule, SCHEDULE_INTERVALS["daily"])
    if last_success is None or now - last_success > interval + OVERDUE_GRACE:
        return True
    if schedule == "hourly":
        return True
    if schedule == "weekly":
        return now.weekday() == 6 and now.hour == hour
    return now.hour == hour


def get_next_backup_time(schedule: str, hour: int, now: datetime) -> datetime:
    """Next scheduled backup slot after ``now`` (local time)."""
    if schedule == "hourly":
        return now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    next_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if schedule == "weekly":
        next_time += timedelta(days=(6 - now.weekday()) % 7)
        if next_time <= now:
            next_time += timedelta(days=7)
    elif next_time <= now:
        next_time += timedelta(days=1)
    return next_time


def run_scheduled_backup_if_due(db: Session) -> dict | None:
    """Hourly scheduler entry point. Returns the backup result, or None if skipped."""
    config = get_backup_config(db)
    if not config.enabled:
        return None

    last_success = _parse_timestamp(get_setting(db, "backup_last_success", ""))
    if not is_backup_due(config.schedule, config.hour, _local_now(db), last_success):
        return None

    logger.info("Running scheduled backup (schedule=%s)", config.schedule)
    return run_backup(db, export_type="automatic")


def get_backup_status(db: Session) -> dict:
    """Backup configuration, last run details, and health."""
    config = get_backup_config(db)
    now = _local_now(db)
    last_success = _parse_timestamp(get_setting(db, "backup_last_success", ""))
    interval = SCHEDULE_INTERVALS[config.schedule]

    stale = config.enabled and (last_success is None or now - last_success > interval * 2)
    return {
        "enabled": config.enabled,
        "schedule": config.schedule,
        "hour": config.hour,
        "retention_count": config.retention_count,
        "remote_type": config.remote_type,
        "last_run": get_setting(db, "backup_last_run", ""),
        "last_success": get_setting(db, "backup_last_success", ""),
        "last_status": get_setting(db, "backup_last_status", ""),
        "last_location": get_setting(db, "backup_last_location", ""),
        "next_run": get_next_backup_time(config.schedule, config.hour, now).isoformat() if config.enabled else None,
        "stale": stale,
    }

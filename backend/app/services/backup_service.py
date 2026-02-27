"""
Automated backup service with remote storage support.
Supports: Local filesystem, S3, SFTP
"""
import io
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.activity_log import ActivityLog
from app.models.card import Card
from app.models.checkin import Checkin
from app.models.guest_visit import GuestVisit
from app.models.member import Member
from app.models.membership import Membership
from app.models.membership_freeze import MembershipFreeze
from app.models.pin_lockout import PinLockout
from app.models.plan import Plan
from app.models.pool_schedule import PoolSchedule, ScheduleOverride
from app.models.saved_card import SavedCard
from app.models.setting import Setting
from app.models.transaction import Transaction
from app.models.user import User
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

# Global scheduler thread
_scheduler_thread = None
_scheduler_stop_event = threading.Event()


def serialize_model(obj) -> dict:
    """Convert a SQLAlchemy model to a dict, handling dates and enums."""
    result = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.name)
        if value is None:
            result[column.name] = None
        elif hasattr(value, 'isoformat'):
            result[column.name] = value.isoformat()
        elif hasattr(value, 'value'):  # Enum
            result[column.name] = value.value
        else:
            result[column.name] = str(value) if not isinstance(value, (str, int, float, bool)) else value
    return result


def create_backup_data(db: Session) -> dict:
    """Create a complete backup of all system data."""
    return {
        "export_version": "1.1",
        "export_date": datetime.utcnow().isoformat(),
        "export_type": "automatic",
        "data": {
            "settings": [serialize_model(s) for s in db.query(Setting).all()],
            "users": [serialize_model(u) for u in db.query(User).all()],
            "plans": [serialize_model(p) for p in db.query(Plan).all()],
            "members": [serialize_model(m) for m in db.query(Member).all()],
            "cards": [serialize_model(c) for c in db.query(Card).all()],
            "memberships": [serialize_model(m) for m in db.query(Membership).all()],
            "membership_freezes": [serialize_model(f) for f in db.query(MembershipFreeze).all()],
            "transactions": [serialize_model(t) for t in db.query(Transaction).all()],
            "checkins": [serialize_model(c) for c in db.query(Checkin).all()],
            "saved_cards": [serialize_model(c) for c in db.query(SavedCard).all()],
            "guest_visits": [serialize_model(g) for g in db.query(GuestVisit).all()],
            "pin_lockouts": [serialize_model(p) for p in db.query(PinLockout).all()],
            "activity_logs": [serialize_model(a) for a in db.query(ActivityLog).all()],
            "pool_schedules": [serialize_model(s) for s in db.query(PoolSchedule).all()],
            "schedule_overrides": [serialize_model(o) for o in db.query(ScheduleOverride).all()],
        }
    }


def save_to_local(backup_data: dict, path: str, filename: str) -> str:
    """Save backup to local filesystem."""
    full_path = Path(path)
    full_path.mkdir(parents=True, exist_ok=True)

    file_path = full_path / filename
    with open(file_path, 'w') as f:
        json.dump(backup_data, f, indent=2)

    logger.info("Backup saved to local path: %s", file_path)
    return str(file_path)


def save_to_s3(backup_data: dict, bucket: str, prefix: str, filename: str,
               access_key: str, secret_key: str, region: str = "us-east-1",
               endpoint_url: str = None) -> str:
    """Save backup to S3 or S3-compatible storage."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        raise RuntimeError("boto3 not installed. Run: pip install boto3")

    config = Config(signature_version='s3v4')

    client_kwargs = {
        'aws_access_key_id': access_key,
        'aws_secret_access_key': secret_key,
        'region_name': region,
        'config': config,
    }
    if endpoint_url:
        client_kwargs['endpoint_url'] = endpoint_url

    s3 = boto3.client('s3', **client_kwargs)

    key = f"{prefix.strip('/')}/{filename}" if prefix else filename
    body = json.dumps(backup_data, indent=2).encode('utf-8')

    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json')

    location = f"s3://{bucket}/{key}"
    logger.info("Backup saved to S3: %s", location)
    return location


def save_to_sftp(backup_data: dict, host: str, port: int, username: str,
                 password: str, remote_path: str, filename: str,
                 private_key_path: str = None) -> str:
    """Save backup to SFTP server."""
    try:
        import paramiko
    except ImportError:
        raise RuntimeError("paramiko not installed. Run: pip install paramiko")

    transport = paramiko.Transport((host, port))

    try:
        if private_key_path and os.path.exists(private_key_path):
            private_key = paramiko.RSAKey.from_private_key_file(private_key_path)
            transport.connect(username=username, pkey=private_key)
        else:
            transport.connect(username=username, password=password)

        sftp = paramiko.SFTPClient.from_transport(transport)

        # Ensure remote directory exists
        remote_dir = remote_path.rstrip('/')
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            # Create directory recursively
            parts = remote_dir.split('/')
            current = ''
            for part in parts:
                if part:
                    current += '/' + part
                    try:
                        sftp.stat(current)
                    except FileNotFoundError:
                        sftp.mkdir(current)

        remote_file = f"{remote_dir}/{filename}"

        # Write backup data
        with sftp.file(remote_file, 'w') as f:
            f.write(json.dumps(backup_data, indent=2))

        logger.info("Backup saved to SFTP: %s:%s", host, remote_file)
        return f"sftp://{host}{remote_file}"

    finally:
        transport.close()


def cleanup_old_backups_local(path: str, retention_count: int):
    """Remove old backups from local storage, keeping only retention_count newest."""
    full_path = Path(path)
    if not full_path.exists():
        return

    backup_files = sorted(
        [f for f in full_path.glob("pool-backup-*.json")],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )

    for old_file in backup_files[retention_count:]:
        old_file.unlink()
        logger.info("Deleted old backup: %s", old_file)


def cleanup_old_backups_s3(bucket: str, prefix: str, retention_count: int,
                           access_key: str, secret_key: str, region: str = "us-east-1",
                           endpoint_url: str = None):
    """Remove old backups from S3, keeping only retention_count newest."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        return

    config = Config(signature_version='s3v4')
    client_kwargs = {
        'aws_access_key_id': access_key,
        'aws_secret_access_key': secret_key,
        'region_name': region,
        'config': config,
    }
    if endpoint_url:
        client_kwargs['endpoint_url'] = endpoint_url

    s3 = boto3.client('s3', **client_kwargs)

    prefix_path = prefix.strip('/') + '/' if prefix else ''
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix_path)

    if 'Contents' not in response:
        return

    # Filter to only backup files and sort by date
    backup_objects = sorted(
        [obj for obj in response['Contents'] if obj['Key'].endswith('.json') and 'pool-backup-' in obj['Key']],
        key=lambda x: x['LastModified'],
        reverse=True
    )

    for old_obj in backup_objects[retention_count:]:
        s3.delete_object(Bucket=bucket, Key=old_obj['Key'])
        logger.info("Deleted old S3 backup: s3://%s/%s", bucket, old_obj['Key'])


def cleanup_old_backups_sftp(host: str, port: int, username: str, password: str,
                              remote_path: str, retention_count: int,
                              private_key_path: str = None):
    """Remove old backups from SFTP, keeping only retention_count newest."""
    try:
        import paramiko
    except ImportError:
        return

    transport = paramiko.Transport((host, port))

    try:
        if private_key_path and os.path.exists(private_key_path):
            private_key = paramiko.RSAKey.from_private_key_file(private_key_path)
            transport.connect(username=username, pkey=private_key)
        else:
            transport.connect(username=username, password=password)

        sftp = paramiko.SFTPClient.from_transport(transport)

        remote_dir = remote_path.rstrip('/')
        try:
            files = sftp.listdir_attr(remote_dir)
        except FileNotFoundError:
            return

        # Filter to backup files and sort by mtime
        backup_files = sorted(
            [f for f in files if f.filename.startswith('pool-backup-') and f.filename.endswith('.json')],
            key=lambda x: x.st_mtime,
            reverse=True
        )

        for old_file in backup_files[retention_count:]:
            sftp.remove(f"{remote_dir}/{old_file.filename}")
            logger.info("Deleted old SFTP backup: %s", old_file.filename)

    finally:
        transport.close()


def run_backup(db: Session = None) -> dict:
    """Execute a backup based on current settings."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        # Get backup settings
        backup_type = get_setting(db, "backup_remote_type", "local")
        retention_count = int(get_setting(db, "backup_retention_count", "7"))

        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"pool-backup-{timestamp}.json"

        # Create backup data
        backup_data = create_backup_data(db)

        # Save based on type
        if backup_type == "local":
            path = get_setting(db, "backup_local_path", "/backups")
            location = save_to_local(backup_data, path, filename)
            cleanup_old_backups_local(path, retention_count)

        elif backup_type == "s3":
            bucket = get_setting(db, "backup_s3_bucket", "")
            prefix = get_setting(db, "backup_s3_prefix", "backups")
            access_key = get_setting(db, "backup_s3_access_key", "")
            secret_key = get_setting(db, "backup_s3_secret_key", "")
            region = get_setting(db, "backup_s3_region", "us-east-1")
            endpoint_url = get_setting(db, "backup_s3_endpoint", "") or None

            location = save_to_s3(backup_data, bucket, prefix, filename,
                                  access_key, secret_key, region, endpoint_url)
            cleanup_old_backups_s3(bucket, prefix, retention_count,
                                   access_key, secret_key, region, endpoint_url)

        elif backup_type == "sftp":
            host = get_setting(db, "backup_sftp_host", "")
            port = int(get_setting(db, "backup_sftp_port", "22"))
            username = get_setting(db, "backup_sftp_username", "")
            password = get_setting(db, "backup_sftp_password", "")
            remote_path = get_setting(db, "backup_sftp_path", "/backups")
            private_key = get_setting(db, "backup_sftp_key_path", "") or None

            location = save_to_sftp(backup_data, host, port, username, password,
                                    remote_path, filename, private_key)
            cleanup_old_backups_sftp(host, port, username, password, remote_path,
                                     retention_count, private_key)
        else:
            raise ValueError(f"Unknown backup type: {backup_type}")

        result = {
            "success": True,
            "location": location,
            "filename": filename,
            "timestamp": timestamp,
            "type": backup_type,
        }

        # Save last backup info
        from app.services.settings_service import set_setting
        set_setting(db, "backup_last_run", datetime.utcnow().isoformat())
        set_setting(db, "backup_last_status", "success")
        set_setting(db, "backup_last_location", location)

        logger.info("Backup completed successfully: %s", location)
        return result

    except Exception as e:
        logger.exception("Backup failed")

        # Save failure info
        try:
            from app.services.settings_service import set_setting
            set_setting(db, "backup_last_run", datetime.utcnow().isoformat())
            set_setting(db, "backup_last_status", f"failed: {str(e)}")
        except:
            pass

        return {
            "success": False,
            "error": str(e),
        }

    finally:
        if close_db:
            db.close()


def get_next_backup_time(schedule: str, hour: int = 2) -> datetime:
    """Calculate the next backup time based on schedule."""
    now = datetime.now()

    if schedule == "hourly":
        next_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    elif schedule == "daily":
        next_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if next_time <= now:
            next_time += timedelta(days=1)
    elif schedule == "weekly":
        # Run on Sunday at specified hour
        days_until_sunday = (6 - now.weekday()) % 7
        if days_until_sunday == 0 and now.hour >= hour:
            days_until_sunday = 7
        next_time = now.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=days_until_sunday)
    else:
        # Default to daily
        next_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if next_time <= now:
            next_time += timedelta(days=1)

    return next_time


def scheduler_loop():
    """Background thread that checks and runs scheduled backups."""
    logger.info("Backup scheduler started")

    while not _scheduler_stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                backup_enabled = get_setting(db, "backup_enabled", "false").lower() == "true"

                if backup_enabled:
                    schedule = get_setting(db, "backup_schedule", "daily")
                    hour = int(get_setting(db, "backup_hour", "2"))
                    last_run_str = get_setting(db, "backup_last_run", "")

                    should_run = False

                    if not last_run_str:
                        should_run = True
                    else:
                        try:
                            last_run = datetime.fromisoformat(last_run_str.replace('Z', ''))
                            next_time = get_next_backup_time(schedule, hour)

                            # Check if we're past the next scheduled time
                            if datetime.now() >= next_time and last_run < next_time:
                                should_run = True
                        except:
                            should_run = True

                    if should_run:
                        logger.info("Running scheduled backup")
                        run_backup(db)

            finally:
                db.close()

        except Exception as e:
            logger.exception("Scheduler error: %s", e)

        # Check every minute
        _scheduler_stop_event.wait(60)

    logger.info("Backup scheduler stopped")


def start_scheduler():
    """Start the backup scheduler thread."""
    global _scheduler_thread

    if _scheduler_thread is not None and _scheduler_thread.is_alive():
        logger.info("Scheduler already running")
        return

    _scheduler_stop_event.clear()
    _scheduler_thread = threading.Thread(target=scheduler_loop, daemon=True)
    _scheduler_thread.start()
    logger.info("Backup scheduler thread started")


def stop_scheduler():
    """Stop the backup scheduler thread."""
    global _scheduler_thread

    _scheduler_stop_event.set()
    if _scheduler_thread is not None:
        _scheduler_thread.join(timeout=5)
        _scheduler_thread = None
    logger.info("Backup scheduler thread stopped")


def list_backups_local(path: str) -> list[dict]:
    """List backups in local storage."""
    full_path = Path(path)
    if not full_path.exists():
        return []

    backups = []
    for f in sorted(full_path.glob("pool-backup-*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "location": str(f),
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })

    return backups


def list_backups_s3(bucket: str, prefix: str, access_key: str, secret_key: str,
                    region: str = "us-east-1", endpoint_url: str = None) -> list[dict]:
    """List backups in S3."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        return []

    config = Config(signature_version='s3v4')
    client_kwargs = {
        'aws_access_key_id': access_key,
        'aws_secret_access_key': secret_key,
        'region_name': region,
        'config': config,
    }
    if endpoint_url:
        client_kwargs['endpoint_url'] = endpoint_url

    s3 = boto3.client('s3', **client_kwargs)

    prefix_path = prefix.strip('/') + '/' if prefix else ''
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix_path)

    if 'Contents' not in response:
        return []

    backups = []
    for obj in sorted(response['Contents'], key=lambda x: x['LastModified'], reverse=True):
        if 'pool-backup-' in obj['Key'] and obj['Key'].endswith('.json'):
            backups.append({
                "filename": obj['Key'].split('/')[-1],
                "location": f"s3://{bucket}/{obj['Key']}",
                "size": obj['Size'],
                "created": obj['LastModified'].isoformat(),
            })

    return backups

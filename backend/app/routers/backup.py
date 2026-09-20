import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.backup import (
    BackupListResponse,
    BackupRunResponse,
    BackupStatusResponse,
    BackupTestResponse,
    RestoreResponse,
)
from app.services import backup_service
from app.services.activity_service import log_activity
from app.services.auth_service import get_current_user
from app.services.backup_service import BackupError

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_IMPORT_BYTES = 200 * 1024 * 1024


def _restore(db: Session, content: bytes, source: str, user_id) -> dict:
    try:
        result = backup_service.restore_from_archive(db, content, source)
    except BackupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.exception("System restore failed (source=%s)", source)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Restore failed and was rolled back — no data was changed: {exc}",
        )

    # The restoring admin may not exist in the restored data
    restored_user = db.get(User, user_id)
    log_activity(
        db,
        restored_user.id if restored_user else None,
        "system_restore",
        "system",
        after={"source": source, "rows": sum(result["stats"].values())},
        note=f"System restored from {source}; safety backup {result['safety_backup']}",
    )
    return result


@router.get("/export")
def export_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JSONResponse:
    """Export entire system data as JSON for backup/migration."""
    try:
        export_data = backup_service.create_backup_data(db, export_type="manual")
    except Exception as exc:
        logger.exception("System export failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    logger.info("System export created by user=%s", current_user.id)
    filename = f"pool-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    return JSONResponse(
        content=export_data,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import", response_model=RestoreResponse)
async def import_system(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Restore the system from an uploaded backup (.json or .json.gz). Replaces all data."""
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Backup file too large")
    return _restore(db, content, f"upload:{file.filename}", current_user.id)


@router.post("/restore/{filename}", response_model=RestoreResponse)
def restore_stored_backup(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Restore the system from a backup stored in the local backup directory."""
    path = _resolve(db, filename)
    return _restore(db, path.read_bytes(), f"stored:{filename}", current_user.id)


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Download a backup stored in the local backup directory."""
    path = _resolve(db, filename)
    logger.info("Backup downloaded: file=%s, user=%s", filename, current_user.id)
    return FileResponse(path, media_type="application/gzip", filename=filename)


def _resolve(db: Session, filename: str):
    try:
        return backup_service.resolve_local_backup(db, filename)
    except BackupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")


@router.post("/run", response_model=BackupRunResponse)
def run_backup_now(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Manually trigger a backup using current settings."""
    result = backup_service.run_backup(db, export_type="manual")
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Backup failed"),
        )

    log_activity(
        db, current_user.id, "backup_run", "system",
        after={"filename": result["filename"], "location": result["location"]},
    )
    return result


@router.get("/status", response_model=BackupStatusResponse)
def get_backup_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get current backup configuration, last run status, and health."""
    return backup_service.get_backup_status(db)


@router.get("/list", response_model=BackupListResponse)
def list_backups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """List available backups in local and configured remote storage."""
    return backup_service.list_backups(db)


@router.post("/test", response_model=BackupTestResponse)
def test_backup_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Test the backup storage connection."""
    success, message = backup_service.test_backup_storage(db)
    return {"success": success, "message": message}

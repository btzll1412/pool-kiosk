from pydantic import BaseModel


class BackupRunResponse(BaseModel):
    success: bool
    location: str
    filename: str
    timestamp: str
    type: str
    size: int
    rows: int


class BackupStatusResponse(BaseModel):
    enabled: bool
    schedule: str
    hour: int
    retention_count: int
    remote_type: str
    last_run: str
    last_success: str
    last_status: str
    last_location: str
    next_run: str | None
    stale: bool


class BackupFile(BaseModel):
    filename: str
    location: str
    storage: str
    size: int
    created: str


class BackupListResponse(BaseModel):
    backups: list[BackupFile]
    type: str
    remote_error: str | None = None


class BackupTestResponse(BaseModel):
    success: bool
    message: str


class RestoreResponse(BaseModel):
    success: bool
    message: str
    safety_backup: str
    stats: dict[str, int]

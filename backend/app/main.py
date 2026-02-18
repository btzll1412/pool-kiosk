from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import SessionLocal
from app.models.user import User
from app.routers import (
    auth,
    cards,
    checkins,
    kiosk,
    members,
    memberships,
    payments,
    plans,
    reports,
    settings as settings_router,
    transactions,
)
from app.services.rate_limit import limiter
from app.services.seed import create_default_admin, seed_default_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        create_default_admin(db)
        seed_default_settings(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Pool Management System",
    description=f"{settings.pool_name} — Kiosk & Admin API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(members.router, prefix="/api/members", tags=["Members"])
app.include_router(cards.router, prefix="/api/members", tags=["Cards"])
app.include_router(plans.router, prefix="/api/plans", tags=["Plans"])
app.include_router(memberships.router, prefix="/api/memberships", tags=["Memberships"])
app.include_router(checkins.router, prefix="/api/checkins", tags=["Checkins"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])
app.include_router(kiosk.router, prefix="/api/kiosk", tags=["Kiosk"])


@app.get("/api/health")
def health_check():
    return {"status": "ok"}

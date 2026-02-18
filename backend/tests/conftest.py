"""Test fixtures for the pool management system.

Uses SQLite in-memory for fast, isolated tests. The activity_log model uses
SQLAlchemy's generic JSON type (works on both PostgreSQL and SQLite).
"""

import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.member import Member
from app.models.plan import Plan, PlanType
from app.models.user import User, UserRole
from app.services.auth_service import create_access_token, hash_password, hash_pin


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db():
    """Create an in-memory SQLite database for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db: Session):
    """FastAPI test client with the test database injected."""
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.state.testing = True
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    app.state.testing = False


# ---------------------------------------------------------------------------
# Data factory fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db: Session) -> User:
    """Create an admin user and return it."""
    user = User(
        username="testadmin",
        password_hash=hash_password("testpass"),
        role=UserRole.admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin_token(admin_user: User) -> str:
    """Return a valid JWT access token for the admin user."""
    return create_access_token(admin_user.id, admin_user.role)


@pytest.fixture()
def admin_headers(admin_token: str) -> dict:
    """Return Authorization header dict for admin requests."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def member_with_pin(db: Session) -> Member:
    """Create a member with PIN '1234'."""
    member = Member(
        first_name="Test",
        last_name="Member",
        phone="555-0100",
        email="test@example.com",
        pin_hash=hash_pin("1234"),
        credit_balance=Decimal("0.00"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@pytest.fixture()
def single_swim_plan(db: Session) -> Plan:
    """Create a single swim plan at $5."""
    plan = Plan(
        name="Single Swim",
        plan_type=PlanType.single,
        price=Decimal("5.00"),
        swim_count=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture()
def swim_pass_plan(db: Session) -> Plan:
    """Create a 10-swim pass plan at $40."""
    plan = Plan(
        name="10-Swim Pack",
        plan_type=PlanType.swim_pass,
        price=Decimal("40.00"),
        swim_count=10,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture()
def monthly_plan(db: Session) -> Plan:
    """Create a monthly plan at $50, 30 days."""
    plan = Plan(
        name="Monthly Pass",
        plan_type=PlanType.monthly,
        price=Decimal("50.00"),
        duration_days=30,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture()
def seed_settings(db: Session):
    """Seed default settings needed by services."""
    from app.models.setting import Setting
    from app.services.settings_service import DEFAULT_SETTINGS

    for key, value in DEFAULT_SETTINGS.items():
        db.add(Setting(key=key, value=value))
    db.commit()

import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotUsernameRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SetupRequest,
    SetupStatusResponse,
    TokenResponse,
)
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.email_service import send_password_reset_email, send_username_reminder_email

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/setup-status", response_model=SetupStatusResponse)
def get_setup_status(db: Session = Depends(get_db)):
    """Check if the system needs initial setup (no users exist)."""
    user_count = db.query(User).count()
    return SetupStatusResponse(needs_setup=user_count == 0)


@router.post("/setup", response_model=TokenResponse)
def setup_admin(data: SetupRequest, db: Session = Depends(get_db)):
    """Create the first admin user. Only works if no users exist."""
    user_count = db.query(User).count()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup already completed. Users already exist.",
        )

    # Check for duplicate username or email
    existing_username = db.query(User).filter(User.username == data.username).first()
    if existing_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    existing_email = db.query(User).filter(User.email == data.email).first()
    if existing_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    admin = User(
        username=data.username,
        password_hash=hash_password(data.password),
        email=data.email,
        role=UserRole.admin,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    logger.info("Initial admin created via setup wizard: %s", admin.username)

    return TokenResponse(
        access_token=create_access_token(admin.id, admin.role),
        refresh_token=create_refresh_token(admin.id, admin.role),
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username, User.is_active.is_(True)).first()
    if not user or not verify_password(data.password, user.password_hash):
        logger.warning("Login failed for username: %s", data.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    logger.info("Login successful: user=%s, role=%s", user.username, user.role.value)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        logger.warning("Token refresh failed — invalid token type")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user = db.query(User).filter(User.id == uuid.UUID(payload["sub"]), User.is_active.is_(True)).first()
    if not user:
        logger.warning("Token refresh failed — user not found: %s", payload.get("sub"))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    logger.debug("Token refreshed: user=%s", user.username)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
    )


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate password reset token and send email."""
    # Always return success message to prevent email enumeration
    success_msg = "If an account with that email exists, a password reset link has been sent."

    user = db.query(User).filter(User.email == data.email, User.is_active.is_(True)).first()
    if not user:
        logger.debug("Password reset requested for non-existent email: %s", data.email)
        return MessageResponse(message=success_msg)

    # Generate secure token
    token = secrets.token_urlsafe(32)
    user.password_reset_token = token
    user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    # Send email
    send_password_reset_email(db, user.email, token)
    logger.info("Password reset email sent to user: %s", user.username)

    return MessageResponse(message=success_msg)


@router.post("/forgot-username", response_model=MessageResponse)
def forgot_username(data: ForgotUsernameRequest, db: Session = Depends(get_db)):
    """Send username reminder email."""
    success_msg = "If an account with that email exists, your username has been sent."

    user = db.query(User).filter(User.email == data.email, User.is_active.is_(True)).first()
    if not user:
        logger.debug("Username reminder requested for non-existent email: %s", data.email)
        return MessageResponse(message=success_msg)

    # Send email
    send_username_reminder_email(db, user.email, user.username)
    logger.info("Username reminder email sent to user: %s", user.username)

    return MessageResponse(message=success_msg)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using token from email."""
    user = db.query(User).filter(
        User.password_reset_token == data.token,
        User.is_active.is_(True),
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    if not user.password_reset_expires or user.password_reset_expires < datetime.utcnow():
        # Clear expired token
        user.password_reset_token = None
        user.password_reset_expires = None
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token has expired")

    # Update password and clear token
    user.password_hash = hash_password(data.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.commit()

    logger.info("Password reset successful for user: %s", user.username)
    return MessageResponse(message="Password has been reset successfully. You can now log in.")

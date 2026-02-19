import logging
import uuid
from decimal import Decimal

from app.payments.base import (
    BasePaymentAdapter,
    PaymentSession,
    PaymentStatus,
    PaymentStatusEnum,
    RefundResult,
    SavedCardChargeResult,
)

logger = logging.getLogger(__name__)


class StripePaymentAdapter(BasePaymentAdapter):
    """Stripe payment adapter using the Stripe Python SDK."""

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        try:
            import stripe
            self._stripe = stripe
            self._stripe.api_key = self.config.get("stripe_secret_key", "")
        except ImportError:
            logger.warning("stripe package not installed — adapter will not work")
            self._stripe = None

    def test_connection(self) -> tuple[bool, str]:
        if not self._stripe:
            return False, "stripe package not installed"
        if not self.config.get("stripe_secret_key"):
            return False, "Stripe secret key not configured"
        try:
            self._stripe.Account.retrieve()
            return True, "Connected to Stripe successfully"
        except self._stripe.error.AuthenticationError:
            return False, "Invalid Stripe API key"
        except Exception as exc:
            return False, f"Stripe connection failed: {exc}"

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        if not self._stripe:
            raise RuntimeError("stripe package not installed")
        amount_cents = int(amount * 100)
        try:
            intent = self._stripe.PaymentIntent.create(
                amount=amount_cents,
                currency="usd",
                description=description,
                metadata={"member_id": member_id},
                automatic_payment_methods={"enabled": True},
            )
            logger.info("Stripe PaymentIntent created: id=%s, amount=$%s, member=%s", intent.id, amount, member_id)
            return PaymentSession(
                session_id=intent.id,
                status=PaymentStatusEnum.pending,
                amount=amount,
                message=intent.client_secret or "",
            )
        except Exception as exc:
            logger.exception("Stripe payment initiation failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"stripe_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def check_status(self, session_id: str) -> PaymentStatus:
        if not self._stripe:
            raise RuntimeError("stripe package not installed")
        try:
            intent = self._stripe.PaymentIntent.retrieve(session_id)
            status_map = {
                "succeeded": PaymentStatusEnum.completed,
                "processing": PaymentStatusEnum.pending,
                "canceled": PaymentStatusEnum.failed,
                "requires_payment_method": PaymentStatusEnum.pending,
                "requires_confirmation": PaymentStatusEnum.pending,
                "requires_action": PaymentStatusEnum.pending,
            }
            ps = status_map.get(intent.status, PaymentStatusEnum.pending)
            return PaymentStatus(session_id=session_id, status=ps, message=intent.status)
        except Exception as exc:
            logger.exception("Stripe status check failed: session=%s", session_id)
            return PaymentStatus(session_id=session_id, status=PaymentStatusEnum.failed, message=str(exc))

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        if not self._stripe:
            raise RuntimeError("stripe package not installed")
        try:
            refund = self._stripe.Refund.create(
                payment_intent=transaction_id,
                amount=int(amount * 100),
            )
            logger.info("Stripe refund created: id=%s, amount=$%s", refund.id, amount)
            return RefundResult(success=True, refund_id=refund.id, message="Refund processed")
        except Exception as exc:
            logger.exception("Stripe refund failed: tx=%s, amount=$%s", transaction_id, amount)
            return RefundResult(success=False, message=str(exc))

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        if not self._stripe:
            raise RuntimeError("stripe package not installed")
        try:
            customer = self._stripe.Customer.create(
                metadata={"member_id": member_id, "card_last4": card_last4},
            )
            logger.info("Stripe customer created: id=%s, member=%s", customer.id, member_id)
            return customer.id
        except Exception as exc:
            logger.exception("Stripe tokenization failed: member=%s", member_id)
            raise RuntimeError(f"Stripe tokenization failed: {exc}")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        if not self._stripe:
            raise RuntimeError("stripe package not installed")
        amount_cents = int(amount * 100)
        try:
            intent = self._stripe.PaymentIntent.create(
                amount=amount_cents,
                currency="usd",
                customer=token,
                description=description,
                off_session=True,
                confirm=True,
                metadata={"member_id": member_id},
            )
            logger.info("Stripe saved card charged: id=%s, amount=$%s, member=%s", intent.id, amount, member_id)
            return SavedCardChargeResult(
                success=intent.status == "succeeded",
                reference_id=intent.id,
                message=intent.status,
            )
        except Exception as exc:
            logger.exception("Stripe saved card charge failed: member=%s, amount=$%s", member_id, amount)
            return SavedCardChargeResult(success=False, message=str(exc))

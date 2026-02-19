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


class SquarePaymentAdapter(BasePaymentAdapter):
    """Square payment adapter using the Square Python SDK."""

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self._client = None
        try:
            from square.client import Client
            environment = self.config.get("square_environment", "sandbox")
            access_token = self.config.get("square_access_token", "")
            if access_token:
                self._client = Client(
                    access_token=access_token,
                    environment=environment,
                )
        except ImportError:
            logger.warning("squareup package not installed — adapter will not work")

    @property
    def _location_id(self) -> str:
        return self.config.get("square_location_id", "")

    def test_connection(self) -> tuple[bool, str]:
        if not self._client:
            return False, "Square SDK not available or access token not configured"
        try:
            result = self._client.locations.list_locations()
            if result.is_success():
                locations = result.body.get("locations", [])
                return True, f"Connected to Square ({len(locations)} location(s))"
            return False, f"Square API error: {result.errors}"
        except Exception as exc:
            return False, f"Square connection failed: {exc}"

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        if not self._client:
            raise RuntimeError("Square SDK not available")
        amount_cents = int(amount * 100)
        idempotency_key = uuid.uuid4().hex
        try:
            result = self._client.payments.create_payment(
                body={
                    "idempotency_key": idempotency_key,
                    "amount_money": {"amount": amount_cents, "currency": "USD"},
                    "location_id": self._location_id,
                    "note": description,
                    "reference_id": member_id,
                    "autocomplete": True,
                }
            )
            if result.is_success():
                payment = result.body["payment"]
                logger.info("Square payment created: id=%s, amount=$%s, member=%s", payment["id"], amount, member_id)
                return PaymentSession(
                    session_id=payment["id"],
                    status=PaymentStatusEnum.completed,
                    amount=amount,
                    message="Payment completed",
                )
            error_msg = str(result.errors)
            logger.warning("Square payment failed: %s", error_msg)
            return PaymentSession(
                session_id=f"sq_err_{idempotency_key[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=error_msg,
            )
        except Exception as exc:
            logger.exception("Square payment initiation failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"sq_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def check_status(self, session_id: str) -> PaymentStatus:
        if not self._client:
            raise RuntimeError("Square SDK not available")
        try:
            result = self._client.payments.get_payment(payment_id=session_id)
            if result.is_success():
                sq_status = result.body["payment"]["status"]
                status_map = {
                    "COMPLETED": PaymentStatusEnum.completed,
                    "APPROVED": PaymentStatusEnum.completed,
                    "PENDING": PaymentStatusEnum.pending,
                    "CANCELED": PaymentStatusEnum.failed,
                    "FAILED": PaymentStatusEnum.failed,
                }
                return PaymentStatus(
                    session_id=session_id,
                    status=status_map.get(sq_status, PaymentStatusEnum.pending),
                    message=sq_status,
                )
            return PaymentStatus(session_id=session_id, status=PaymentStatusEnum.failed, message=str(result.errors))
        except Exception as exc:
            logger.exception("Square status check failed: session=%s", session_id)
            return PaymentStatus(session_id=session_id, status=PaymentStatusEnum.failed, message=str(exc))

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        if not self._client:
            raise RuntimeError("Square SDK not available")
        amount_cents = int(amount * 100)
        try:
            result = self._client.refunds.refund_payment(
                body={
                    "idempotency_key": uuid.uuid4().hex,
                    "payment_id": transaction_id,
                    "amount_money": {"amount": amount_cents, "currency": "USD"},
                }
            )
            if result.is_success():
                refund = result.body["refund"]
                logger.info("Square refund created: id=%s, amount=$%s", refund["id"], amount)
                return RefundResult(success=True, refund_id=refund["id"], message="Refund processed")
            return RefundResult(success=False, message=str(result.errors))
        except Exception as exc:
            logger.exception("Square refund failed: tx=%s, amount=$%s", transaction_id, amount)
            return RefundResult(success=False, message=str(exc))

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        if not self._client:
            raise RuntimeError("Square SDK not available")
        try:
            result = self._client.customers.create_customer(
                body={
                    "idempotency_key": uuid.uuid4().hex,
                    "reference_id": member_id,
                    "note": f"Card {card_brand} ending {card_last4}",
                }
            )
            if result.is_success():
                customer_id = result.body["customer"]["id"]
                logger.info("Square customer created: id=%s, member=%s", customer_id, member_id)
                return customer_id
            raise RuntimeError(f"Square tokenization failed: {result.errors}")
        except Exception as exc:
            logger.exception("Square tokenization failed: member=%s", member_id)
            raise RuntimeError(f"Square tokenization failed: {exc}")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        if not self._client:
            raise RuntimeError("Square SDK not available")
        amount_cents = int(amount * 100)
        try:
            result = self._client.payments.create_payment(
                body={
                    "idempotency_key": uuid.uuid4().hex,
                    "amount_money": {"amount": amount_cents, "currency": "USD"},
                    "location_id": self._location_id,
                    "customer_id": token,
                    "note": description,
                    "reference_id": member_id,
                    "autocomplete": True,
                }
            )
            if result.is_success():
                payment = result.body["payment"]
                logger.info("Square saved card charged: id=%s, amount=$%s, member=%s", payment["id"], amount, member_id)
                return SavedCardChargeResult(success=True, reference_id=payment["id"], message="Charge completed")
            error_msg = str(result.errors)
            logger.warning("Square saved card charge failed: %s", error_msg)
            return SavedCardChargeResult(success=False, message=error_msg)
        except Exception as exc:
            logger.exception("Square saved card charge failed: member=%s, amount=$%s", member_id, amount)
            return SavedCardChargeResult(success=False, message=str(exc))

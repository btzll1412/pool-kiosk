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


class StubPaymentAdapter(BasePaymentAdapter):
    """Stub adapter that always succeeds. For development and testing."""

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        return PaymentSession(
            session_id=f"stub_{uuid.uuid4().hex[:12]}",
            status=PaymentStatusEnum.completed,
            amount=amount,
            message="Stub payment completed successfully",
        )

    def check_status(self, session_id: str) -> PaymentStatus:
        return PaymentStatus(
            session_id=session_id,
            status=PaymentStatusEnum.completed,
            message="Stub payment completed",
        )

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        return RefundResult(
            success=True,
            refund_id=f"stub_refund_{uuid.uuid4().hex[:12]}",
            message="Stub refund completed successfully",
        )

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        return f"stub_tok_{uuid.uuid4().hex[:16]}"

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        return SavedCardChargeResult(
            success=True,
            reference_id=f"stub_sc_{uuid.uuid4().hex[:12]}",
            message="Saved card charge completed successfully",
        )

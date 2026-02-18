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


class CashPaymentAdapter(BasePaymentAdapter):
    """Cash payment adapter. Records cash transactions."""

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        session_id = f"cash_{uuid.uuid4().hex[:12]}"
        logger.info("Cash payment recorded: amount=$%s, member=%s, session=%s", amount, member_id, session_id)
        return PaymentSession(
            session_id=session_id,
            status=PaymentStatusEnum.completed,
            amount=amount,
            message="Cash payment recorded",
        )

    def check_status(self, session_id: str) -> PaymentStatus:
        return PaymentStatus(
            session_id=session_id,
            status=PaymentStatusEnum.completed,
            message="Cash payment completed",
        )

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        return RefundResult(
            success=True,
            refund_id=f"cash_refund_{uuid.uuid4().hex[:12]}",
            message="Cash refund recorded",
        )

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        logger.warning("Tokenize attempt on cash adapter — not supported")
        raise NotImplementedError("Cash adapter does not support card tokenization")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        logger.warning("Saved card charge attempt on cash adapter — not supported")
        return SavedCardChargeResult(
            success=False,
            message="Cash adapter cannot charge saved cards",
        )

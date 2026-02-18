import enum
from abc import ABC, abstractmethod
from decimal import Decimal

from pydantic import BaseModel


class PaymentStatusEnum(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class PaymentSession(BaseModel):
    session_id: str
    status: PaymentStatusEnum
    amount: Decimal
    message: str = ""


class PaymentStatus(BaseModel):
    session_id: str
    status: PaymentStatusEnum
    message: str = ""


class RefundResult(BaseModel):
    success: bool
    refund_id: str | None = None
    message: str = ""


class SavedCardChargeResult(BaseModel):
    success: bool
    reference_id: str | None = None
    message: str = ""


class BasePaymentAdapter(ABC):
    @abstractmethod
    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        ...

    @abstractmethod
    def check_status(self, session_id: str) -> PaymentStatus:
        ...

    @abstractmethod
    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        ...

    @abstractmethod
    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        """Return a processor token for a saved card."""
        ...

    @abstractmethod
    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        """Charge a previously tokenized saved card."""
        ...

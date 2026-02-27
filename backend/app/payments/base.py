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
    card_token: str | None = None  # Token for saving the card if save_card was requested


class BasePaymentAdapter(ABC):
    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def test_connection(self) -> tuple[bool, str]:
        """Test connectivity to the payment processor. Override in real adapters."""
        return True, "OK"

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
        self, token: str, amount: Decimal, member_id: str, description: str, customer_name: str | None = None
    ) -> SavedCardChargeResult:
        """Charge a previously tokenized saved card."""
        ...

    def process_manual_card_sale(
        self,
        card_number: str,
        exp_date: str,
        cvv: str,
        amount: Decimal,
        member_id: str,
        description: str,
        save_card: bool = False,
        customer_name: str | None = None,
    ) -> SavedCardChargeResult:
        """
        Process a card-not-present sale with manual card entry.

        Args:
            card_number: Full card number
            exp_date: Expiration in MMYY format
            cvv: Card verification value (3-4 digits)
            amount: Amount to charge
            member_id: Member ID for reference
            description: Transaction description
            save_card: Whether to save the card token for future use
            customer_name: Customer name for billing info

        Returns:
            SavedCardChargeResult with success status and optional token
        """
        raise NotImplementedError("Manual card entry not supported by this adapter")

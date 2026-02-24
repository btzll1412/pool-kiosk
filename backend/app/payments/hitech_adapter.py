import logging
import uuid
from decimal import Decimal

import httpx

from app.payments.base import (
    BasePaymentAdapter,
    PaymentSession,
    PaymentStatus,
    PaymentStatusEnum,
    RefundResult,
    SavedCardChargeResult,
)

logger = logging.getLogger(__name__)

# Converge API base URLs (HiTech Merchants uses Elavon Converge)
CONVERGE_BASE_URLS = {
    "sandbox": "https://api.demo.convergepay.com/VirtualMerchantDemo/process.do",
    "production": "https://api.convergepay.com/VirtualMerchant/process.do",
}


class HiTechPaymentAdapter(BasePaymentAdapter):
    """HiTech Merchants payment adapter using Elavon Converge API."""

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        env = self.config.get("hitech_environment", "sandbox")
        self._base_url = CONVERGE_BASE_URLS.get(env, CONVERGE_BASE_URLS["sandbox"])
        self._merchant_id = self.config.get("hitech_merchant_id", "")
        self._user_id = self.config.get("hitech_user_id", "")
        self._pin = self.config.get("hitech_pin", "")

    def _base_params(self) -> dict[str, str]:
        """Return common authentication parameters for all requests."""
        return {
            "ssl_merchant_id": self._merchant_id,
            "ssl_user_id": self._user_id,
            "ssl_pin": self._pin,
        }

    def _post_request(self, params: dict[str, str]) -> dict[str, str]:
        """Send form-encoded POST to Converge and parse response."""
        all_params = {**self._base_params(), **params}
        resp = httpx.post(
            self._base_url,
            data=all_params,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30.0,
        )
        resp.raise_for_status()
        # Converge returns key=value pairs, one per line
        result = {}
        for line in resp.text.strip().split("\n"):
            if "=" in line:
                key, value = line.split("=", 1)
                result[key.strip()] = value.strip()
        return result

    def test_connection(self) -> tuple[bool, str]:
        if not all([self._merchant_id, self._user_id, self._pin]):
            return False, "HiTech Merchants credentials not configured"
        try:
            # Use ccverify with minimal data to test credentials
            result = self._post_request({
                "ssl_transaction_type": "ccverify",
                "ssl_card_number": "4000000000000002",
                "ssl_exp_date": "1225",
            })
            if result.get("ssl_result") == "0":
                return True, "Connected to HiTech Merchants successfully"
            error_msg = result.get("ssl_result_message", "Unknown error")
            return False, f"Connection test failed: {error_msg}"
        except httpx.RequestError as exc:
            return False, f"HiTech Merchants connection failed: {exc}"

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        """
        Initiate a card sale. For PCI compliance, actual card data
        should be collected via hosted payment page or terminal integration.
        """
        session_id = f"hitech_{uuid.uuid4().hex[:16]}"
        try:
            logger.info(
                "HiTech payment session created: id=%s, amount=$%s, member=%s",
                session_id, amount, member_id
            )
            return PaymentSession(
                session_id=session_id,
                status=PaymentStatusEnum.pending,
                amount=amount,
                message=f"Ready for payment - {description}",
            )
        except Exception as exc:
            logger.exception("HiTech payment initiation failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"hitech_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def process_card_sale(
        self,
        amount: Decimal,
        card_number: str,
        exp_date: str,
        cvv: str,
        member_id: str,
        description: str,
    ) -> PaymentSession:
        """Process an actual card sale with card details."""
        amount_str = f"{amount:.2f}"
        try:
            result = self._post_request({
                "ssl_transaction_type": "ccsale",
                "ssl_amount": amount_str,
                "ssl_card_number": card_number,
                "ssl_exp_date": exp_date,
                "ssl_cvv2cvc2": cvv,
                "ssl_description": description,
                "ssl_invoice_number": member_id,
            })

            if result.get("ssl_result") == "0":
                txn_id = result.get("ssl_txn_id", "")
                logger.info(
                    "HiTech sale completed: txn_id=%s, amount=$%s, member=%s",
                    txn_id, amount, member_id
                )
                return PaymentSession(
                    session_id=txn_id,
                    status=PaymentStatusEnum.completed,
                    amount=amount,
                    message=result.get("ssl_result_message", "Approved"),
                )
            else:
                error_msg = result.get("ssl_result_message", "Transaction declined")
                logger.warning("HiTech sale declined: %s", error_msg)
                return PaymentSession(
                    session_id=f"hitech_dec_{uuid.uuid4().hex[:8]}",
                    status=PaymentStatusEnum.failed,
                    amount=amount,
                    message=error_msg,
                )
        except Exception as exc:
            logger.exception("HiTech sale failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"hitech_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def check_status(self, session_id: str) -> PaymentStatus:
        """Check transaction status."""
        if session_id.startswith("hitech_"):
            return PaymentStatus(
                session_id=session_id,
                status=PaymentStatusEnum.pending,
                message="Awaiting card data",
            )
        try:
            result = self._post_request({
                "ssl_transaction_type": "txnquery",
                "ssl_txn_id": session_id,
            })
            if result.get("ssl_result") == "0":
                return PaymentStatus(
                    session_id=session_id,
                    status=PaymentStatusEnum.completed,
                    message=result.get("ssl_result_message", "Completed"),
                )
            return PaymentStatus(
                session_id=session_id,
                status=PaymentStatusEnum.failed,
                message=result.get("ssl_result_message", "Not found"),
            )
        except Exception as exc:
            logger.exception("HiTech status check failed: session=%s", session_id)
            return PaymentStatus(
                session_id=session_id,
                status=PaymentStatusEnum.failed,
                message=str(exc),
            )

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        """Process a refund for a previous transaction."""
        amount_str = f"{amount:.2f}"
        try:
            result = self._post_request({
                "ssl_transaction_type": "ccreturn",
                "ssl_txn_id": transaction_id,
                "ssl_amount": amount_str,
            })
            if result.get("ssl_result") == "0":
                refund_id = result.get("ssl_txn_id", "")
                logger.info("HiTech refund completed: id=%s, amount=$%s", refund_id, amount)
                return RefundResult(
                    success=True,
                    refund_id=refund_id,
                    message=result.get("ssl_result_message", "Refund processed"),
                )
            error_msg = result.get("ssl_result_message", "Refund failed")
            logger.warning("HiTech refund failed: %s", error_msg)
            return RefundResult(success=False, message=error_msg)
        except Exception as exc:
            logger.exception("HiTech refund failed: tx=%s, amount=$%s", transaction_id, amount)
            return RefundResult(success=False, message=str(exc))

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        """Generate a token placeholder for a card."""
        token = f"hitech_token_{member_id}_{uuid.uuid4().hex[:8]}"
        logger.info("HiTech token placeholder created: member=%s, last4=%s", member_id, card_last4)
        return token

    def generate_card_token(
        self, card_number: str, exp_date: str, member_id: str
    ) -> tuple[str, str, str]:
        """
        Generate a real Converge token from card data.
        Returns (token, last4, card_brand).
        """
        try:
            result = self._post_request({
                "ssl_transaction_type": "ccgettoken",
                "ssl_card_number": card_number,
                "ssl_exp_date": exp_date,
                "ssl_add_token": "Y",
            })
            if result.get("ssl_result") == "0":
                token = result.get("ssl_token", "")
                last4 = card_number[-4:]
                card_brand = result.get("ssl_card_type", "unknown")
                logger.info(
                    "HiTech token generated: member=%s, last4=%s, brand=%s",
                    member_id, last4, card_brand
                )
                return token, last4, card_brand
            raise RuntimeError(result.get("ssl_result_message", "Tokenization failed"))
        except Exception as exc:
            logger.exception("HiTech tokenization failed: member=%s", member_id)
            raise RuntimeError(f"HiTech tokenization failed: {exc}")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        """Charge a previously tokenized card."""
        amount_str = f"{amount:.2f}"
        try:
            result = self._post_request({
                "ssl_transaction_type": "ccsale",
                "ssl_token": token,
                "ssl_amount": amount_str,
                "ssl_description": description,
                "ssl_invoice_number": member_id,
            })
            if result.get("ssl_result") == "0":
                txn_id = result.get("ssl_txn_id", "")
                logger.info(
                    "HiTech saved card charged: txn_id=%s, amount=$%s, member=%s",
                    txn_id, amount, member_id
                )
                return SavedCardChargeResult(
                    success=True,
                    reference_id=txn_id,
                    message=result.get("ssl_result_message", "Approved"),
                )
            error_msg = result.get("ssl_result_message", "Charge declined")
            logger.warning("HiTech saved card charge declined: %s", error_msg)
            return SavedCardChargeResult(success=False, message=error_msg)
        except Exception as exc:
            logger.exception("HiTech saved card charge failed: member=%s, amount=$%s", member_id, amount)
            return SavedCardChargeResult(success=False, message=str(exc))

    def void_transaction(self, transaction_id: str) -> RefundResult:
        """Void a transaction (same-day cancellation before settlement)."""
        try:
            result = self._post_request({
                "ssl_transaction_type": "ccvoid",
                "ssl_txn_id": transaction_id,
            })
            if result.get("ssl_result") == "0":
                logger.info("HiTech transaction voided: txn_id=%s", transaction_id)
                return RefundResult(
                    success=True,
                    refund_id=transaction_id,
                    message="Transaction voided",
                )
            error_msg = result.get("ssl_result_message", "Void failed")
            return RefundResult(success=False, message=error_msg)
        except Exception as exc:
            logger.exception("HiTech void failed: tx=%s", transaction_id)
            return RefundResult(success=False, message=str(exc))

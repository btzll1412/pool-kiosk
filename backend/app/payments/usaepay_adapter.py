import base64
import hashlib
import logging
import secrets
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


class TerminalPaymentResult:
    """Result of a terminal payment request."""

    def __init__(
        self,
        request_key: str,
        status: str,
        complete: bool = False,
        approved: bool = False,
        transaction_key: str | None = None,
        auth_code: str | None = None,
        card_last4: str | None = None,
        card_brand: str | None = None,
        error: str | None = None,
    ):
        self.request_key = request_key
        self.status = status
        self.complete = complete
        self.approved = approved
        self.transaction_key = transaction_key
        self.auth_code = auth_code
        self.card_last4 = card_last4
        self.card_brand = card_brand
        self.error = error


class UsaepayPaymentAdapter(BasePaymentAdapter):
    """USAePay payment adapter using the REST API v2 and Payment Engine for terminals."""

    SANDBOX_URL = "https://sandbox.usaepay.com/api/v2"
    PRODUCTION_URL = "https://usaepay.com/api/v2"

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.api_key = self.config.get("usaepay_api_key", "")
        self.api_pin = self.config.get("usaepay_api_pin", "")
        self.device_key = self.config.get("usaepay_device_key", "")
        environment = self.config.get("usaepay_environment", "sandbox")
        self.base_url = self.PRODUCTION_URL if environment == "production" else self.SANDBOX_URL

    def _get_auth_header(self) -> str:
        """Generate USAePay authentication header using seed + SHA256 hash."""
        seed = secrets.token_hex(10)
        prehash = f"{self.api_key}{seed}{self.api_pin}"
        hash_value = hashlib.sha256(prehash.encode()).hexdigest()
        auth_string = f"{self.api_key}:s2/{seed}/{hash_value}"
        return base64.b64encode(auth_string.encode()).decode()

    def _get_headers(self) -> dict[str, str]:
        """Get request headers with authentication."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Basic {self._get_auth_header()}",
            "User-Agent": "pool-kiosk/1.0",
        }

    def _make_request(self, endpoint: str, data: dict) -> dict:
        """Make authenticated request to USAePay API."""
        url = f"{self.base_url}/{endpoint}"
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=data, headers=self._get_headers())
            response.raise_for_status()
            return response.json()

    def test_connection(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "USAePay API key not configured"
        if not self.api_pin:
            return False, "USAePay API PIN not configured"
        try:
            # Query the transactions endpoint to verify credentials
            # Valid credentials will return 200 (possibly empty list)
            # Invalid credentials will return 401 with error details
            url = f"{self.base_url}/transactions"
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=self._get_headers())

            if response.status_code == 200:
                return True, "Connected to USAePay successfully"
            elif response.status_code == 401:
                # Parse error message from USAePay
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", "Invalid credentials")
                    error_code = error_data.get("errorcode", "")
                    if error_code == 23:
                        return False, "Invalid API Key - key not found"
                    elif error_code == 0:
                        return False, "Authentication required - check API Key and PIN"
                    return False, f"USAePay error: {error_msg}"
                except Exception:
                    return False, "Invalid USAePay API credentials"
            else:
                return False, f"USAePay returned status {response.status_code}"
        except httpx.RequestError as exc:
            return False, f"USAePay connection failed: {exc}"

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        try:
            data = {
                "command": "sale",
                "amount": str(amount),
                "description": description,
                "invoice": f"pool-{uuid.uuid4().hex[:8]}",
                "custom_fields": {
                    "member_id": member_id,
                },
            }
            result = self._make_request("transactions", data)

            # USAePay returns result_code: A (approved), D (declined), E (error)
            result_code = result.get("result_code", "E")
            if result_code == "A":
                status = PaymentStatusEnum.completed
            elif result_code == "D":
                status = PaymentStatusEnum.failed
            else:
                status = PaymentStatusEnum.pending

            transaction_key = result.get("key", f"usaepay_{uuid.uuid4().hex[:8]}")
            logger.info(
                "USAePay payment initiated: key=%s, amount=$%s, member=%s, result=%s",
                transaction_key, amount, member_id, result_code
            )

            return PaymentSession(
                session_id=transaction_key,
                status=status,
                amount=amount,
                message=result.get("result", ""),
            )
        except httpx.RequestError as exc:
            logger.exception("USAePay payment initiation failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"usaepay_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def check_status(self, session_id: str) -> PaymentStatus:
        try:
            url = f"{self.base_url}/transactions/{session_id}"
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()

            result_code = result.get("result_code", "E")
            status_map = {
                "A": PaymentStatusEnum.completed,
                "D": PaymentStatusEnum.failed,
                "E": PaymentStatusEnum.failed,
                "P": PaymentStatusEnum.pending,  # Partial approval
                "V": PaymentStatusEnum.pending,  # Verification required
            }
            ps = status_map.get(result_code, PaymentStatusEnum.pending)

            return PaymentStatus(
                session_id=session_id,
                status=ps,
                message=result.get("result", result_code),
            )
        except httpx.RequestError as exc:
            logger.exception("USAePay status check failed: session=%s", session_id)
            return PaymentStatus(
                session_id=session_id,
                status=PaymentStatusEnum.failed,
                message=str(exc),
            )

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        try:
            data = {
                "command": "refund",
                "trankey": transaction_id,
                "amount": str(amount),
            }
            result = self._make_request("transactions", data)

            result_code = result.get("result_code", "E")
            if result_code == "A":
                refund_key = result.get("key", "")
                logger.info("USAePay refund processed: key=%s, amount=$%s", refund_key, amount)
                return RefundResult(
                    success=True,
                    refund_id=refund_key,
                    message="Refund processed",
                )
            else:
                return RefundResult(
                    success=False,
                    message=result.get("error", "Refund declined"),
                )
        except httpx.RequestError as exc:
            logger.exception("USAePay refund failed: tx=%s, amount=$%s", transaction_id, amount)
            return RefundResult(success=False, message=str(exc))

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        """
        Tokenize a card for future use.

        Note: USAePay tokenization typically happens during a sale with save_card=true.
        This method creates a $0 auth to tokenize the card, then voids it.
        """
        try:
            # Create a zero-dollar authorization to get a token
            data = {
                "command": "authonly",
                "amount": "0.00",
                "save_card": True,
                "description": f"Card tokenization for member {member_id}",
                "custom_fields": {
                    "member_id": member_id,
                    "card_last4": card_last4,
                },
            }
            result = self._make_request("transactions", data)

            if result.get("result_code") != "A":
                raise RuntimeError(f"Tokenization failed: {result.get('error', 'Unknown error')}")

            # The savedcard key is the token
            token = result.get("savedcard", {}).get("key", "")
            if not token:
                # Fall back to creditcard.token if savedcard not present
                token = result.get("creditcard", {}).get("token", "")

            if not token:
                raise RuntimeError("No token returned from USAePay")

            logger.info("USAePay card tokenized: member=%s, token=%s...", member_id, token[:8])
            return token

        except httpx.RequestError as exc:
            logger.exception("USAePay tokenization failed: member=%s", member_id)
            raise RuntimeError(f"USAePay tokenization failed: {exc}")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        try:
            data = {
                "command": "sale",
                "amount": str(amount),
                "description": description,
                "creditcard": {
                    "number": token,  # Token goes in number field
                },
                "custom_fields": {
                    "member_id": member_id,
                },
            }
            result = self._make_request("transactions", data)

            result_code = result.get("result_code", "E")
            transaction_key = result.get("key", "")

            if result_code == "A":
                logger.info(
                    "USAePay saved card charged: key=%s, amount=$%s, member=%s",
                    transaction_key, amount, member_id
                )
                return SavedCardChargeResult(
                    success=True,
                    reference_id=transaction_key,
                    message="Payment successful",
                )
            else:
                return SavedCardChargeResult(
                    success=False,
                    message=result.get("error", "Payment declined"),
                )
        except httpx.RequestError as exc:
            logger.exception("USAePay saved card charge failed: member=%s, amount=$%s", member_id, amount)
            return SavedCardChargeResult(success=False, message=str(exc))

    # ==================== TERMINAL PAYMENT METHODS ====================

    def has_terminal(self) -> bool:
        """Check if a terminal device is configured."""
        return bool(self.device_key)

    def initiate_terminal_payment(
        self,
        amount: Decimal,
        member_id: str,
        description: str,
        timeout: int = 120,
        save_card: bool = False,
        prompt_tip: bool = False,
    ) -> TerminalPaymentResult:
        """
        Initiate a payment on the physical terminal (Castles MP200).

        The terminal will prompt the customer to tap/insert their card.
        Use check_terminal_payment_status() to poll for the result.
        """
        if not self.device_key:
            return TerminalPaymentResult(
                request_key="",
                status="error",
                error="No terminal device configured",
            )

        try:
            data = {
                "devicekey": self.device_key,
                "command": "sale",
                "amount": str(amount),
                "timeout": timeout,
                "save_card": save_card,
                "prompt_tip": prompt_tip,
                "invoice": f"pool-{uuid.uuid4().hex[:8]}",
                "description": description,
            }

            result = self._make_request("paymentengine/payrequests", data)

            request_key = result.get("key", "")
            status = result.get("status", "unknown")

            logger.info(
                "USAePay terminal payment initiated: request_key=%s, amount=$%s, member=%s, status=%s",
                request_key, amount, member_id, status
            )

            return TerminalPaymentResult(
                request_key=request_key,
                status=status,
            )

        except httpx.HTTPStatusError as exc:
            error_msg = "Terminal payment request failed"
            try:
                error_data = exc.response.json()
                error_msg = error_data.get("error", error_msg)
            except Exception:
                pass
            logger.exception("USAePay terminal payment failed: member=%s, amount=$%s", member_id, amount)
            return TerminalPaymentResult(
                request_key="",
                status="error",
                error=error_msg,
            )
        except httpx.RequestError as exc:
            logger.exception("USAePay terminal payment failed: member=%s, amount=$%s", member_id, amount)
            return TerminalPaymentResult(
                request_key="",
                status="error",
                error=str(exc),
            )

    def check_terminal_payment_status(self, request_key: str) -> TerminalPaymentResult:
        """
        Check the status of a terminal payment request.

        Poll this endpoint until 'complete' is True or the timeout expires.
        """
        try:
            url = f"{self.base_url}/paymentengine/payrequests/{request_key}"
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=self._get_headers())
                response.raise_for_status()
                result = response.json()

            status = result.get("status", "unknown")
            complete = result.get("complete", False)

            # Extract transaction details if complete
            transaction = result.get("transaction", {})
            approved = transaction.get("result_code") == "A" if transaction else False
            transaction_key = transaction.get("key", "") if transaction else None
            auth_code = transaction.get("authcode", "") if transaction else None

            # Extract card info
            card_info = transaction.get("creditcard", {}) if transaction else {}
            card_last4 = card_info.get("number", "")[-4:] if card_info.get("number") else None
            card_brand = card_info.get("type", None)

            # Check for errors
            error = result.get("error") or (transaction.get("error") if transaction else None)

            logger.debug(
                "USAePay terminal status: request_key=%s, status=%s, complete=%s, approved=%s",
                request_key, status, complete, approved
            )

            return TerminalPaymentResult(
                request_key=request_key,
                status=status,
                complete=complete,
                approved=approved,
                transaction_key=transaction_key,
                auth_code=auth_code,
                card_last4=card_last4,
                card_brand=card_brand,
                error=error,
            )

        except httpx.RequestError as exc:
            logger.exception("USAePay terminal status check failed: request_key=%s", request_key)
            return TerminalPaymentResult(
                request_key=request_key,
                status="error",
                error=str(exc),
            )

    def cancel_terminal_payment(self, request_key: str) -> bool:
        """Cancel a pending terminal payment request."""
        try:
            url = f"{self.base_url}/paymentengine/payrequests/{request_key}"
            with httpx.Client(timeout=10.0) as client:
                response = client.delete(url, headers=self._get_headers())
                response.raise_for_status()

            logger.info("USAePay terminal payment cancelled: request_key=%s", request_key)
            return True

        except httpx.RequestError as exc:
            logger.exception("USAePay terminal cancel failed: request_key=%s", request_key)
            return False

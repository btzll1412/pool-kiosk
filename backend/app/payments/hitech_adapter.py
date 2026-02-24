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

    def _mask_sensitive(self, params: dict[str, str]) -> dict[str, str]:
        """Mask sensitive fields for logging."""
        masked = dict(params)
        sensitive_keys = ["ssl_pin", "ssl_card_number", "ssl_cvv2cvc2", "ssl_token"]
        for key in sensitive_keys:
            if key in masked and masked[key]:
                masked[key] = "****" + masked[key][-4:] if len(masked[key]) > 4 else "****"
        return masked

    def _post_request(self, params: dict[str, str]) -> dict[str, str]:
        """Send form-encoded POST to Converge and parse response."""
        all_params = {**self._base_params(), **params}
        txn_type = params.get("ssl_transaction_type", "unknown")

        # Log request (masked)
        logger.info(
            "[HITECH REQUEST] type=%s, url=%s, params=%s",
            txn_type, self._base_url, self._mask_sensitive(all_params)
        )

        try:
            resp = httpx.post(
                self._base_url,
                data=all_params,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30.0,
            )

            # Log raw response
            logger.debug("[HITECH RAW RESPONSE] status=%d, body=%s", resp.status_code, resp.text[:500])

            resp.raise_for_status()

            response_text = resp.text.strip()

            # Check if response is HTML (error page) instead of key=value pairs
            if "<html" in response_text.lower() or "<!doctype" in response_text.lower():
                logger.error("[HITECH ERROR] API returned HTML page instead of data - likely invalid credentials")
                # Try to extract error message from HTML
                error_detail = "API returned HTML error page"
                if "invalid" in response_text.lower():
                    error_detail = "Invalid credentials - check Merchant ID, User ID, and PIN"
                elif "merchant" in response_text.lower() and "not found" in response_text.lower():
                    error_detail = "Merchant ID not found - must be numeric Converge account ID (not business name)"
                elif "user" in response_text.lower() and "not found" in response_text.lower():
                    error_detail = "User ID not found or does not have API access"
                elif "pin" in response_text.lower():
                    error_detail = "Invalid PIN - must be 64-character terminal identifier"
                return {"ssl_result": "1", "ssl_result_message": error_detail, "_html_error": "true"}

            # Converge returns key=value pairs, one per line
            result = {}
            for line in response_text.split("\n"):
                if "=" in line:
                    key, value = line.split("=", 1)
                    result[key.strip()] = value.strip()

            # Check if we got any valid response data
            if not result:
                logger.error("[HITECH ERROR] Empty or unparseable response")
                return {"ssl_result": "1", "ssl_result_message": "Empty response from API - check credentials"}

            # Log parsed response
            ssl_result = result.get("ssl_result", "?")
            ssl_result_msg = result.get("ssl_result_message", "")
            ssl_txn_id = result.get("ssl_txn_id", "")
            logger.info(
                "[HITECH RESPONSE] type=%s, result=%s, message=%s, txn_id=%s",
                txn_type, ssl_result, ssl_result_msg, ssl_txn_id
            )

            return result

        except httpx.TimeoutException as exc:
            logger.error("[HITECH TIMEOUT] type=%s, error=%s", txn_type, exc)
            raise
        except httpx.HTTPStatusError as exc:
            logger.error("[HITECH HTTP ERROR] type=%s, status=%d, error=%s", txn_type, exc.response.status_code, exc)
            raise
        except Exception as exc:
            logger.error("[HITECH ERROR] type=%s, error=%s", txn_type, exc)
            raise

    def test_connection(self) -> tuple[bool, str]:
        logger.info("[HITECH] Testing connection to %s (env=%s)", self._base_url, self.config.get("hitech_environment", "sandbox"))

        # Validate credentials are provided
        missing = []
        if not self._merchant_id:
            missing.append("Merchant ID")
        if not self._user_id:
            missing.append("User ID")
        if not self._pin:
            missing.append("PIN")

        if missing:
            msg = f"Missing credentials: {', '.join(missing)}"
            logger.warning("[HITECH] Connection test failed: %s", msg)
            return False, msg

        # Validate credential formats
        warnings = []
        if not self._merchant_id.isdigit():
            warnings.append(f"Merchant ID '{self._merchant_id}' should be numeric (Converge account ID, not business name)")
        if len(self._pin) < 32:
            warnings.append(f"PIN appears too short ({len(self._pin)} chars) - should be 64-character terminal identifier")

        if warnings:
            msg = "Credential format issues: " + "; ".join(warnings)
            logger.warning("[HITECH] %s", msg)
            return False, msg

        try:
            # Use ccverify with minimal data to test credentials
            result = self._post_request({
                "ssl_transaction_type": "ccverify",
                "ssl_card_number": "4000000000000002",
                "ssl_exp_date": "1225",
            })

            # Check for HTML error response
            if result.get("_html_error"):
                error_msg = result.get("ssl_result_message", "Invalid credentials")
                logger.warning("[HITECH] Connection test failed (HTML error): %s", error_msg)
                return False, error_msg

            if result.get("ssl_result") == "0":
                logger.info("[HITECH] Connection test successful")
                return True, "Connected to HiTech Merchants successfully"

            # Parse specific error codes
            error_code = result.get("errorCode", "")
            error_msg = result.get("ssl_result_message", "")
            error_name = result.get("errorName", "")

            if error_code == "5000":
                detailed_msg = "Authentication failed - verify Merchant ID, User ID, and PIN are correct"
            elif error_code == "5001":
                detailed_msg = "User ID not found or does not have API access enabled"
            elif error_code == "5002":
                detailed_msg = "Invalid PIN - must be the 64-character terminal identifier from Converge"
            elif "merchant" in error_msg.lower():
                detailed_msg = f"Merchant error: {error_msg}"
            elif error_name:
                detailed_msg = f"{error_name}: {error_msg}"
            elif error_msg:
                detailed_msg = error_msg
            else:
                detailed_msg = f"Connection failed (code: {result.get('ssl_result', 'unknown')})"

            logger.warning("[HITECH] Connection test failed: %s", detailed_msg)
            return False, detailed_msg

        except httpx.TimeoutException:
            msg = "Connection timed out - check network connectivity to Converge API"
            logger.error("[HITECH] %s", msg)
            return False, msg
        except httpx.RequestError as exc:
            msg = f"Network error: {exc}"
            logger.error("[HITECH] Connection test error: %s", exc)
            return False, msg
        except Exception as exc:
            msg = f"Unexpected error: {exc}"
            logger.exception("[HITECH] Connection test unexpected error")
            return False, msg

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

    def get_hosted_payment_session(self, amount: Decimal | None = None) -> dict:
        """
        Get session parameters for Converge hosted payment page / lightbox.
        Returns the merchant credentials needed for PayWithConverge.js
        """
        env = self.config.get("hitech_environment", "sandbox")

        # Converge lightbox URLs
        lightbox_urls = {
            "sandbox": "https://api.demo.convergepay.com/hosted-payments/PayWithConverge.js",
            "production": "https://api.convergepay.com/hosted-payments/PayWithConverge.js",
        }

        return {
            "merchant_id": self._merchant_id,
            "user_id": self._user_id,
            "pin": self._pin,  # Note: In production, use a session token instead
            "environment": env,
            "lightbox_url": lightbox_urls.get(env, lightbox_urls["sandbox"]),
        }

    def tokenize_from_track_data(self, track_data: str, member_id: str) -> tuple[str, str, str]:
        """
        Parse magnetic stripe track data and generate a token.
        Supports Track 1 (%B...) and Track 2 (;...) formats.
        Returns (token, last4, card_brand).
        """
        card_number = None
        exp_date = None

        # Track 1 format: %B[card_number]^[name]^[YYMM]...?
        if "%B" in track_data:
            try:
                # Extract between %B and ^
                start = track_data.index("%B") + 2
                end = track_data.index("^", start)
                card_number = track_data[start:end]

                # Find expiry after second ^
                second_caret = track_data.index("^", end + 1)
                exp_date = track_data[second_caret + 1:second_caret + 5]  # YYMM format
                # Convert YYMM to MMYY for Converge
                exp_date = exp_date[2:4] + exp_date[0:2]
            except (ValueError, IndexError) as e:
                logger.error("Failed to parse Track 1 data: %s", e)

        # Track 2 format: ;[card_number]=[YYMM]...?
        if not card_number and ";" in track_data:
            try:
                start = track_data.index(";") + 1
                end = track_data.index("=", start)
                card_number = track_data[start:end]

                exp_date = track_data[end + 1:end + 5]  # YYMM format
                # Convert YYMM to MMYY for Converge
                exp_date = exp_date[2:4] + exp_date[0:2]
            except (ValueError, IndexError) as e:
                logger.error("Failed to parse Track 2 data: %s", e)

        if not card_number or not exp_date:
            raise ValueError("Could not parse card data from track data")

        # Clean card number (remove any non-digits)
        card_number = ''.join(filter(str.isdigit, card_number))

        logger.info(
            "Parsed track data: last4=%s, exp=%s, member=%s",
            card_number[-4:], exp_date, member_id
        )

        # Tokenize using the existing method
        return self.generate_card_token(card_number, exp_date, member_id)

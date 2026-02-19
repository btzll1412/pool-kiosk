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

# Sola API base URLs by environment
SOLA_BASE_URLS = {
    "sandbox": "https://sandbox-api.solapay.com/v1",
    "production": "https://api.solapay.com/v1",
}


class SolaPaymentAdapter(BasePaymentAdapter):
    """Sola payment adapter using REST API via httpx."""

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        env = self.config.get("sola_environment", "sandbox")
        self._base_url = SOLA_BASE_URLS.get(env, SOLA_BASE_URLS["sandbox"])
        self._api_key = self.config.get("sola_api_key", "")
        self._api_secret = self.config.get("sola_api_secret", "")
        self._merchant_id = self.config.get("sola_merchant_id", "")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "X-Api-Secret": self._api_secret,
            "X-Merchant-Id": self._merchant_id,
            "Content-Type": "application/json",
        }

    def test_connection(self) -> tuple[bool, str]:
        if not self._api_key:
            return False, "Sola API key not configured"
        try:
            resp = httpx.get(f"{self._base_url}/merchant/info", headers=self._headers(), timeout=10.0)
            if resp.status_code == 200:
                return True, "Connected to Sola successfully"
            return False, f"Sola API returned status {resp.status_code}: {resp.text[:200]}"
        except httpx.RequestError as exc:
            return False, f"Sola connection failed: {exc}"

    def initiate_payment(self, amount: Decimal, member_id: str, description: str) -> PaymentSession:
        amount_cents = int(amount * 100)
        idempotency_key = uuid.uuid4().hex
        try:
            resp = httpx.post(
                f"{self._base_url}/payments",
                headers=self._headers(),
                json={
                    "idempotency_key": idempotency_key,
                    "amount": amount_cents,
                    "currency": "USD",
                    "description": description,
                    "metadata": {"member_id": member_id},
                },
                timeout=15.0,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                payment_id = data.get("id", idempotency_key)
                logger.info("Sola payment created: id=%s, amount=$%s, member=%s", payment_id, amount, member_id)
                return PaymentSession(
                    session_id=payment_id,
                    status=PaymentStatusEnum.completed,
                    amount=amount,
                    message="Payment completed",
                )
            error_msg = resp.text[:200]
            logger.warning("Sola payment failed: status=%d, body=%s", resp.status_code, error_msg)
            return PaymentSession(
                session_id=f"sola_err_{idempotency_key[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=error_msg,
            )
        except Exception as exc:
            logger.exception("Sola payment initiation failed: member=%s, amount=$%s", member_id, amount)
            return PaymentSession(
                session_id=f"sola_err_{uuid.uuid4().hex[:8]}",
                status=PaymentStatusEnum.failed,
                amount=amount,
                message=str(exc),
            )

    def check_status(self, session_id: str) -> PaymentStatus:
        try:
            resp = httpx.get(
                f"{self._base_url}/payments/{session_id}",
                headers=self._headers(),
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                sola_status = data.get("status", "unknown")
                status_map = {
                    "completed": PaymentStatusEnum.completed,
                    "pending": PaymentStatusEnum.pending,
                    "failed": PaymentStatusEnum.failed,
                    "refunded": PaymentStatusEnum.refunded,
                }
                return PaymentStatus(
                    session_id=session_id,
                    status=status_map.get(sola_status, PaymentStatusEnum.pending),
                    message=sola_status,
                )
            return PaymentStatus(session_id=session_id, status=PaymentStatusEnum.failed, message=resp.text[:200])
        except Exception as exc:
            logger.exception("Sola status check failed: session=%s", session_id)
            return PaymentStatus(session_id=session_id, status=PaymentStatusEnum.failed, message=str(exc))

    def refund(self, transaction_id: str, amount: Decimal) -> RefundResult:
        amount_cents = int(amount * 100)
        try:
            resp = httpx.post(
                f"{self._base_url}/refunds",
                headers=self._headers(),
                json={
                    "payment_id": transaction_id,
                    "amount": amount_cents,
                    "idempotency_key": uuid.uuid4().hex,
                },
                timeout=15.0,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                refund_id = data.get("id", "")
                logger.info("Sola refund created: id=%s, amount=$%s", refund_id, amount)
                return RefundResult(success=True, refund_id=refund_id, message="Refund processed")
            return RefundResult(success=False, message=resp.text[:200])
        except Exception as exc:
            logger.exception("Sola refund failed: tx=%s, amount=$%s", transaction_id, amount)
            return RefundResult(success=False, message=str(exc))

    def tokenize_card(self, card_last4: str, card_brand: str, member_id: str) -> str:
        try:
            resp = httpx.post(
                f"{self._base_url}/customers",
                headers=self._headers(),
                json={
                    "reference_id": member_id,
                    "card_last4": card_last4,
                    "card_brand": card_brand,
                },
                timeout=10.0,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                customer_id = data.get("id", "")
                logger.info("Sola customer created: id=%s, member=%s", customer_id, member_id)
                return customer_id
            raise RuntimeError(f"Sola tokenization failed: {resp.text[:200]}")
        except httpx.RequestError as exc:
            logger.exception("Sola tokenization failed: member=%s", member_id)
            raise RuntimeError(f"Sola tokenization failed: {exc}")

    def charge_saved_card(
        self, token: str, amount: Decimal, member_id: str, description: str
    ) -> SavedCardChargeResult:
        amount_cents = int(amount * 100)
        try:
            resp = httpx.post(
                f"{self._base_url}/payments",
                headers=self._headers(),
                json={
                    "idempotency_key": uuid.uuid4().hex,
                    "amount": amount_cents,
                    "currency": "USD",
                    "customer_id": token,
                    "description": description,
                    "metadata": {"member_id": member_id},
                },
                timeout=15.0,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                payment_id = data.get("id", "")
                logger.info("Sola saved card charged: id=%s, amount=$%s, member=%s", payment_id, amount, member_id)
                return SavedCardChargeResult(success=True, reference_id=payment_id, message="Charge completed")
            error_msg = resp.text[:200]
            logger.warning("Sola saved card charge failed: %s", error_msg)
            return SavedCardChargeResult(success=False, message=error_msg)
        except Exception as exc:
            logger.exception("Sola saved card charge failed: member=%s, amount=$%s", member_id, amount)
            return SavedCardChargeResult(success=False, message=str(exc))

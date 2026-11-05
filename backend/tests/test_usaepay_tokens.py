"""USAePay saved-card token handling (2026-11-05 fix).

Typed-in cards used to be stored via the /customers API, whose payment-method key cannot be
charged through creditcard.number ("card number must be between 13 and 16 digits").
"""
from decimal import Decimal

import httpx
import pytest

from app.payments.usaepay_adapter import UsaepayPaymentAdapter


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload, self.status_code = payload, status_code
        self.request = httpx.Request("POST", "https://usaepay.test")

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=self.request, response=self)


class FakeClient:
    """Stands in for httpx.Client; records calls, returns canned payloads."""
    calls: list = []
    payloads: list = []

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, json=None, headers=None):
        FakeClient.calls.append(("POST", url, json))
        return FakeClient.payloads.pop(0)

    def get(self, url, headers=None):
        FakeClient.calls.append(("GET", url, None))
        return FakeClient.payloads.pop(0)


@pytest.fixture()
def adapter(monkeypatch):
    monkeypatch.setattr("app.payments.usaepay_adapter.httpx.Client", FakeClient)
    FakeClient.calls, FakeClient.payloads = [], []
    return UsaepayPaymentAdapter({"usaepay_api_key": "k", "usaepay_api_pin": "p", "usaepay_environment": "sandbox"})


def test_is_payment_method_key():
    assert UsaepayPaymentAdapter.is_payment_method_key("dn02p95bn2f9bj7y8")
    assert not UsaepayPaymentAdapter.is_payment_method_key("tqb9-o076-tpfk-lb8l")
    assert not UsaepayPaymentAdapter.is_payment_method_key("")
    assert not UsaepayPaymentAdapter.is_payment_method_key(None)


def test_generate_card_token_uses_cc_save_and_returns_card_token(adapter):
    FakeClient.payloads = [FakeResponse({"savedcard": {"type": "Visa", "key": "tqb9-o076-tpfk-lb8l", "cardnumber": "4000xxxxxxxx2224"}})]
    token, last4, brand = adapter.generate_card_token("4000100011112224", "12/30", "member-1", cvv="123")
    assert (token, last4, brand) == ("tqb9-o076-tpfk-lb8l", "2224", "Visa")
    method, url, body = FakeClient.calls[0]
    assert method == "POST" and url.endswith("/transactions")
    assert body["command"] == "cc:save"
    assert body["creditcard"] == {"number": "4000100011112224", "expiration": "1230", "cvc": "123"}
    assert not UsaepayPaymentAdapter.is_payment_method_key(token)


def test_generate_card_token_surfaces_processor_error(adapter):
    FakeClient.payloads = [FakeResponse({"result_code": "E", "error": "Invalid Card Number (3)"})]
    with pytest.raises(RuntimeError, match="Invalid Card Number"):
        adapter.generate_card_token("4000100011112224", "1230", "member-1", cvv="123")


def test_charge_refuses_payment_method_key_without_calling_processor(adapter):
    result = adapter.charge_saved_card("dn02p95bn2f9bj7y8", Decimal("25.00"), "member-1", "Misc")
    assert result.success is False
    assert "old format" in result.message
    assert FakeClient.calls == []


def test_charge_with_card_token_sends_it_as_number(adapter):
    FakeClient.payloads = [FakeResponse({"result_code": "A", "key": "txn123"})]
    result = adapter.charge_saved_card("tqb9-o076-tpfk-lb8l", Decimal("25.00"), "member-1", "Misc", customer_name="Suri K")
    assert result.success and result.reference_id == "txn123"
    _, _, body = FakeClient.calls[0]
    assert body["creditcard"]["number"] == "tqb9-o076-tpfk-lb8l" and body["amount"] == "25.00"


def test_charge_decline_returns_processor_message(adapter):
    FakeClient.payloads = [FakeResponse({"result_code": "D", "error": "Card Declined (00)", "key": "t1"})]
    result = adapter.charge_saved_card("tqb9-o076-tpfk-lb8l", Decimal("25.00"), "member-1", "Misc")
    assert result.success is False and result.message == "Card Declined (00)"


def test_customer_token_roundtrip():
    tok = UsaepayPaymentAdapter.make_customer_token("5brbvgv352yr4nmb", "dn02p95bn2f9bj7y8")
    assert tok == "cust:5brbvgv352yr4nmb:dn02p95bn2f9bj7y8"
    assert UsaepayPaymentAdapter.parse_customer_token(tok) == ("5brbvgv352yr4nmb", "dn02p95bn2f9bj7y8")
    assert UsaepayPaymentAdapter.parse_customer_token("tqb9-o076-tpfk-lb8l") is None
    assert UsaepayPaymentAdapter.parse_customer_token("cust:broken") is None
    assert not UsaepayPaymentAdapter.is_payment_method_key(tok)


def test_charge_customer_token_runs_customer_sale(adapter):
    FakeClient.payloads = [FakeResponse({"result_code": "A", "key": "txn777"})]
    tok = UsaepayPaymentAdapter.make_customer_token("5brbvgv352yr4nmb", "dn02p95bn2f9bj7y8")
    result = adapter.charge_saved_card(tok, Decimal("25.00"), "member-1", "Misc charge", customer_name="Suri K")
    assert result.success and result.reference_id == "txn777"
    method, url, body = FakeClient.calls[0]
    assert method == "POST" and url.endswith("/transactions")
    assert body["command"] == "customer:sale"
    assert body["custkey"] == "5brbvgv352yr4nmb" and body["paymethod_key"] == "dn02p95bn2f9bj7y8"
    assert body["amount"] == "25.00" and "creditcard" not in body
    assert body["billing"] == {"name": "Suri K"}

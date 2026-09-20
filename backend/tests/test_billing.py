"""Tests for billing period and proration math."""

from datetime import date
from decimal import Decimal

import pytest

from app.services.billing_service import BillingMode, add_months, next_billing_boundary, quote_membership

D = Decimal


def q(price, months, start, mode, billing_day=None):
    return quote_membership(D(price), months, start, BillingMode(mode), billing_day)


def test_quarterly_prorated_mid_month_matches_owner_example():
    """$360 quarterly on Sep 15 -> one charge of $304, covers through Nov 30, next charge Dec 1."""
    quote = q("360", 3, date(2026, 9, 15), "prorate")
    assert quote.amount == D("304.00")
    assert (quote.partial_days, quote.cycle_days, quote.full_months) == (16, 30, 2)
    assert quote.valid_until == date(2026, 11, 30)
    assert quote.next_billing_date == date(2026, 12, 1)
    assert quote.billing_day == 1 and quote.prorated


def test_monthly_prorated_mid_month():
    quote = q("145", 1, date(2026, 9, 15), "prorate")
    assert quote.amount == D("77.33")
    assert quote.valid_until == date(2026, 9, 30)
    assert quote.next_billing_date == date(2026, 10, 1)


def test_senior_monthly_prorated():
    assert q("135", 1, date(2026, 9, 15), "prorate").amount == D("72.00")


def test_prorate_on_the_billing_day_is_full_price():
    quote = q("145", 1, date(2026, 10, 1), "prorate")
    assert quote.amount == D("145.00") and not quote.prorated
    assert quote.valid_until == date(2026, 10, 31)
    assert quote.next_billing_date == date(2026, 11, 1)


def test_custom_billing_day():
    """Billing day 15, joins Sep 20 -> prorate Sep 20..Oct 14, full charge Oct 15."""
    quote = q("145", 1, date(2026, 9, 20), "prorate", billing_day=15)
    assert (quote.partial_days, quote.cycle_days) == (25, 30)
    assert quote.amount == D("120.83")
    assert quote.valid_until == date(2026, 10, 14)
    assert quote.next_billing_date == date(2026, 10, 15)

    before = q("145", 1, date(2026, 9, 10), "prorate", billing_day=15)
    assert before.next_billing_date == date(2026, 9, 15)
    assert before.partial_days == 5 and before.cycle_days == 31  # Aug 15 -> Sep 15


def test_full_price_follows_the_start_date():
    quote = q("145", 1, date(2026, 9, 15), "full")
    assert quote.amount == D("145.00")
    assert quote.valid_until == date(2026, 10, 14)
    assert quote.next_billing_date == date(2026, 10, 15)
    assert quote.billing_day == 15

    quarterly = q("360", 3, date(2026, 9, 15), "full")
    assert quarterly.valid_until == date(2026, 12, 14)
    assert quarterly.next_billing_date == date(2026, 12, 15)


def test_end_of_month_starts_are_clamped_to_28():
    quote = q("145", 1, date(2026, 1, 31), "full")
    assert quote.billing_day == 28
    assert quote.next_billing_date == date(2026, 2, 28)
    assert quote.valid_until == date(2026, 2, 27)


def test_year_rollover():
    quote = q("360", 3, date(2026, 11, 20), "prorate")
    assert quote.next_billing_date == date(2027, 2, 1)
    assert quote.valid_until == date(2027, 1, 31)
    assert quote.amount == (D("120") * 11 / 30 + 240).quantize(D("0.01"))


def test_february_proration_uses_actual_month_length():
    quote = q("140", 1, date(2027, 2, 15), "prorate")
    assert (quote.partial_days, quote.cycle_days) == (14, 28)
    assert quote.amount == D("70.00")


@pytest.mark.parametrize("start", [date(2026, 9, d) for d in range(1, 31)])
def test_prorated_never_exceeds_full_price_and_never_leaves_gaps(start):
    quote = q("145", 1, start, "prorate")
    assert D("0") < quote.amount <= D("145.00")
    assert quote.next_billing_date.day == 1
    assert (quote.next_billing_date - quote.valid_until).days == 1
    assert quote.valid_until >= start


def test_helpers():
    assert add_months(date(2026, 12, 1), 1, 1) == date(2027, 1, 1)
    assert add_months(date(2026, 3, 15), -1, 31) == date(2026, 2, 28)
    assert next_billing_boundary(date(2026, 9, 1), 1) == date(2026, 10, 1)
    assert next_billing_boundary(date(2026, 9, 30), 1) == date(2026, 10, 1)

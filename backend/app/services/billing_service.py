"""
Billing periods and proration for monthly-type plans (monthly, quarterly, ...).

One place decides what a membership costs and which dates it covers, so the
kiosk, the admin panel and auto-charge can never disagree.

Two billing modes:

* ``full``    — pay the full plan price; the period runs N months from the start
                date and the billing day becomes the start date's day of month.
* ``prorate`` — align to a billing day (default: the 1st). The partial first
                month is charged by the day, the remaining months of the plan in
                full, all in a single charge. Example: $360 quarterly starting
                Sep 15 with billing day 1 → 16/30 × $120 + $240 = $304, covering
                Sep 15 – Nov 30, next charge Dec 1.

``valid_until`` is always the last valid day: the day before ``next_billing_date``.
"""
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum

DEFAULT_BILLING_DAY = 1
MAX_BILLING_DAY = 28  # keeps the billing day valid in every month
_CENT = Decimal("0.01")


class BillingMode(str, Enum):
    full = "full"
    prorate = "prorate"


@dataclass(frozen=True)
class BillingQuote:
    mode: BillingMode
    start_date: date
    valid_until: date
    next_billing_date: date
    billing_day: int
    amount: Decimal
    full_price: Decimal
    prorated: bool
    partial_days: int   # days charged in the partial first month (0 if not prorated)
    cycle_days: int     # length of the billing month the partial days fall in
    full_months: int    # months charged at the full monthly rate


def clamp_billing_day(day: int | None) -> int:
    if not day or day < 1:
        return DEFAULT_BILLING_DAY
    return min(day, MAX_BILLING_DAY)


def _on_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, monthrange(year, month)[1]))


def add_months(anchor: date, months: int, day: int) -> date:
    """The date ``months`` after ``anchor``'s month, on day-of-month ``day``."""
    index = anchor.year * 12 + (anchor.month - 1) + months
    return _on_day(index // 12, index % 12 + 1, day)


def next_billing_boundary(start: date, billing_day: int) -> date:
    """First date strictly after ``start`` that falls on the billing day."""
    this_month = _on_day(start.year, start.month, billing_day)
    return this_month if this_month > start else add_months(start, 1, billing_day)


def quote_membership(
    price: Decimal,
    duration_months: int | None,
    start_date: date,
    mode: BillingMode = BillingMode.full,
    billing_day: int | None = None,
) -> BillingQuote:
    """Price and dates for a membership starting on ``start_date``."""
    months = duration_months if duration_months and duration_months > 0 else 1
    price = Decimal(price)

    if mode == BillingMode.prorate:
        day = clamp_billing_day(billing_day)
        if start_date.day != day:
            boundary = next_billing_boundary(start_date, day)
            cycle_start = add_months(boundary, -1, day)
            partial_days = (boundary - start_date).days
            cycle_days = (boundary - cycle_start).days
            monthly_rate = price / Decimal(months)
            amount = (
                monthly_rate * Decimal(partial_days) / Decimal(cycle_days)
                + monthly_rate * Decimal(months - 1)
            ).quantize(_CENT, rounding=ROUND_HALF_UP)
            next_billing = add_months(boundary, months - 1, day)
            return BillingQuote(
                mode=mode, start_date=start_date,
                valid_until=next_billing - timedelta(days=1), next_billing_date=next_billing,
                billing_day=day, amount=amount, full_price=price, prorated=True,
                partial_days=partial_days, cycle_days=cycle_days, full_months=months - 1,
            )
        # Starting exactly on the billing day — nothing to prorate
    else:
        day = clamp_billing_day(start_date.day)

    next_billing = add_months(start_date, months, day)
    return BillingQuote(
        mode=mode, start_date=start_date,
        valid_until=next_billing - timedelta(days=1), next_billing_date=next_billing,
        billing_day=day, amount=price.quantize(_CENT, rounding=ROUND_HALF_UP), full_price=price,
        prorated=False, partial_days=0, cycle_days=0, full_months=months,
    )


def quote_to_dict(quote: BillingQuote) -> dict:
    """JSON-friendly representation for API responses."""
    return {
        "mode": quote.mode.value,
        "start_date": quote.start_date.isoformat(),
        "valid_until": quote.valid_until.isoformat(),
        "next_billing_date": quote.next_billing_date.isoformat(),
        "billing_day": quote.billing_day,
        "amount": str(quote.amount),
        "full_price": str(quote.full_price),
        "prorated": quote.prorated,
        "partial_days": quote.partial_days,
        "cycle_days": quote.cycle_days,
        "full_months": quote.full_months,
    }

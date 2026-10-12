"""
Item plans: one-time sales of things that are not memberships (snacks, towels,
lessons, ...). They sit next to the real plans at the kiosk and in the admin panel
and are paid the same way, but a sale creates nothing — only a transaction that
says what it was for.

Two kinds:
* fixed price   — the plan price (member price overrides apply as for any plan)
* open amount   — the buyer types the amount, within the plan's min/max if set

Every item sale needs a description ("what is this charge for?").
"""
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status

from app.models.plan import Plan, PlanType

DESCRIPTION_MAX_LEN = 200
_CENT = Decimal("0.01")


def is_item_plan(plan: Plan | None) -> bool:
    return plan is not None and plan.plan_type == PlanType.item


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def clean_description(description: str | None) -> str:
    text = (description or "").strip()
    if not text:
        raise _bad_request("Please enter what this charge is for")
    if len(text) > DESCRIPTION_MAX_LEN:
        raise _bad_request(f"Description must be {DESCRIPTION_MAX_LEN} characters or less")
    return text


def resolve_item_amount(plan: Plan, amount: Decimal | str | None, list_price: Decimal | None = None) -> Decimal:
    """The amount due for an item sale.

    ``list_price`` is the fixed price to use (member price override already applied);
    defaults to the plan price. Open-amount plans require ``amount`` within min/max.
    """
    if not plan.open_amount:
        return Decimal(list_price if list_price is not None else plan.price).quantize(_CENT)

    if amount is None or amount == "":
        raise _bad_request("Please enter an amount")
    try:
        value = Decimal(str(amount)).quantize(_CENT)
    except (InvalidOperation, ValueError):
        raise _bad_request("Please enter a valid amount")
    if value <= 0:
        raise _bad_request("Amount must be more than zero")
    if plan.min_amount is not None and value < plan.min_amount:
        raise _bad_request(f"The minimum for {plan.name} is ${plan.min_amount:.2f}")
    if plan.max_amount is not None and value > plan.max_amount:
        raise _bad_request(f"The maximum for {plan.name} is ${plan.max_amount:.2f}")
    return value


def validate_item_plan_fields(
    plan_type: PlanType,
    open_amount: bool,
    min_amount: Decimal | None,
    max_amount: Decimal | None,
    price: Decimal | None,
) -> None:
    """Rules an admin must follow when saving a plan (raises 400 on a bad combination)."""
    if plan_type != PlanType.item:
        if open_amount or min_amount is not None or max_amount is not None:
            raise _bad_request("Only item plans can have an open amount or min/max limits")
        return
    if open_amount:
        if min_amount is not None and min_amount < 0:
            raise _bad_request("Minimum amount cannot be negative")
        if max_amount is not None and max_amount <= 0:
            raise _bad_request("Maximum amount must be more than zero")
        if min_amount is not None and max_amount is not None and min_amount > max_amount:
            raise _bad_request("Minimum amount cannot be more than the maximum")
    else:
        if min_amount is not None or max_amount is not None:
            raise _bad_request("Min/max limits only apply to open-amount items")
        if price is None or price <= 0:
            raise _bad_request("A fixed-price item needs a price above zero")


def sale_note(description: str | None, base: str | None = None) -> str | None:
    """Transaction note for a sale: the item description first, then any payment detail."""
    if not description:
        return base
    return f"{description} — {base}" if base else description

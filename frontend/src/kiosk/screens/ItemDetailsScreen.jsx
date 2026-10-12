import { useState } from "react";
import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { itemBilling } from "../utils/billing";

export const ITEM_DESCRIPTION_MAX = 200;

/** Validate an item purchase the way the server will. Returns an error message or null. */
export function validateItemDetails(plan, description, amount) {
  if (!description.trim()) return "Please enter what this is for";
  if (!plan.open_amount) return null;
  const value = Number(amount);
  if (!amount || Number.isNaN(value) || value <= 0) return "Please enter the amount";
  const min = plan.min_amount != null ? Number(plan.min_amount) : null;
  const max = plan.max_amount != null ? Number(plan.max_amount) : null;
  if (min != null && value < min) return `The minimum is $${min.toFixed(2)}`;
  if (max != null && value > max) return `The maximum is $${max.toFixed(2)}`;
  return null;
}

/** "Between $1.00 and $50.00" / "At least $1.00" / "Up to $50.00" / "" */
export function describeAmountLimits(plan, currency = "$") {
  const min = plan?.min_amount != null ? `${currency}${Number(plan.min_amount).toFixed(2)}` : null;
  const max = plan?.max_amount != null ? `${currency}${Number(plan.max_amount).toFixed(2)}` : null;
  if (min && max) return `Between ${min} and ${max}`;
  if (min) return `At least ${min}`;
  if (max) return `Up to ${max}`;
  return "";
}

// One-time item sale (snacks, towels, lessons...): the member says what the charge is
// for and, for open-amount items, how much. Then they pay like any other plan.
export default function ItemDetailsScreen({ goTo, context, settings }) {
  const plan = context.plan;
  const previous = context.billing?.planId === plan?.id && context.billing?.item ? context.billing : null;
  const [description, setDescription] = useState(previous?.description || "");
  const [amount, setAmount] = useState(previous && plan?.open_amount ? Number(previous.amount).toFixed(2) : "");
  const currency = settings.currency || "$";

  if (!plan) {
    goTo("payment");
    return null;
  }

  const limits = describeAmountLimits(plan, currency);

  function handleContinue() {
    const error = validateItemDetails(plan, description, amount);
    if (error) {
      toast.error(error);
      return;
    }
    goTo("payment", { billing: itemBilling(plan, description.trim(), amount) });
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("payment")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">{plan.name}</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <ShoppingBag className="h-8 w-8 text-brand-600" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">{plan.name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {plan.open_amount
                ? "Tell us what you're buying and the amount"
                : `${currency}${Number(plan.price).toFixed(2)} — tell us what it's for`}
            </p>
          </div>

          <div className="space-y-4">
            <KioskInput
              label="What is this for? *"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, ITEM_DESCRIPTION_MAX))}
              placeholder="e.g. 2 bottles of water"
              maxLength={ITEM_DESCRIPTION_MAX}
              inputId="item-description"
            />
            {plan.open_amount && (
              <div>
                <KioskInput
                  label={`Amount (${currency}) *`}
                  numeric
                  showDecimal
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  inputId="item-amount"
                />
                {limits && <p className="mt-2 text-sm text-gray-500">{limits}</p>}
              </div>
            )}
          </div>

          <KioskButton
            variant="primary"
            size="xl"
            icon={ArrowRight}
            onClick={handleContinue}
            className="mt-6 w-full"
          >
            Continue to Payment
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

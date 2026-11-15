import { useState } from "react";
import { ArrowLeft, ArrowRight, Banknote, Check, CreditCard, DollarSign } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { ITEM_DESCRIPTION_MAX } from "./ItemDetailsScreen";

// Add Money / Pay Balance. Nothing is credited here: the member enters an amount and what it
// is for, then pays through the normal Cash or Card screens (in "top-up" mode), and the
// server adds the credit only after that payment. Account credit and "put it on my account"
// are deliberately not offered.

const DEFAULT_LIMIT_MESSAGE = "Amounts over {limit} can't be added at the kiosk. Please contact support.";

export default function AddMoneyScreen({ member, goTo, goIdle, context, settings }) {
  const currency = settings?.currency || "$";
  // A negative credit balance means the member owes money on their account
  const owed = Math.max(0, -Number(member?.credit_balance || 0));
  const owesBalance = owed > 0;
  const previous = context.topup || null; // coming back from Cash/Card keeps what was typed
  const [amount, setAmount] = useState(previous ? String(previous.amount) : "");
  const [description, setDescription] = useState(previous ? previous.description : "");
  const [step, setStep] = useState(previous ? "method" : "details");

  const limit = (() => {
    const n = Number(settings?.kiosk_topup_max);
    return Number.isFinite(n) && n > 0 ? n : 500;
  })();
  const limitMessage = (settings?.kiosk_topup_limit_message || DEFAULT_LIMIT_MESSAGE)
    .replace("{limit}", `${currency}${limit.toFixed(2)}`);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overLimit = amountValid && amountNum > limit;

  function back() {
    if (step === "method") {
      setStep("details");
      return;
    }
    if (context.returnTo) goTo(context.returnTo);
    else goIdle();
  }

  function payFullBalance() {
    setAmount(owed.toFixed(2));
    if (!description.trim()) setDescription("Balance payment");
  }

  function handleContinue() {
    if (!amountValid) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (overLimit) {
      toast.error(limitMessage);
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter what this is for");
      return;
    }
    setStep("method");
  }

  function choose(screen) {
    goTo(screen, {
      topup: { amount: amountNum.toFixed(2), description: description.trim() },
      // never carry a plan purchase's credit/billing choices into a top-up
      plan: null, useCredit: false, creditAmount: 0, adjustedPrice: null, billing: null,
    });
  }

  const title = owesBalance ? "Pay Balance" : "Add Money";

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
            <DollarSign className="h-10 w-10 text-emerald-600" />
          </div>

          {step === "details" ? (
            <>
              {owesBalance ? (
                <>
                  <h2 className="mt-6 text-2xl font-bold text-gray-900">How much would you like to pay?</h2>
                  <div className="mt-4 rounded-2xl bg-red-50 p-5 ring-1 ring-red-100">
                    <p className="text-sm font-medium text-red-600">You currently owe</p>
                    <p className="mt-1 text-4xl font-extrabold text-red-700">{currency}{owed.toFixed(2)}</p>
                  </div>
                  <KioskButton variant="success" size="xl" icon={Check} onClick={payFullBalance} className="mt-4 w-full">
                    Pay full balance ({currency}{owed.toFixed(2)})
                  </KioskButton>
                  <p className="mt-4 text-sm text-gray-500">Or enter a different amount</p>
                </>
              ) : (
                <h2 className="mt-6 text-2xl font-bold text-gray-900">How much would you like to add?</h2>
              )}

              <div className="mt-6 space-y-4 text-left">
                <KioskInput
                  label={`Amount (${currency}) *`}
                  numeric
                  showDecimal
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  inputId="add-money-amount"
                />
                {overLimit && <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">{limitMessage}</p>}
                <KioskInput
                  label="What is this for? *"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, ITEM_DESCRIPTION_MAX))}
                  placeholder="e.g. Season credit"
                  maxLength={ITEM_DESCRIPTION_MAX}
                  inputId="add-money-description"
                />
              </div>

              <KioskButton
                variant="primary"
                size="xl"
                icon={ArrowRight}
                onClick={handleContinue}
                disabled={!amountValid || overLimit || !description.trim()}
                className="mt-6 w-full"
              >
                Continue to Payment
              </KioskButton>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">How would you like to pay?</h2>
              <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-4xl font-extrabold text-gray-900">{currency}{amountNum.toFixed(2)}</p>
                <p className="mt-1 text-sm text-gray-500">For: {description.trim()}</p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => choose("cash")}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition-all active:scale-[0.98]"
                >
                  <Banknote className="h-10 w-10 text-emerald-600" />
                  <span className="text-lg font-semibold text-gray-900">Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => choose("card")}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition-all active:scale-[0.98]"
                >
                  <CreditCard className="h-10 w-10 text-brand-600" />
                  <span className="text-lg font-semibold text-gray-900">Card</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

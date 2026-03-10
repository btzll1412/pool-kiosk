import { useState } from "react";
import { ArrowLeft, Banknote, CreditCard, UserPlus, Delete, Split, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import PlanCard from "../components/PlanCard";
import NumPad from "../components/NumPad";
import { getPlans, guestVisit, guestPayCard, guestPaySplit } from "../../api/kiosk";

// Compact number pad for card entry
function CardNumberPad({ onKey, onBackspace, onClear }) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["clear", "0", "back"],
  ];

  return (
    <div className="grid grid-cols-3 gap-2 p-3 bg-gray-100 rounded-xl">
      {keys.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === "back") onBackspace();
            else if (key === "clear") onClear();
            else onKey(key);
          }}
          className={`h-12 rounded-lg text-xl font-bold transition-all active:scale-95 ${
            key === "back"
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : key === "clear"
              ? "bg-red-100 text-red-700 hover:bg-red-200 text-sm"
              : "bg-white text-gray-900 hover:bg-gray-50 shadow-sm"
          }`}
        >
          {key === "back" ? <Delete className="h-5 w-5 mx-auto" /> : key === "clear" ? "Clear" : key}
        </button>
      ))}
    </div>
  );
}

export default function GuestScreen({ goTo, goIdle, settings }) {
  const [step, setStep] = useState("info"); // info | plan | payment | cash | card | splitCash | splitCard
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [splitCashAmount, setSplitCashAmount] = useState("");

  // Card entry state
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [activeField, setActiveField] = useState("card");
  const [paymentError, setPaymentError] = useState(null);

  function formatCardNumber(value) {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 23);
  }

  function handleCardNumPadKey(key) {
    if (activeField === "card") {
      if (cardNumber.replace(/\s/g, "").length < 19) {
        const newValue = cardNumber.replace(/\s/g, "") + key;
        setCardNumber(formatCardNumber(newValue));
      }
    } else if (activeField === "cvv") {
      if (cvv.length < 4) {
        setCvv(cvv + key);
      }
    } else if (activeField === "month") {
      if (expMonth.length < 2) {
        const newMonth = expMonth + key;
        if (newMonth.length === 2) {
          const monthNum = parseInt(newMonth, 10);
          if (monthNum >= 1 && monthNum <= 12) {
            setExpMonth(newMonth);
            setActiveField("year");
          } else {
            toast.error("Month must be 01-12");
          }
        } else {
          setExpMonth(newMonth);
        }
      }
    } else if (activeField === "year") {
      if (expYear.length < 2) {
        const newYear = expYear + key;
        setExpYear(newYear);
        if (newYear.length === 2) {
          setActiveField("cvv");
        }
      }
    }
  }

  function handleCardNumPadBackspace() {
    if (activeField === "card") {
      const digits = cardNumber.replace(/\s/g, "");
      setCardNumber(formatCardNumber(digits.slice(0, -1)));
    } else if (activeField === "cvv") {
      setCvv(cvv.slice(0, -1));
    } else if (activeField === "month") {
      setExpMonth(expMonth.slice(0, -1));
    } else if (activeField === "year") {
      setExpYear(expYear.slice(0, -1));
    }
  }

  function handleCardNumPadClear() {
    if (activeField === "card") setCardNumber("");
    else if (activeField === "cvv") setCvv("");
    else if (activeField === "month") setExpMonth("");
    else if (activeField === "year") setExpYear("");
  }

  async function handleCardPay() {
    const cleanCardNumber = cardNumber.replace(/\s/g, "");
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      toast.error("Please enter a valid card number");
      return;
    }
    if (!expMonth || !expYear) {
      toast.error("Please enter the card expiration date");
      return;
    }
    if (cvv.length < 3 || cvv.length > 4) {
      toast.error("Please enter a valid CVV (3-4 digits)");
      return;
    }

    const expDate = `${expMonth.padStart(2, "0")}${expYear}`;
    setLoading(true);
    setPaymentError(null);
    try {
      const data = await guestPayCard(name.trim(), phone.trim() || null, selectedPlan.id, cleanCardNumber, expDate, cvv);
      goTo("status", {
        statusType: "success",
        statusTitle: `Welcome, ${name.trim()}!`,
        statusMessage: data.message || "Enjoy your swim!",
      });
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Payment failed. Please try again.";
      setPaymentError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSplitPay() {
    const cleanCardNumber = cardNumber.replace(/\s/g, "");
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      toast.error("Please enter a valid card number");
      return;
    }
    if (!expMonth || !expYear) {
      toast.error("Please enter the card expiration date");
      return;
    }
    if (cvv.length < 3 || cvv.length > 4) {
      toast.error("Please enter a valid CVV (3-4 digits)");
      return;
    }

    const expDate = `${expMonth.padStart(2, "0")}${expYear}`;
    setLoading(true);
    setPaymentError(null);
    try {
      const data = await guestPaySplit(
        name.trim(),
        phone.trim() || null,
        selectedPlan.id,
        parseFloat(splitCashAmount),
        cleanCardNumber,
        expDate,
        cvv
      );
      goTo("status", {
        statusType: "success",
        statusTitle: `Welcome, ${name.trim()}!`,
        statusMessage: data.message || "Enjoy your swim!",
      });
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Payment failed. Please try again.";
      setPaymentError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  function resetCardFields() {
    setCardNumber("");
    setExpMonth("");
    setExpYear("");
    setCvv("");
    setActiveField("card");
  }

  function handleNext() {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    setLoadingPlans(true);
    getPlans()
      .then((data) => {
        const singlePlans = data.filter((p) => p.plan_type === "single");
        setPlans(singlePlans.length > 0 ? singlePlans : data);
        if (singlePlans.length === 1) setSelectedPlan(singlePlans[0]);
        setStep("plan");
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoadingPlans(false));
  }

  async function handlePay(method) {
    if (!selectedPlan) {
      toast.error("Select a plan");
      return;
    }
    setLoading(true);
    try {
      const data = await guestVisit(name.trim(), phone.trim() || null, method, selectedPlan.id, method === "cash" ? parseFloat(cashAmount) : null);

      let message = data.message || "Enjoy your swim!";
      // For cash payments, show the cash instruction with the amount
      if (method === "cash") {
        const amountStr = `${settings.currency}${parseFloat(cashAmount || selectedPlan.price).toFixed(2)}`;
        const cashMsg = (settings.cash_success_message || "Place {amount} in the cash box.").replace("{amount}", amountStr);
        message = cashMsg;
      }

      goTo("status", {
        statusType: "success",
        statusTitle: `Welcome, ${name.trim()}!`,
        statusMessage: message,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => {
            if (step === "splitCard") setStep("splitCash");
            else if (step === "cash" || step === "card" || step === "splitCash") setStep("payment");
            else if (step === "payment") setStep("plan");
            else if (step === "plan") setStep("info");
            else goIdle();
          }}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Guest Visit</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        {step === "info" && (
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                <UserPlus className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                {settings.guest_welcome_title || "Welcome, Guest!"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {settings.guest_welcome_subtitle || "Enter your details to get started"}
              </p>
              {settings.guest_instructions && (
                <p className="mt-3 text-sm text-gray-600 whitespace-pre-line">
                  {settings.guest_instructions}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <KioskInput
                label="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tap to enter your name"
              />
              <KioskInput
                label="Phone *"
                type="tel"
                numeric
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Tap to enter phone number"
              />
            </div>

            <KioskButton
              variant="primary"
              size="xl"
              loading={loadingPlans}
              onClick={handleNext}
              className="mt-6 w-full"
            >
              Continue
            </KioskButton>
          </div>
        )}

        {step === "plan" && (
          <div className="w-full max-w-2xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900 text-center">
              Select a Swim Option
            </h2>

            {plans.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
                <p className="text-lg font-semibold text-gray-900">No plans available</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    selected={selectedPlan?.id === plan.id}
                    onSelect={setSelectedPlan}
                  />
                ))}
              </div>
            )}

            {selectedPlan && (
              <KioskButton
                variant="primary"
                size="xl"
                onClick={() => setStep("payment")}
                className="mt-6 w-full max-w-md mx-auto"
              >
                Continue to Payment
              </KioskButton>
            )}
          </div>
        )}

        {step === "payment" && selectedPlan && (
          <div className="w-full max-w-md text-center">
            <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">{selectedPlan.name}</p>
              <p className="mt-2 text-4xl font-extrabold text-gray-900">
                {settings.currency}{Number(selectedPlan.price).toFixed(2)}
              </p>
            </div>

            <h2 className="mb-6 text-xl font-bold text-gray-900">
              How would you like to pay?
            </h2>

            <div className="flex justify-center gap-4 flex-wrap">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setCashAmount("");
                  setStep("cash");
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <Banknote className="h-8 w-8 text-emerald-600" />
                <span className="text-lg font-semibold text-gray-900">Cash</span>
                <span className="text-xs text-amber-600 font-medium">Exact Change Only</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  resetCardFields();
                  setStep("card");
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <CreditCard className="h-8 w-8 text-blue-600" />
                <span className="text-lg font-semibold text-gray-900">Card</span>
                <span className="text-xs text-gray-400">Credit or Debit</span>
              </button>
              {settings.split_payment_enabled !== "false" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSplitCashAmount("");
                    resetCardFields();
                    setStep("splitCash");
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  <Split className="h-8 w-8 text-purple-600" />
                  <span className="text-lg font-semibold text-gray-900">Split</span>
                  <span className="text-xs text-gray-400">Cash + Card</span>
                </button>
              )}
            </div>
          </div>
        )}

        {step === "cash" && selectedPlan && (
          <div className="w-full max-w-sm">
            <div className="mb-6 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">{selectedPlan.name}</p>
              <p className="mt-1 text-4xl font-extrabold text-gray-900">
                {settings.currency}{Number(selectedPlan.price).toFixed(2)}
              </p>
              <p className="mt-2 text-xs font-medium text-amber-600">
                Exact Change Only
              </p>
            </div>

            <div className="mb-4 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Amount Tendered</p>
              <p className="mt-1 text-4xl font-extrabold text-gray-900">
                {settings.currency}{cashAmount || "0.00"}
              </p>
            </div>

            <NumPad value={cashAmount} onChange={setCashAmount} maxLength={7} showDecimal />

            <KioskButton
              variant="success"
              size="xl"
              icon={Banknote}
              loading={loading}
              disabled={parseFloat(cashAmount) < Number(selectedPlan.price)}
              onClick={() => handlePay("cash")}
              className="mt-4 w-full"
            >
              Confirm Payment
            </KioskButton>
          </div>
        )}

        {step === "card" && selectedPlan && (
          <div className="w-full max-w-sm">
            {/* Amount */}
            <div className="mb-4 rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-xs text-gray-500">{selectedPlan.name}</p>
              <p className="text-3xl font-extrabold text-gray-900">
                {settings.currency}{Number(selectedPlan.price).toFixed(2)}
              </p>
            </div>

            {/* Payment Error Display */}
            {paymentError && (
              <div className="mb-4 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-red-800">Payment Failed</h3>
                    <p className="mt-1 text-sm text-red-700">{paymentError}</p>
                    <p className="mt-2 text-xs text-red-600">Please try again or use a different card.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentError(null)}
                  className="mt-3 w-full rounded-lg bg-red-100 py-2 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-3">
              {/* Card Number */}
              <button
                type="button"
                onClick={() => setActiveField("card")}
                className={`w-full rounded-xl p-3 text-left font-mono text-lg ring-1 ${
                  activeField === "card" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                } ${cardNumber ? "text-gray-900" : "text-gray-400"}`}
              >
                <span className="text-xs text-gray-500 block mb-1">Card Number</span>
                {cardNumber || "0000 0000 0000 0000"}
              </button>

              {/* Exp & CVV row */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveField("month")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "month" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${expMonth ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">MM</span>
                  {expMonth || "00"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField("year")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "year" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${expYear ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">YY</span>
                  {expYear || "00"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField("cvv")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "cvv" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${cvv ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">CVV</span>
                  {cvv ? "•".repeat(cvv.length) : "•••"}
                </button>
              </div>

              {/* Number Pad */}
              <CardNumberPad
                onKey={handleCardNumPadKey}
                onBackspace={handleCardNumPadBackspace}
                onClear={handleCardNumPadClear}
              />

              {/* Pay Button */}
              <KioskButton
                variant="primary"
                size="lg"
                icon={CreditCard}
                loading={loading}
                onClick={handleCardPay}
                className="w-full"
              >
                Pay {settings.currency}{Number(selectedPlan.price).toFixed(2)}
              </KioskButton>

              <KioskButton
                variant="ghost"
                size="lg"
                onClick={() => setStep("payment")}
                className="w-full"
              >
                Choose Different Payment
              </KioskButton>
            </div>
          </div>
        )}

        {step === "splitCash" && selectedPlan && (
          <div className="w-full max-w-sm">
            <div className="mb-4 rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">{selectedPlan.name}</p>
              <p className="text-3xl font-extrabold text-gray-900">
                {settings.currency}{Number(selectedPlan.price).toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-purple-600 font-medium">Split Payment</p>
            </div>

            <div className="mb-4 rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">Cash Portion</p>
              <p className="text-3xl font-extrabold text-gray-900">
                {settings.currency}{splitCashAmount || "0.00"}
              </p>
              {splitCashAmount && parseFloat(splitCashAmount) > 0 && parseFloat(splitCashAmount) < Number(selectedPlan.price) && (
                <p className="mt-1 text-sm text-blue-600">
                  Card: {settings.currency}{(Number(selectedPlan.price) - parseFloat(splitCashAmount)).toFixed(2)}
                </p>
              )}
            </div>

            <NumPad value={splitCashAmount} onChange={setSplitCashAmount} maxLength={7} showDecimal />

            <KioskButton
              variant="primary"
              size="xl"
              loading={loading}
              disabled={!splitCashAmount || parseFloat(splitCashAmount) <= 0 || parseFloat(splitCashAmount) >= Number(selectedPlan.price)}
              onClick={() => setStep("splitCard")}
              className="mt-4 w-full"
            >
              Continue to Card Entry
            </KioskButton>

            {parseFloat(splitCashAmount) >= Number(selectedPlan.price) && (
              <p className="mt-2 text-center text-sm text-amber-600">
                Cash must be less than total for split payment
              </p>
            )}
          </div>
        )}

        {step === "splitCard" && selectedPlan && (
          <div className="w-full max-w-sm">
            {/* Amount breakdown */}
            <div className="mb-4 rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-xs text-gray-500">{selectedPlan.name} - Split Payment</p>
              <div className="mt-2 flex justify-center gap-4 text-sm">
                <span className="text-emerald-600">Cash: {settings.currency}{parseFloat(splitCashAmount).toFixed(2)}</span>
                <span className="text-blue-600">Card: {settings.currency}{(Number(selectedPlan.price) - parseFloat(splitCashAmount)).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Error Display */}
            {paymentError && (
              <div className="mb-4 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-red-800">Payment Failed</h3>
                    <p className="mt-1 text-sm text-red-700">{paymentError}</p>
                    <p className="mt-2 text-xs text-red-600">Please try again or use a different card.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentError(null)}
                  className="mt-3 w-full rounded-lg bg-red-100 py-2 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-3">
              {/* Card Number */}
              <button
                type="button"
                onClick={() => setActiveField("card")}
                className={`w-full rounded-xl p-3 text-left font-mono text-lg ring-1 ${
                  activeField === "card" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                } ${cardNumber ? "text-gray-900" : "text-gray-400"}`}
              >
                <span className="text-xs text-gray-500 block mb-1">Card Number</span>
                {cardNumber || "0000 0000 0000 0000"}
              </button>

              {/* Exp & CVV row */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveField("month")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "month" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${expMonth ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">MM</span>
                  {expMonth || "00"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField("year")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "year" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${expYear ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">YY</span>
                  {expYear || "00"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField("cvv")}
                  className={`rounded-xl p-3 text-center font-mono ring-1 ${
                    activeField === "cvv" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                  } ${cvv ? "text-gray-900" : "text-gray-400"}`}
                >
                  <span className="text-xs text-gray-500 block mb-1">CVV</span>
                  {cvv ? "•".repeat(cvv.length) : "•••"}
                </button>
              </div>

              {/* Number Pad */}
              <CardNumberPad
                onKey={handleCardNumPadKey}
                onBackspace={handleCardNumPadBackspace}
                onClear={handleCardNumPadClear}
              />

              {/* Pay Button */}
              <KioskButton
                variant="primary"
                size="lg"
                icon={Split}
                loading={loading}
                onClick={handleSplitPay}
                className="w-full"
              >
                Complete Split Payment
              </KioskButton>

              <KioskButton
                variant="ghost"
                size="lg"
                onClick={() => setStep("payment")}
                className="w-full"
              >
                Choose Different Payment
              </KioskButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Banknote, ClipboardList, CreditCard, Loader2, Split, Wallet, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import PlanCard from "../components/PlanCard";
import KioskButton from "../components/KioskButton";
import { getPlans, payCredit, payOnAccount, getTerminalInfo } from "../../api/kiosk";
import { defaultBilling, describeBilling, getBillingParams, getPurchasePrice, needsBillingChoice } from "../utils/billing";

export default function PaymentScreen({ member, goTo, context, settings }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [hasTerminal, setHasTerminal] = useState(false);
  const [billing, setBilling] = useState(null);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const payMethodsRef = useRef(null);

  // A negative balance means the member owes money — never treat it as usable credit
  const creditBalance = Math.max(0, Number(member?.credit_balance || 0));
  const planPrice = getPurchasePrice(selectedPlan, billing);
  const billingSummary = describeBilling(selectedPlan, billing, settings.currency);
  const creditCoversAll = creditBalance >= planPrice && planPrice > 0;

  useEffect(() => {
    // Fetch plans based on member's senior status
    const isSenior = member?.is_senior || false;
    getPlans(isSenior, member?.member_id)
      .then((data) => {
        setPlans(data);
        // Returning from the billing choice (or a payment screen) — restore the selection
        const chosen = context.billing && data.find((p) => p.id === context.billing.planId);
        if (chosen) {
          setSelectedPlan(chosen);
          setBilling(context.billing);
        } else if (data.length === 1 && !needsBillingChoice(data[0])) {
          setSelectedPlan(data[0]);
          setBilling(defaultBilling(data[0]));
        }
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));

    // Check if terminal is available
    getTerminalInfo()
      .then((info) => setHasTerminal(info.has_terminal))
      .catch(() => setHasTerminal(false));
  }, [member?.is_senior]);

  // Bring the payment choices into view once a plan is selected
  useEffect(() => {
    if (selectedPlan) payMethodsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedPlan]);

  function handleSelectPlan(plan) {
    setConfirmAccount(false);
    if (needsBillingChoice(plan)) {
      // Monthly-type plan with two different prices — let the member choose first
      goTo("billing", { plan, pin: context.pin });
      return;
    }
    setSelectedPlan(plan);
    setBilling(defaultBilling(plan));
  }

  function goPayMethod(method) {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }
    goTo(method, {
      plan: selectedPlan,
      billing,
      pin: context.pin,
      useCredit: false,
      creditAmount: 0,
      adjustedPrice: null,
    });
  }

  async function handleAccountPayment() {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }

    setAccountLoading(true);
    try {
      const { billing_mode, start_date } = getBillingParams(selectedPlan, billing);
      const result = await payOnAccount(member.member_id, selectedPlan.id, context.pin, billing_mode, start_date);
      goTo("status", {
        statusType: "success",
        statusTitle: "You're All Set!",
        statusMessage: result.message,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not put this on your account");
      setConfirmAccount(false);
    } finally {
      setAccountLoading(false);
    }
  }

  async function handleCreditPayment() {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }

    setCreditLoading(true);
    try {
      const result = await payCredit(member.member_id, selectedPlan.id, context.pin, getBillingParams(selectedPlan, billing));

      if (result.success) {
        // Full credit payment successful
        goTo("status", {
          statusType: "success",
          statusTitle: "Payment Complete!",
          statusMessage: result.message,
        });
      } else {
        // Partial credit - redirect to pay remaining
        goTo("creditPartial", {
          plan: selectedPlan,
          billing,
          pin: context.pin,
          creditUsed: result.credit_used,
          remainingDue: result.remaining_due,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
    } finally {
      setCreditLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("member", { plan: null, billing: null })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Purchase Plan</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
              <p className="text-lg font-semibold text-gray-900">No plans available</p>
              <p className="mt-1 text-sm text-gray-500">Please ask staff for assistance</p>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-xl font-bold text-gray-900">
                Select a Plan
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    selected={selectedPlan?.id === plan.id}
                    onSelect={handleSelectPlan}
                  />
                ))}
              </div>

              {selectedPlan && (
                <div ref={payMethodsRef} className="mt-8">
                  <h2 className="mb-4 text-xl font-bold text-gray-900">
                    How would you like to pay?
                  </h2>
                  <p className="mb-4 text-sm text-gray-500">
                    {selectedPlan.name} — 
                    <span className="font-semibold text-gray-700">
                      {settings.currency}{planPrice.toFixed(2)} due now
                    </span>
                    {creditBalance > 0 &&
                      ` (${settings.currency}${creditBalance.toFixed(2)} credit available)`}
                  </p>
                  {billingSummary && (
                    <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                      <p className="text-sm text-gray-600">{billingSummary}</p>
                      {needsBillingChoice(selectedPlan) && (
                        <button
                          type="button"
                          onClick={() => goTo("billing", { plan: selectedPlan, billing, pin: context.pin })}
                          className="flex-shrink-0 rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 active:scale-[0.98]"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Account Credit - only show if member has credit */}
                    {creditBalance > 0 && (
                      <button
                        type="button"
                        onClick={handleCreditPayment}
                        disabled={creditLoading}
                        className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-2 ring-emerald-500 transition-all hover:ring-emerald-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                      >
                        {creditLoading ? (
                          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                        ) : (
                          <Wallet className="h-8 w-8 text-emerald-600" />
                        )}
                        <span className="text-lg font-semibold text-gray-900">Account Credit</span>
                        <span className="text-xs text-emerald-600 font-medium">
                          {creditCoversAll
                            ? "Covers full amount"
                            : `${settings.currency}${creditBalance.toFixed(2)} available`}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => goPayMethod("cash")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98]"
                    >
                      <Banknote className="h-8 w-8 text-emerald-600" />
                      <span className="text-lg font-semibold text-gray-900">Cash</span>
                      <span className="text-xs text-amber-600 font-medium">Exact Change Only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => goPayMethod("card")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98]"
                    >
                      <CreditCard className="h-8 w-8 text-blue-600" />
                      <span className="text-lg font-semibold text-gray-900">Card</span>
                      <span className="text-xs text-gray-400">Credit or Debit</span>
                    </button>
                    {hasTerminal && (
                      <button
                        type="button"
                        onClick={() => goPayMethod("terminal")}
                        className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-2 ring-brand-500 transition-all hover:ring-brand-600 hover:shadow-md active:scale-[0.98]"
                      >
                        <Smartphone className="h-8 w-8 text-brand-600" />
                        <span className="text-lg font-semibold text-gray-900">Tap to Pay</span>
                        <span className="text-xs text-brand-600 font-medium">Recommended</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => goPayMethod("split")}
                      className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98]"
                    >
                      <Split className="h-8 w-8 text-purple-600" />
                      <span className="text-lg font-semibold text-gray-900">Split</span>
                      <span className="text-xs text-gray-400">Cash + Card</span>
                    </button>
                  </div>

                  {/* Put it on my account — only when this plan and this member both allow it */}
                  {selectedPlan.allow_charge_to_account && (
                    <div className="mt-4">
                      {!confirmAccount ? (
                        <button
                          type="button"
                          onClick={() => setConfirmAccount(true)}
                          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white p-6 shadow-sm ring-2 ring-amber-400 transition-all hover:ring-amber-500 hover:shadow-md active:scale-[0.98]"
                        >
                          <ClipboardList className="h-8 w-8 text-amber-600" />
                          <span className="text-lg font-semibold text-gray-900">Put It On My Account</span>
                          <span className="text-xs font-medium text-amber-600">Pay later</span>
                        </button>
                      ) : (
                        <div className="rounded-2xl bg-amber-50 p-6 text-center ring-1 ring-amber-200">
                          <p className="text-lg font-semibold text-amber-900">
                            Put {settings.currency}{planPrice.toFixed(2)} on your account?
                          </p>
                          <p className="mt-1 text-sm text-amber-700">
                            This amount will be owed on your account until it is paid.
                          </p>
                          <div className="mt-4 flex gap-3">
                            <KioskButton
                              variant="secondary"
                              size="lg"
                              disabled={accountLoading}
                              onClick={() => setConfirmAccount(false)}
                              className="flex-1"
                            >
                              Cancel
                            </KioskButton>
                            <KioskButton
                              variant="primary"
                              size="lg"
                              icon={ClipboardList}
                              loading={accountLoading}
                              onClick={handleAccountPayment}
                              className="flex-1"
                            >
                              Yes, Put It On My Account
                            </KioskButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, CreditCard, Loader2, Split, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import PlanCard from "../components/PlanCard";
import { getPlans, payCredit } from "../../api/kiosk";

export default function PaymentScreen({ member, goTo, context, settings }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);

  const creditBalance = Number(member?.credit_balance || 0);
  const planPrice = Number(selectedPlan?.price || 0);
  const creditCoversAll = creditBalance >= planPrice && planPrice > 0;

  useEffect(() => {
    // Fetch plans based on member's senior status
    const isSenior = member?.is_senior || false;
    getPlans(isSenior)
      .then((data) => {
        setPlans(data);
        if (data.length === 1) setSelectedPlan(data[0]);
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, [member?.is_senior]);

  function goPayMethod(method) {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }
    goTo(method, { plan: selectedPlan, pin: context.pin });
  }

  async function handleCreditPayment() {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }

    setCreditLoading(true);
    try {
      const result = await payCredit(member.member_id, selectedPlan.id, context.pin);

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
          onClick={() => goTo("member")}
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
                    onSelect={setSelectedPlan}
                  />
                ))}
              </div>

              {selectedPlan && (
                <div className="mt-8">
                  <h2 className="mb-4 text-xl font-bold text-gray-900">
                    How would you like to pay?
                  </h2>
                  <p className="mb-4 text-sm text-gray-500">
                    {selectedPlan.name} — 
                    {selectedPlan.prorated ? (
                      <>
                        <span className="font-semibold text-gray-700">
                          {settings.currency}{Number(selectedPlan.prorated.prorated_price).toFixed(2)} due today
                        </span>
                        <span className="text-gray-400"> (then {settings.currency}{Number(selectedPlan.price).toFixed(2)}/mo)</span>
                      </>
                    ) : (
                      <>{settings.currency}{Number(selectedPlan.price).toFixed(2)}</>
                    )}
                    {creditBalance > 0 &&
                      ` (${settings.currency}${creditBalance.toFixed(2)} credit available)`}
                  </p>
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

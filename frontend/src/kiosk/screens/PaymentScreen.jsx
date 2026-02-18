import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, CreditCard, Loader2, Split } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import PlanCard from "../components/PlanCard";
import { getPlans } from "../../api/kiosk";

export default function PaymentScreen({ member, goTo, context, settings }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    getPlans()
      .then((data) => {
        setPlans(data);
        if (data.length === 1) setSelectedPlan(data[0]);
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoading(false));
  }, []);

  function goPayMethod(method) {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }
    goTo(method, { plan: selectedPlan, pin: context.pin });
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
                    {selectedPlan.name} — {settings.currency}
                    {Number(selectedPlan.price).toFixed(2)}
                    {member.credit_balance > 0 &&
                      ` (${settings.currency}${Number(member.credit_balance).toFixed(2)} credit available)`}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <KioskButton
                      variant="secondary"
                      size="xl"
                      icon={Banknote}
                      onClick={() => goPayMethod("cash")}
                      className="flex-col gap-1 py-6"
                    >
                      Pay Cash
                    </KioskButton>
                    <KioskButton
                      variant="secondary"
                      size="xl"
                      icon={CreditCard}
                      onClick={() => goPayMethod("card")}
                      className="flex-col gap-1 py-6"
                    >
                      Pay Card
                    </KioskButton>
                    {settings.split_payment_enabled === "true" && (
                      <KioskButton
                        variant="secondary"
                        size="xl"
                        icon={Split}
                        onClick={() => goPayMethod("split")}
                        className="flex-col gap-1 py-6"
                      >
                        Split Payment
                      </KioskButton>
                    )}
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

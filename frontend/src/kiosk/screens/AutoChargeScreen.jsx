import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Zap, ZapOff } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import {
  disableAutoCharge,
  enableAutoCharge,
  getPlans,
} from "../../api/kiosk";

export default function AutoChargeScreen({ member, goTo, context }) {
  const pin = context.pin;
  const card = context.savedCard;
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    getPlans()
      .then((data) => {
        const monthly = data.filter((p) => p.plan_type === "monthly");
        setPlans(monthly);
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setPlansLoading(false));
  }, []);

  if (!card) {
    goTo("savedCards", { pin });
    return null;
  }

  async function handleEnable() {
    if (!selectedPlan) {
      toast.error("Select a plan first");
      return;
    }
    setLoading(true);
    try {
      const result = await enableAutoCharge(card.id, member.member_id, pin, selectedPlan.id);
      toast.success(`Auto-charge enabled! Next charge: ${result.next_charge_date}`);
      goTo("savedCards", { pin });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to enable auto-charge");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      await disableAutoCharge(card.id, member.member_id, pin);
      toast.success("Auto-charge disabled");
      goTo("savedCards", { pin });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to disable auto-charge");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("savedCards", { pin })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Auto-Charge</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-lg space-y-6">
          {/* Card info */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                <CreditCard className="h-6 w-6 text-brand-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {card.friendly_name || `Card ending ${card.card_last4}`}
                </p>
                <p className="text-sm text-gray-500">
                  {card.card_brand || "Card"} **** {card.card_last4}
                </p>
              </div>
            </div>
            {card.auto_charge_enabled && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                <Zap className="h-4 w-4" />
                Currently auto-charging: {card.auto_charge_plan_name}
                {card.next_charge_date && (
                  <span className="text-emerald-500">
                    &middot; Next: {card.next_charge_date}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Plan selection */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Select Monthly Plan
            </h3>
            {plansLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
              </div>
            ) : plans.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-100">
                <p className="text-gray-500">No monthly plans available</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`flex items-center justify-between rounded-2xl p-5 text-left transition-all ${
                      selectedPlan?.id === plan.id
                        ? "bg-brand-50 ring-2 ring-brand-600"
                        : "bg-white ring-1 ring-gray-100 shadow-sm hover:ring-gray-200"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{plan.name}</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {plan.duration_days} days
                      </p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      ${Number(plan.price).toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-lg gap-3">
          {card.auto_charge_enabled && (
            <KioskButton
              variant="danger"
              size="lg"
              icon={ZapOff}
              loading={loading}
              onClick={handleDisable}
              className="flex-1"
            >
              Disable Auto-Charge
            </KioskButton>
          )}
          <KioskButton
            variant="success"
            size="lg"
            icon={Zap}
            loading={loading}
            disabled={!selectedPlan}
            onClick={handleEnable}
            className="flex-1"
          >
            {card.auto_charge_enabled ? "Update Plan" : "Enable Auto-Charge"}
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

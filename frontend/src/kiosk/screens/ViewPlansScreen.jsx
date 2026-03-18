import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, Info, Repeat, Waves } from "lucide-react";
import { getPlans } from "../../api/kiosk";

const typeIcons = {
  single: Waves,
  swim_pass: Repeat,
  monthly: Calendar,
};

const typeLabels = {
  single: "Single Swim",
  swim_pass: "Swim Pass",
  monthly: "Monthly",
};

function PlanDisplayCard({ plan, currency }) {
  const Icon = typeIcons[plan.plan_type] || Waves;

  return (
    <div className="flex w-full flex-col items-center rounded-2xl bg-white p-6 text-center ring-1 ring-gray-200 shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50">
        <Icon className="h-7 w-7 text-brand-600" />
      </div>
      <h3 className="mt-3 text-lg font-bold text-gray-900">{plan.name}</h3>
      <p className="text-sm text-gray-500">
        {typeLabels[plan.plan_type]}
        {plan.swim_count ? ` • ${plan.swim_count} swims` : ""}
        {plan.duration_months ? ` • ${plan.duration_months} month${plan.duration_months !== 1 ? "s" : ""}` : ""}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-gray-900">
        {currency}{Number(plan.price).toFixed(2)}
        {plan.duration_months && <span className="text-base font-medium text-gray-500">/mo</span>}
      </p>
      {plan.description && (
        <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
      )}
    </div>
  );
}

export default function ViewPlansScreen({ goIdle, settings }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const currency = settings.currency || "$";
  const plansMessage = settings.kiosk_plans_message ||
    "To purchase a plan, please use your member account or visit as a guest.";

  useEffect(() => {
    getPlans()
      .then((data) => {
        // Show all active plans
        setPlans(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goIdle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Our Plans</h1>
        <div className="w-24" />
      </div>

      {/* Info Message */}
      <div className="mx-6 mt-6 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
        <div className="flex items-start gap-3">
          <Info className="h-6 w-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 leading-relaxed">{plansMessage}</p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-lg font-semibold text-gray-900">No plans available</p>
            <p className="mt-2 text-sm text-gray-500">Please check back later.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plans.map((plan) => (
              <PlanDisplayCard key={plan.id} plan={plan} currency={currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

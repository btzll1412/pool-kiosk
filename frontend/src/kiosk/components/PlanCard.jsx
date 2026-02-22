import { Calendar, Repeat, Waves } from "lucide-react";

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

export default function PlanCard({ plan, selected, onSelect }) {
  const Icon = typeIcons[plan.plan_type] || Waves;

  return (
    <button
      type="button"
      onClick={() => onSelect(plan)}
      className={`flex w-full flex-col items-center rounded-2xl p-6 text-center transition-all duration-200 active:scale-[0.97]
        ${selected
          ? "bg-brand-600 text-white ring-2 ring-brand-600 shadow-lg shadow-brand-600/25 scale-[1.03]"
          : "bg-white text-gray-900 ring-1 ring-gray-200 hover:ring-brand-300 hover:shadow-md hover:scale-[1.01]"
        }`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-xl ${
          selected ? "bg-white/20" : "bg-brand-50"
        }`}
      >
        <Icon className={`h-7 w-7 ${selected ? "text-white" : "text-brand-600"}`} />
      </div>
      <h3 className="mt-3 text-lg font-bold">{plan.name}</h3>
      <p className={`text-sm ${selected ? "text-brand-100" : "text-gray-500"}`}>
        {typeLabels[plan.plan_type]}
        {plan.swim_count ? ` \u2022 ${plan.swim_count} swims` : ""}
        {plan.duration_months ? ` \u2022 ${plan.duration_months} month${plan.duration_months !== 1 ? "s" : ""}` : ""}
      </p>
      <p className="mt-2 text-3xl font-extrabold">
        ${Number(plan.price).toFixed(2)}
        {plan.duration_months && <span className="text-base font-medium">/mo</span>}
      </p>
      {plan.prorated && (
        <p className={`text-sm font-semibold ${selected ? "text-green-200" : "text-green-600"}`}>
          Pay today: ${Number(plan.prorated.prorated_price).toFixed(2)}
        </p>
      )}
      {plan.prorated && (
        <p className={`text-xs ${selected ? "text-brand-200" : "text-gray-400"}`}>
          ({plan.prorated.days_remaining} days remaining this month)
        </p>
      )}
    </button>
  );
}

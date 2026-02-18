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
      className={`flex w-full flex-col items-center rounded-2xl p-6 text-center transition-all active:scale-[0.98]
        ${selected
          ? "bg-brand-600 text-white ring-2 ring-brand-600 shadow-lg shadow-brand-600/25"
          : "bg-white text-gray-900 ring-1 ring-gray-200 hover:ring-brand-300 hover:shadow-md"
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
        {plan.duration_days ? ` \u2022 ${plan.duration_days} days` : ""}
      </p>
      <p className="mt-2 text-3xl font-extrabold">
        ${Number(plan.price).toFixed(2)}
      </p>
    </button>
  );
}

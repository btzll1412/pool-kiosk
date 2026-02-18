export default function StatCard({ title, value, icon: Icon, trend, color = "brand" }) {
  const colors = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-gray-900">
            {value}
          </p>
          {trend && (
            <p className="mt-1 text-xs text-gray-500">{trend}</p>
          )}
        </div>
        {Icon && (
          <div className={`rounded-xl p-3 ${colors[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}

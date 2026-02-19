export default function StatCard({ title, value, icon: Icon, trend, color = "brand", onClick }) {
  const colors = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  };

  const clickableClasses = onClick ? "cursor-pointer hover:border-brand-300 dark:hover:border-brand-600" : "";

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-all dark:border-gray-700 dark:bg-gray-800 ${clickableClasses}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {value}
          </p>
          {trend && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{trend}</p>
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

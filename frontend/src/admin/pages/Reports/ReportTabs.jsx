import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/admin/reports", label: "Revenue", end: true },
  { to: "/admin/reports/monthly", label: "Monthly" },
  { to: "/admin/reports/swims", label: "Swims" },
];

export default function ReportTabs() {
  return (
    <nav className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800 print:hidden" aria-label="Report sections">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Settings,
  Ticket,
  UserPlus,
  Users,
  Waves,
  X,
} from "lucide-react";

const nav = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/members", icon: Users, label: "Members" },
  { to: "/admin/guests", icon: UserPlus, label: "Guests" },
  { to: "/admin/plans", icon: Ticket, label: "Plans" },
  { to: "/admin/transactions", icon: CreditCard, label: "Transactions" },
  { to: "/admin/reports", icon: BarChart3, label: "Reports" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  const linkClasses = (isActive) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
      isActive
        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    }`;

  const iconClasses = (isActive) =>
    `h-5 w-5 shrink-0 transition-colors ${
      isActive
        ? "text-brand-600 dark:text-brand-400"
        : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
    }`;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
          <Waves className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">Pool Manager</span>
          <span className="block text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Admin Panel
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto scrollbar-thin">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {({ isActive }) => (
              <>
                <item.icon className={iconClasses(isActive)} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Pool Management System v1.0</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64">
        <div className="flex w-full flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          {sidebarContent}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl dark:bg-gray-900">
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

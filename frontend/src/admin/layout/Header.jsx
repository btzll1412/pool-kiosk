import { LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function Header({ onMenuToggle }) {
  const { logout } = useAuth();
  const { dark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 backdrop-blur-md px-4 lg:px-8 dark:border-gray-700 dark:bg-gray-900/80">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
            <User className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <span className="hidden text-sm font-medium text-gray-700 sm:block dark:text-gray-300">
            Admin
          </span>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

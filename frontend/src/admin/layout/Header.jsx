import { LogOut, Menu, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function Header({ onMenuToggle }) {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 backdrop-blur-md px-4 lg:px-8">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100">
            <User className="h-4 w-4 text-brand-600" />
          </div>
          <span className="hidden text-sm font-medium text-gray-700 sm:block">
            Admin
          </span>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

import { CreditCard, Search, UserPlus, Waves } from "lucide-react";
import KioskButton from "../components/KioskButton";

export default function IdleScreen({ goTo, settings }) {
  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-8 text-white">
      {/* Top right - New Member button */}
      <div className="absolute right-6 top-6">
        <button
          type="button"
          onClick={() => goTo("signup")}
          className="flex flex-col items-center rounded-2xl bg-white/10 px-6 py-4 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
        >
          <UserPlus className="h-8 w-8 text-white" />
          <span className="mt-2 text-lg font-bold text-white">New Member</span>
          <span className="text-sm text-brand-200">Sign Up</span>
        </button>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm">
          <Waves className="h-14 w-14 text-white" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight">
          Welcome to {settings.poolName}
        </h1>
        <p className="mt-3 text-xl text-brand-200">
          Scan your membership card to get started
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 px-6 py-3 backdrop-blur-sm">
          <CreditCard className="h-6 w-6 text-brand-200" />
          <span className="text-lg font-medium text-brand-100">
            Hold your card near the reader
          </span>
        </div>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row">
          <KioskButton
            variant="secondary"
            size="xl"
            icon={Search}
            onClick={() => goTo("search")}
            className="min-w-[200px] bg-white/10 text-white ring-white/20 hover:bg-white/20 active:bg-white/30"
          >
            Search Account
          </KioskButton>
          <KioskButton
            variant="secondary"
            size="xl"
            icon={UserPlus}
            onClick={() => goTo("guest")}
            className="min-w-[200px] bg-white/10 text-white ring-white/20 hover:bg-white/20 active:bg-white/30"
          >
            Guest Visit
          </KioskButton>
        </div>

        <p className="mt-16 text-sm text-brand-300">
          Need help? Please ask a staff member.
        </p>
      </div>
    </div>
  );
}

import { CreditCard, Lock, Search, UserPlus, Waves } from "lucide-react";
import KioskButton from "../components/KioskButton";

export default function IdleScreen({ goTo, settings }) {
  // Parse kiosk display settings
  const welcomeTitle = (settings.kiosk_welcome_title || "Welcome to {pool_name}")
    .replace("{pool_name}", settings.poolName);
  const welcomeSubtitle = settings.kiosk_welcome_subtitle || "Scan your membership card to get started";
  const cardInstruction = settings.kiosk_card_instruction || "Hold your card near the reader";
  const helpText = settings.kiosk_help_text || "Need help? Please ask a staff member.";

  const isLocked = settings.kiosk_locked === "true";
  const lockMessage = settings.kiosk_lock_message || "Kiosk is currently unavailable. Please see staff.";

  const overlayEnabled = settings.kiosk_overlay_enabled === "true";
  const overlayText = settings.kiosk_overlay_text || "";

  const bgType = settings.kiosk_bg_type || "gradient";
  const bgColor = settings.kiosk_bg_color || "#0284c7";
  const bgImage = settings.kiosk_bg_image || "";
  const bgImageMode = settings.kiosk_bg_image_mode || "cover";

  // Build background style
  const getBackgroundStyle = () => {
    if (bgType === "image" && bgImage) {
      return {
        backgroundImage: `url(${bgImage})`,
        backgroundSize: bgImageMode === "cover" ? "cover" : "auto",
        backgroundPosition: "center",
        backgroundRepeat: bgImageMode === "tile" ? "repeat" : "no-repeat",
      };
    }
    if (bgType === "color") {
      return { backgroundColor: bgColor };
    }
    // Default gradient
    return {};
  };

  const bgStyle = getBackgroundStyle();
  const isCustomBg = bgType !== "gradient";

  // Locked screen
  if (isLocked) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center px-8 text-center text-white ${!isCustomBg ? "bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" : ""}`}
        style={isCustomBg ? bgStyle : {}}
      >
        <div className="rounded-3xl bg-black/30 p-12 backdrop-blur-sm">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
            <Lock className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold">Kiosk Locked</h1>
          <p className="mt-4 text-xl text-gray-300">{lockMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full flex-col px-8 text-white ${!isCustomBg ? "bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900" : ""}`}
      style={isCustomBg ? bgStyle : {}}
    >
      {/* Overlay for custom backgrounds */}
      {isCustomBg && <div className="pointer-events-none absolute inset-0 bg-black/40" />}

      {/* Overlay message */}
      {overlayEnabled && overlayText && (
        <div className="absolute left-0 right-0 top-0 z-20 bg-amber-500 px-4 py-3 text-center">
          <p className="font-semibold text-white">{overlayText}</p>
        </div>
      )}

      {/* Top right - New Member button */}
      <div className="absolute right-6 top-6 z-30">
        <button
          type="button"
          onClick={() => goTo("signup")}
          className="flex cursor-pointer flex-col items-center rounded-2xl bg-white/10 px-6 py-4 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
        >
          <UserPlus className="h-8 w-8 text-white" />
          <span className="mt-2 text-lg font-bold text-white">New Member</span>
          <span className="text-sm text-white/70">Sign Up</span>
        </button>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm">
          <Waves className="h-14 w-14 text-white" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight">
          {welcomeTitle}
        </h1>
        <p className="mt-3 text-xl text-white/80">
          {welcomeSubtitle}
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 px-6 py-3 backdrop-blur-sm">
          <CreditCard className="h-6 w-6 text-white/80" />
          <span className="text-lg font-medium text-white/90">
            {cardInstruction}
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

        <p className="mt-16 text-sm text-white/60">
          {helpText}
        </p>
      </div>
    </div>
  );
}

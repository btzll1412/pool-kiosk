import { CreditCard, Lock, Search, Tag, UserPlus, Waves } from "lucide-react";
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

  const uiScale = settings.kiosk_ui_scale || "normal";
  const s = {
    normal: {
      icon: "h-24 w-24", iconInner: "h-14 w-14", title: "text-5xl", subtitle: "text-xl",
      cardIcon: "h-6 w-6", cardText: "text-lg", cardPad: "px-6 py-3",
      btnIcon: "h-8 w-8", btnLabel: "text-lg", btnSub: "text-sm", btnPad: "px-6 py-4",
      actionIcon: "h-6 w-6", actionText: "text-base", actionPad: "min-w-[200px]",
      help: "text-sm", gap: "mt-12",
    },
    large: {
      icon: "h-32 w-32", iconInner: "h-20 w-20", title: "text-6xl", subtitle: "text-2xl",
      cardIcon: "h-8 w-8", cardText: "text-xl", cardPad: "px-8 py-4",
      btnIcon: "h-10 w-10", btnLabel: "text-xl", btnSub: "text-base", btnPad: "px-8 py-5",
      actionIcon: "h-8 w-8", actionText: "text-lg", actionPad: "min-w-[240px]",
      help: "text-base", gap: "mt-16",
    },
    xlarge: {
      icon: "h-40 w-40", iconInner: "h-24 w-24", title: "text-7xl", subtitle: "text-3xl",
      cardIcon: "h-10 w-10", cardText: "text-2xl", cardPad: "px-10 py-5",
      btnIcon: "h-12 w-12", btnLabel: "text-2xl", btnSub: "text-lg", btnPad: "px-10 py-6",
      actionIcon: "h-10 w-10", actionText: "text-xl", actionPad: "min-w-[280px]",
      help: "text-lg", gap: "mt-20",
    },
  }[uiScale];

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
          className={`flex cursor-pointer flex-col items-center rounded-2xl bg-white/10 ${s.btnPad} backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95`}
        >
          <UserPlus className={`${s.btnIcon} text-white`} />
          <span className={`mt-2 ${s.btnLabel} font-bold text-white`}>New Member</span>
          <span className={`${s.btnSub} text-white/70`}>Sign Up</span>
        </button>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className={`mb-4 flex ${s.icon} items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm`}>
          <Waves className={`${s.iconInner} text-white`} />
        </div>
        <h1 className={`${s.title} font-extrabold tracking-tight`}>
          {welcomeTitle}
        </h1>
        <p className={`mt-3 ${s.subtitle} text-white/80`}>
          {welcomeSubtitle}
        </p>

        <div className={`mt-4 flex items-center gap-3 rounded-2xl bg-white/10 ${s.cardPad} backdrop-blur-sm`}>
          <CreditCard className={`${s.cardIcon} text-white/80`} />
          <span className={`${s.cardText} font-medium text-white/90`}>
            {cardInstruction}
          </span>
        </div>

        <div className={`${s.gap} flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:justify-center`}>
          <KioskButton
            variant="secondary"
            size="xl"
            icon={Search}
            onClick={() => goTo("search")}
            className={`${s.actionPad} bg-white/10 text-white ring-white/20 hover:bg-white/20 active:bg-white/30`}
          >
            <span className={s.actionText}>Search Account</span>
          </KioskButton>
          <KioskButton
            variant="secondary"
            size="xl"
            icon={UserPlus}
            onClick={() => goTo("guest")}
            className={`${s.actionPad} bg-white/10 text-white ring-white/20 hover:bg-white/20 active:bg-white/30`}
          >
            <span className={s.actionText}>Guest Visit</span>
          </KioskButton>
          <KioskButton
            variant="secondary"
            size="xl"
            icon={Tag}
            onClick={() => goTo("viewPlans")}
            className={`${s.actionPad} bg-white/10 text-white ring-white/20 hover:bg-white/20 active:bg-white/30`}
          >
            <span className={s.actionText}>View Plans</span>
          </KioskButton>
        </div>

        <p className={`mt-16 ${s.help} text-white/60`}>
          {helpText}
        </p>
      </div>
    </div>
  );
}

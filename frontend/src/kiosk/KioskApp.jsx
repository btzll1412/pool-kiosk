import { useCallback, useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import RFIDListener from "./components/RFIDListener";
import InactivityTimer from "./components/InactivityTimer";
import ScreenTransition from "./components/ScreenTransition";
import SecretExitTrigger from "./components/SecretExitTrigger";
import { getSettings, scanCard, checkin } from "../api/kiosk";
import IdleScreen from "./screens/IdleScreen";
import MemberScreen from "./screens/MemberScreen";
import CheckinScreen from "./screens/CheckinScreen";
import PaymentScreen from "./screens/PaymentScreen";
import CashScreen from "./screens/CashScreen";
import CardPaymentScreen from "./screens/CardPaymentScreen";
import SearchScreen from "./screens/SearchScreen";
import ChangeScreen from "./screens/ChangeScreen";
import StatusScreen from "./screens/StatusScreen";
import GuestScreen from "./screens/GuestScreen";
import PinScreen from "./screens/PinScreen";
import ManageAccountScreen from "./screens/ManageAccountScreen";
import FreezeScreen from "./screens/FreezeScreen";
import SavedCardsScreen from "./screens/SavedCardsScreen";
import AddCardScreen from "./screens/AddCardScreen";
import AutoChargeScreen from "./screens/AutoChargeScreen";
import SplitPaymentScreen from "./screens/SplitPaymentScreen";
import CreditPartialScreen from "./screens/CreditPartialScreen";
import SignUpScreen from "./screens/SignUpScreen";
import EditProfileScreen from "./screens/EditProfileScreen";
import TerminalPaymentScreen from "./screens/TerminalPaymentScreen";
import ViewPlansScreen from "./screens/ViewPlansScreen";
import AddMoneyScreen from "./screens/AddMoneyScreen";

const SCREENS = {
  idle: IdleScreen,
  member: MemberScreen,
  checkin: CheckinScreen,
  payment: PaymentScreen,
  cash: CashScreen,
  card: CardPaymentScreen,
  split: SplitPaymentScreen,
  creditPartial: CreditPartialScreen,
  search: SearchScreen,
  change: ChangeScreen,
  status: StatusScreen,
  guest: GuestScreen,
  pin: PinScreen,
  manage: ManageAccountScreen,
  freeze: FreezeScreen,
  savedCards: SavedCardsScreen,
  addCard: AddCardScreen,
  autoCharge: AutoChargeScreen,
  signup: SignUpScreen,
  editProfile: EditProfileScreen,
  terminal: TerminalPaymentScreen,
  viewPlans: ViewPlansScreen,
  addMoney: AddMoneyScreen,
};

// Refresh settings every 30 seconds when on idle screen
const SETTINGS_REFRESH_INTERVAL = 30000;
// Check for new version every 30 seconds
const VERSION_CHECK_INTERVAL = 30000;

// Get current bundle version from the page
function getCurrentBundleHash() {
  const scripts = document.querySelectorAll('script[src*="assets/index-"]');
  for (const script of scripts) {
    const match = script.src.match(/index-([A-Za-z0-9]+)\.js/);
    if (match) return match[1];
  }
  return null;
}

export default function KioskApp() {
  const [screen, setScreen] = useState("idle");
  const [member, setMember] = useState(null);
  const [context, setContext] = useState({});
  const [settings, setSettings] = useState({});
  const refreshIntervalRef = useRef(null);
  const versionCheckRef = useRef(null);
  const currentVersionRef = useRef(getCurrentBundleHash());

  // Fetch settings function
  const fetchSettings = useCallback(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Refresh settings periodically when on idle screen
  useEffect(() => {
    if (screen === "idle") {
      // Fetch immediately when returning to idle
      fetchSettings();

      // Set up interval for periodic refresh
      refreshIntervalRef.current = setInterval(() => {
        fetchSettings();
      }, SETTINGS_REFRESH_INTERVAL);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval when not on idle screen
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }
  }, [screen, fetchSettings]);

  // Check for new version and reload only when code changes (on idle screen only)
  useEffect(() => {
    if (screen === "idle") {
      // Check if auto-reload is disabled
      const reloadSeconds = Number(settings.kiosk_reload_interval_seconds);
      if (settings.kiosk_reload_interval_seconds === "0" || settings.kiosk_reload_interval_seconds === 0) {
        return;
      }

      const checkInterval = (reloadSeconds || 30) * 1000;

      versionCheckRef.current = setInterval(async () => {
        try {
          // Fetch the index.html to check for new bundle
          const response = await fetch("/kiosk?_=" + Date.now(), { cache: "no-store" });
          const html = await response.text();

          // Extract bundle hash from fetched HTML
          const match = html.match(/index-([A-Za-z0-9]+)\.js/);
          const newVersion = match ? match[1] : null;

          // Only reload if version actually changed
          if (newVersion && currentVersionRef.current && newVersion !== currentVersionRef.current) {
            window.location.reload();
          }
        } catch {
          // Ignore fetch errors
        }
      }, checkInterval);

      return () => {
        if (versionCheckRef.current) {
          clearInterval(versionCheckRef.current);
          versionCheckRef.current = null;
        }
      };
    } else {
      // Clear interval when not on idle screen
      if (versionCheckRef.current) {
        clearInterval(versionCheckRef.current);
        versionCheckRef.current = null;
      }
    }
  }, [screen, settings.kiosk_reload_interval_seconds]);

  const goTo = useCallback((nextScreen, ctx = {}) => {
    setContext((prev) => ({ ...prev, ...ctx }));
    setScreen(nextScreen);
  }, []);

  const goIdle = useCallback(() => {
    setScreen("idle");
    setMember(null);
    setContext({});
  }, []);

  const handleScan = useCallback(
    async (rfid_uid) => {
      if (screen !== "idle") return;
      try {
        const data = await scanCard(rfid_uid);
        setMember(data);

        // Auto check-in for monthly pass and unlimited members
        if ((data.is_unlimited || data.active_membership?.plan_type === "monthly") && !data.is_frozen) {
          try {
            await checkin(data.member_id, 0);
            goTo("status", {
              statusType: "success",
              statusTitle: `Welcome, ${data.first_name}!`,
              statusMessage: "Checked in successfully. Enjoy your swim!",
            });
          } catch {
            // If check-in fails, go to member screen anyway
            setScreen("member");
          }
        } else {
          // Swim pass, single, or no active plan - go to member screen
          setScreen("member");
        }
      } catch {
        toast.error(`Card ${rfid_uid} not recognized. Please see staff for assistance.`, {
          id: "card-not-found",
        });
      }
    },
    [screen, goTo]
  );

  const Screen = SCREENS[screen] || IdleScreen;
  const isIdle = screen === "idle";
  const timeoutSec = Number(settings.inactivity_timeout_seconds) || 30;
  const warningSec = Number(settings.inactivity_warning_seconds) || 10;
  const returnSec = Number(settings.checkin_return_seconds) || 8;
  const poolName = settings.pool_name || "Pool";
  const currency = settings.currency_symbol || "$";
  const maxGuests = Number(settings.family_max_guests) || 5;

  const staffExitPin = settings.staff_exit_pin || "0000";

  return (
    <SecretExitTrigger staffExitPin={staffExitPin}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
        <RFIDListener onScan={handleScan} disabled={!isIdle} />

      {!isIdle && (
        <InactivityTimer
          key={screen}
          timeoutSeconds={timeoutSec}
          warningSeconds={warningSec}
          onTimeout={goIdle}
        />
      )}

      <ScreenTransition screen={screen}>
        <Screen
          member={member}
          setMember={setMember}
          context={context}
          goTo={goTo}
          goIdle={goIdle}
          settings={{
            poolName,
            currency,
            maxGuests,
            returnSeconds: returnSec,
            ...settings,
          }}
        />
      </ScreenTransition>
      </div>
    </SecretExitTrigger>
  );
}

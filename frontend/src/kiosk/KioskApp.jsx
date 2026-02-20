import { useCallback, useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import RFIDListener from "./components/RFIDListener";
import InactivityTimer from "./components/InactivityTimer";
import ScreenTransition from "./components/ScreenTransition";
import { getSettings, scanCard } from "../api/kiosk";
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
};

// Refresh settings every 30 seconds when on idle screen
const SETTINGS_REFRESH_INTERVAL = 30000;

export default function KioskApp() {
  const [screen, setScreen] = useState("idle");
  const [member, setMember] = useState(null);
  const [context, setContext] = useState({});
  const [settings, setSettings] = useState({});
  const refreshIntervalRef = useRef(null);

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
        setScreen("member");
      } catch {
        toast.error(`Card ${rfid_uid} not recognized. Please see staff for assistance.`, {
          id: "card-not-found",
        });
      }
    },
    [screen]
  );

  const Screen = SCREENS[screen] || IdleScreen;
  const isIdle = screen === "idle";
  const timeoutSec = Number(settings.inactivity_timeout_seconds) || 30;
  const warningSec = Number(settings.inactivity_warning_seconds) || 10;
  const returnSec = Number(settings.checkin_return_seconds) || 8;
  const poolName = settings.pool_name || "Pool";
  const currency = settings.currency_symbol || "$";
  const maxGuests = Number(settings.family_max_guests) || 5;

  return (
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
  );
}

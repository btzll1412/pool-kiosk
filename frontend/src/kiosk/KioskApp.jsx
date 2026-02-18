import { useCallback, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import RFIDListener from "./components/RFIDListener";
import InactivityTimer from "./components/InactivityTimer";
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
import { scanCard } from "../api/kiosk";

const SCREENS = {
  idle: IdleScreen,
  member: MemberScreen,
  checkin: CheckinScreen,
  payment: PaymentScreen,
  cash: CashScreen,
  card: CardPaymentScreen,
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
};

export default function KioskApp() {
  const [screen, setScreen] = useState("idle");
  const [member, setMember] = useState(null);
  const [context, setContext] = useState({});
  const [settings, setSettings] = useState({});

  useEffect(() => {
    import("../api/kiosk").then((mod) =>
      mod.getSettings().then(setSettings).catch(() => {})
    );
  }, []);

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
        // Card not recognized — ignore silently on kiosk
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
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: "1rem",
            padding: "1rem 1.25rem",
            fontSize: "1rem",
            fontWeight: 600,
          },
          success: {
            style: { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
          },
          error: {
            style: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
          },
        }}
      />

      <RFIDListener onScan={handleScan} disabled={!isIdle} />

      {!isIdle && (
        <InactivityTimer
          timeoutSeconds={timeoutSec}
          warningSeconds={warningSec}
          onTimeout={goIdle}
        />
      )}

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
    </div>
  );
}

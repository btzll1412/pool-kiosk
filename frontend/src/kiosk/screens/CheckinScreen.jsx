import { useCallback, useState } from "react";
import { CheckCircle, Minus, Plus } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import AutoReturnBar from "../components/AutoReturnBar";
import { checkin } from "../../api/kiosk";

export default function CheckinScreen({ member, goTo, goIdle, settings }) {
  const [step, setStep] = useState("guests"); // guests | success
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const maxGuests = settings.maxGuests;

  async function handleConfirm() {
    setLoading(true);
    try {
      const data = await checkin(member.member_id, guestCount);
      setResult(data);
      setStep("success");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Check-in failed");
    } finally {
      setLoading(false);
    }
  }

  const handleReturn = useCallback(() => goIdle(), [goIdle]);

  if (step === "success") {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-emerald-50 px-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 animate-checkmark-pop">
          <CheckCircle className="h-16 w-16 text-emerald-600" />
        </div>
        <h1 className="mt-6 text-4xl font-extrabold text-emerald-900">
          Checked In!
        </h1>
        <p className="mt-2 text-xl text-emerald-700">
          {result?.message || "Enjoy your swim!"}
        </p>
        {guestCount > 0 && (
          <p className="mt-1 text-lg text-emerald-600">
            + {guestCount} guest{guestCount !== 1 ? "s" : ""}
          </p>
        )}
        <AutoReturnBar seconds={settings.returnSeconds} onComplete={handleReturn} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-50 px-8 text-center">
      <h1 className="text-3xl font-extrabold text-gray-900">
        Anyone joining you today?
      </h1>
      <p className="mt-2 text-lg text-gray-500">
        Select the number of guests swimming with you
      </p>

      <div className="mt-10 flex items-center gap-8">
        <button
          type="button"
          disabled={guestCount <= 0}
          onClick={() => setGuestCount((c) => c - 1)}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-gray-600 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-30"
        >
          <Minus className="h-8 w-8" />
        </button>
        <div className="w-24 text-center">
          <span className="text-6xl font-extrabold text-gray-900">{guestCount}</span>
          <p className="mt-1 text-sm text-gray-500">
            guest{guestCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={guestCount >= maxGuests}
          onClick={() => setGuestCount((c) => c + 1)}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-gray-600 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-30"
        >
          <Plus className="h-8 w-8" />
        </button>
      </div>

      <div className="mt-10 flex gap-4">
        <KioskButton
          variant="secondary"
          size="xl"
          onClick={() => goTo("member")}
        >
          Back
        </KioskButton>
        <KioskButton
          variant="success"
          size="xl"
          loading={loading}
          onClick={handleConfirm}
          className="min-w-[200px]"
        >
          {guestCount === 0 ? "Check In — Just Me" : `Check In — Me + ${guestCount}`}
        </KioskButton>
      </div>
    </div>
  );
}

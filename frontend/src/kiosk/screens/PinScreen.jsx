import { useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import toast from "react-hot-toast";
import NumPad from "../components/NumPad";
import KioskButton from "../components/KioskButton";
import { unfreezeMembership, verifyPin } from "../../api/kiosk";

export default function PinScreen({ member, goTo, goIdle, context }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const afterPin = context.afterPin || "member";
  const pinLength = 4;

  async function handleSubmit() {
    if (pin.length < pinLength) {
      toast.error(`Enter your ${pinLength}-digit PIN`);
      return;
    }

    setLoading(true);

    if (afterPin === "unfreeze") {
      try {
        await unfreezeMembership(member.member_id, pin);
        goTo("status", {
          statusType: "success",
          statusTitle: "Membership Unfrozen!",
          statusMessage: "Welcome back! Your membership is now active.",
        });
      } catch (err) {
        toast.error(err.response?.data?.detail || "Invalid PIN");
        setPin("");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Verify PIN before navigating to other screens
    try {
      await verifyPin(member.member_id, pin);
      goTo(afterPin, { pin });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("member")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Enter PIN</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <Lock className="h-8 w-8 text-brand-600" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              Enter Your PIN
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {pinLength}-digit PIN required to continue
            </p>
          </div>

          <div className="mb-6 flex justify-center gap-3">
            {Array.from({ length: pinLength }).map((_, i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full transition-all ${
                  i < pin.length ? "bg-brand-600 scale-110" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <NumPad
            value={pin}
            onChange={(val) => setPin(val.slice(0, pinLength))}
            maxLength={pinLength}
          />

          <KioskButton
            variant="primary"
            size="xl"
            loading={loading}
            disabled={pin.length < pinLength}
            onClick={handleSubmit}
            className="mt-6 w-full"
          >
            Continue
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

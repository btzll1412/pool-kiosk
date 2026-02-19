import { useCallback } from "react";
import { CheckCircle, Home } from "lucide-react";
import KioskButton from "../components/KioskButton";
import AutoReturnBar from "../components/AutoReturnBar";

export default function CheckinScreen({ goIdle, context, settings }) {
  const result = context.checkinResult;

  const handleReturn = useCallback(() => goIdle(), [goIdle]);

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

      <AutoReturnBar seconds={settings.returnSeconds} onComplete={handleReturn} />

      <KioskButton
        variant="secondary"
        size="lg"
        icon={Home}
        onClick={handleReturn}
        className="mt-6"
      >
        Return to Home
      </KioskButton>
    </div>
  );
}

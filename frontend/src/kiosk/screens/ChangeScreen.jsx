import { useCallback } from "react";
import { Banknote } from "lucide-react";
import AutoReturnBar from "../components/AutoReturnBar";

export default function ChangeScreen({ goIdle, context, settings }) {
  const changeDue = Number(context.changeDue || 0);
  const handleReturn = useCallback(() => goIdle(), [goIdle]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-amber-50 px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-100">
        <Banknote className="h-14 w-14 text-amber-600" />
      </div>

      <h1 className="mt-6 text-3xl font-extrabold text-amber-900">
        Change Due
      </h1>
      <p className="mt-4 text-5xl font-extrabold text-amber-800">
        {settings.currency}{changeDue.toFixed(2)}
      </p>
      <p className="mt-4 text-xl text-amber-700">
        Place your cash in the box.
      </p>
      <p className="mt-1 text-lg text-amber-600">
        Someone will bring your change shortly.
      </p>

      <AutoReturnBar seconds={settings.returnSeconds} onComplete={handleReturn} />
    </div>
  );
}

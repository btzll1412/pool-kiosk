import { useCallback } from "react";
import { AlertCircle, CheckCircle, Home, Info } from "lucide-react";
import AutoReturnBar from "../components/AutoReturnBar";
import KioskButton from "../components/KioskButton";

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const bgColors = {
  success: "bg-emerald-50",
  error: "bg-red-50",
  info: "bg-brand-50",
};

const iconBg = {
  success: "bg-emerald-100",
  error: "bg-red-100",
  info: "bg-brand-100",
};

const iconColor = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-brand-600",
};

const titleColor = {
  success: "text-emerald-900",
  error: "text-red-900",
  info: "text-brand-900",
};

const msgColor = {
  success: "text-emerald-700",
  error: "text-red-700",
  info: "text-brand-700",
};

export default function StatusScreen({ goIdle, context, settings }) {
  const type = context.statusType || "success";
  const title = context.statusTitle || "Done!";
  const message = context.statusMessage || "";
  const Icon = icons[type] || CheckCircle;

  const handleReturn = useCallback(() => goIdle(), [goIdle]);

  return (
    <div className={`flex h-full flex-col items-center justify-center px-8 text-center ${bgColors[type]}`}>
      <div className={`flex h-24 w-24 items-center justify-center rounded-full ${iconBg[type]}`}>
        <Icon className={`h-16 w-16 ${iconColor[type]}`} />
      </div>

      <h1 className={`mt-6 text-4xl font-extrabold ${titleColor[type]}`}>
        {title}
      </h1>
      {message && (
        <p className={`mt-3 max-w-md text-xl ${msgColor[type]}`}>
          {message}
        </p>
      )}

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

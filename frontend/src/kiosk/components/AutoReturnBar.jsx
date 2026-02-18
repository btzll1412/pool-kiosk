import { useEffect, useState } from "react";

export default function AutoReturnBar({ seconds = 8, onComplete }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= seconds) {
          clearInterval(interval);
          onComplete();
          return seconds;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onComplete]);

  const progress = (elapsed / seconds) * 100;
  const remaining = seconds - elapsed;

  return (
    <div className="mt-6 text-center">
      <p className="text-sm text-gray-400">
        Returning to home in {remaining}s
      </p>
      <div className="mx-auto mt-2 h-1.5 w-64 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

export default function InactivityTimer({
  timeoutSeconds = 30,
  warningSeconds = 10,
  onTimeout,
  disabled = false,
}) {
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSeconds);
  const timeoutRef = useRef(null);
  const warningRef = useRef(null);
  const countdownRef = useRef(null);

  const reset = useCallback(() => {
    setWarning(false);
    setCountdown(warningSeconds);
    clearTimeout(timeoutRef.current);
    clearTimeout(warningRef.current);
    clearInterval(countdownRef.current);

    if (disabled) return;

    timeoutRef.current = setTimeout(() => {
      setWarning(true);
      setCountdown(warningSeconds);
      let remaining = warningSeconds;
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownRef.current);
          onTimeout();
        }
      }, 1000);
    }, timeoutSeconds * 1000);
  }, [timeoutSeconds, warningSeconds, onTimeout, disabled]);

  useEffect(() => {
    reset();
    const events = ["touchstart", "mousedown", "mousemove", "keydown", "scroll"];
    const handler = () => {
      if (!warning) reset();
    };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimeout(timeoutRef.current);
      clearTimeout(warningRef.current);
      clearInterval(countdownRef.current);
    };
  }, [reset, warning]);

  if (!warning || disabled) return null;

  const progress = (countdown / warningSeconds) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <h2 className="text-3xl font-bold text-gray-900">Still Here?</h2>
        <p className="mt-2 text-lg text-gray-500">
          Returning to home in {countdown}s
        </p>
        <div className="mx-auto mt-6 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-6 w-full rounded-2xl bg-brand-600 px-8 py-4 text-xl font-bold text-white shadow-lg transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          I'm Still Here
        </button>
      </div>
    </div>
  );
}

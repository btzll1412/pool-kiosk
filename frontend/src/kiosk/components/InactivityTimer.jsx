import { useEffect, useRef, useState } from "react";

export default function InactivityTimer({
  timeoutSeconds = 30,
  warningSeconds = 10,
  onTimeout,
  disabled = false,
}) {
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSeconds);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const warningRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);

  // Keep refs updated
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  // Main timer logic - only depends on config, not on warning state
  useEffect(() => {
    if (disabled) return;

    console.log("[InactivityTimer] Starting with timeout:", timeoutSeconds, "warning:", warningSeconds);

    const startTimer = () => {
      // Clear any existing timers
      clearTimeout(timeoutRef.current);
      clearInterval(countdownRef.current);

      console.log("[InactivityTimer] Timer started, will fire in", timeoutSeconds, "seconds");

      // Start the inactivity timeout
      timeoutRef.current = setTimeout(() => {
        console.log("[InactivityTimer] Timeout fired! Showing warning dialog");
        setWarning(true);
        warningRef.current = true;
        setCountdown(warningSeconds);

        let remaining = warningSeconds;
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setCountdown(remaining);
          if (remaining <= 0) {
            console.log("[InactivityTimer] Countdown finished, calling onTimeout");
            clearInterval(countdownRef.current);
            onTimeoutRef.current?.();
          }
        }, 1000);
      }, timeoutSeconds * 1000);
    };

    const handleActivity = () => {
      // Only reset if warning is not showing (use ref for current value)
      if (!warningRef.current) {
        console.log("[InactivityTimer] Activity detected, resetting timer");
        startTimer();
      }
    };

    // Start timer immediately
    startTimer();

    // Activity events
    const events = [
      "touchstart",
      "touchend",
      "mousedown",
      "click",
      "pointerdown",
      "keydown",
      "scroll",
      "kiosk-activity",
    ];

    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      console.log("[InactivityTimer] Cleanup");
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearTimeout(timeoutRef.current);
      clearInterval(countdownRef.current);
    };
  }, [timeoutSeconds, warningSeconds, disabled]);

  const handleStillHere = () => {
    console.log("[InactivityTimer] User clicked Still Here");
    setWarning(false);
    warningRef.current = false;
    clearInterval(countdownRef.current);

    // Restart the timer
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      console.log("[InactivityTimer] Timeout fired after Still Here!");
      setWarning(true);
      warningRef.current = true;
      setCountdown(warningSeconds);

      let remaining = warningSeconds;
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownRef.current);
          onTimeoutRef.current?.();
        }
      }, 1000);
    }, timeoutSeconds * 1000);
  };

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
          onClick={handleStillHere}
          className="mt-6 w-full rounded-2xl bg-brand-600 px-8 py-4 text-xl font-bold text-white shadow-lg transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          I'm Still Here
        </button>
      </div>
    </div>
  );
}

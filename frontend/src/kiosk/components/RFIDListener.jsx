import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 2000; // Ignore duplicate scans within 2 seconds

export default function RFIDListener({ onScan, disabled = false }) {
  const buffer = useRef("");
  const timer = useRef(null);
  const lastScan = useRef({ uid: "", time: 0 });

  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key === "Enter") {
        if (buffer.current.length >= 4) {
          const uid = buffer.current.trim();
          const now = Date.now();

          // Debounce: ignore if same card scanned within DEBOUNCE_MS
          if (uid !== lastScan.current.uid || (now - lastScan.current.time) > DEBOUNCE_MS) {
            lastScan.current = { uid, time: now };
            onScan(uid);
          }
        }
        buffer.current = "";
        clearTimeout(timer.current);
        return;
      }

      if (e.key.length === 1) {
        buffer.current += e.key;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          buffer.current = "";
        }, 200);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer.current);
    };
  }, [onScan, disabled]);

  return null;
}

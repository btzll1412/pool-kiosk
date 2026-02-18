import { useEffect, useRef } from "react";

export default function RFIDListener({ onScan, disabled = false }) {
  const buffer = useRef("");
  const timer = useRef(null);

  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key === "Enter") {
        if (buffer.current.length >= 4) {
          onScan(buffer.current.trim());
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

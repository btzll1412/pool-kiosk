import { useEffect, useRef, useCallback } from "react";

/**
 * Hook for capturing magnetic stripe card reader input (keyboard emulation mode).
 * Card readers in keyboard emulation mode type track data very fast, ending with Enter.
 *
 * Track 1 format: %B[card_number]^[name]^[YYMM]...?
 * Track 2 format: ;[card_number]=[YYMM]...?
 *
 * @param {Object} options
 * @param {Function} options.onSwipe - Callback when card is swiped (receives track data string)
 * @param {boolean} options.enabled - Whether to listen for swipes (default: true)
 * @param {number} options.timeout - Max ms between keystrokes before resetting buffer (default: 100)
 * @returns {Object} { listening: boolean }
 */
export default function useCardReader({ onSwipe, enabled = true, timeout = 100 }) {
  const bufferRef = useRef("");
  const timeoutRef = useRef(null);
  const onSwipeRef = useRef(onSwipe);

  // Keep onSwipe ref updated without triggering reconnects
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
  }, []);

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Enter key signals end of card swipe
    if (event.key === "Enter") {
      const data = bufferRef.current;

      // Check if buffer contains track data (starts with % or ;)
      if (data && (data.includes("%B") || data.includes(";"))) {
        event.preventDefault();

        if (onSwipeRef.current) {
          onSwipeRef.current(data);
        }
      }

      resetBuffer();
      return;
    }

    // Ignore modifier keys and special keys
    if (event.key.length > 1 && !event.key.match(/^[%^;=?]$/)) {
      return;
    }

    // Add character to buffer
    bufferRef.current += event.key;

    // Reset buffer after timeout (data coming too slow = not a card reader)
    timeoutRef.current = setTimeout(() => {
      // If buffer doesn't look like track data, clear it
      if (!bufferRef.current.includes("%B") && !bufferRef.current.includes(";")) {
        resetBuffer();
      }
    }, timeout);
  }, [enabled, timeout, resetBuffer]);

  useEffect(() => {
    if (!enabled) {
      resetBuffer();
      return;
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, handleKeyDown, resetBuffer]);

  return { listening: enabled };
}

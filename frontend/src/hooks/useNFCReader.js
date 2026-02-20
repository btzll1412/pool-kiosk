import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook for connecting to the NFC WebSocket to receive card scan events.
 *
 * @param {Object} options
 * @param {Function} options.onScan - Callback when a card is scanned (receives UID)
 * @param {boolean} options.enabled - Whether to connect to the WebSocket (default: true)
 * @returns {Object} { connected: boolean }
 */
export default function useNFCReader({ onScan, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const onScanRef = useRef(onScan);

  // Keep onScan ref updated without triggering reconnects
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/nfc/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 3 seconds if still enabled
      if (enabled) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      // onclose will be called after onerror
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "card_scan" && onScanRef.current) {
          onScanRef.current(data.uid);
        }
      } catch (e) {
        console.error("Failed to parse NFC WebSocket message:", e);
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      // Cleanup on unmount or when disabled
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);

  return { connected };
}

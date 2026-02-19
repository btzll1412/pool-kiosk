import { createContext, useContext, useEffect, useState } from "react";
import { getSettings as getKioskSettings } from "../api/kiosk";

const TimezoneContext = createContext("America/New_York");

export function TimezoneProvider({ children }) {
  const [timezone, setTimezone] = useState("America/New_York");

  useEffect(() => {
    // Use kiosk settings endpoint (no auth required)
    getKioskSettings()
      .then((s) => {
        if (s.timezone) {
          setTimezone(s.timezone);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <TimezoneContext.Provider value={timezone}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}

// Helper function to parse API date as UTC (API returns naive dates that are actually UTC)
export function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  // If the date string doesn't have timezone info, treat it as UTC
  if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
}

// Helper function to format date with timezone
export function formatDate(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  return date.toLocaleDateString("en-US", { timeZone: timezone, ...options });
}

export function formatTime(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  return date.toLocaleTimeString("en-US", { timeZone: timezone, ...options });
}

export function formatDateTime(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  return date.toLocaleString("en-US", { timeZone: timezone, ...options });
}

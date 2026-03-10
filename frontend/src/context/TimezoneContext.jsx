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
      .catch((err) => {
        console.warn("Failed to load timezone setting, using default:", err.message || err);
      });
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
// Default format: MM/DD/YYYY
export function formatDate(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  // Default to numeric MM/DD/YYYY format
  const defaultOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: timezone,
  };
  return date.toLocaleDateString("en-US", { ...defaultOptions, ...options });
}

export function formatTime(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  return date.toLocaleTimeString("en-US", { timeZone: timezone, ...options });
}

export function formatDateTime(dateStr, timezone, options = {}) {
  const date = parseUTCDate(dateStr);
  if (!date) return '';
  // Default to numeric MM/DD/YYYY format with time
  const defaultOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  };
  return date.toLocaleString("en-US", { ...defaultOptions, ...options });
}

// Get today's date string (YYYY-MM-DD) in the configured timezone
export function getTodayDate(timezone) {
  const now = new Date();
  // Format as YYYY-MM-DD in the specified timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${year}-${month}-${day}`;
}

// Get start of week date string (YYYY-MM-DD) in the configured timezone
export function getStartOfWeekDate(timezone) {
  const now = new Date();
  // Get current day of week in timezone (0=Sunday)
  const dayOfWeek = parseInt(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now).charAt(0) === "S" ?
    (new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "narrow" }).format(now) === "S" ? 0 : 6) :
    ["M","T","W","T","F","S"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "narrow" }).format(now)) + 1, 10);

  // Simpler approach: get today in timezone, then subtract days
  const today = getTodayDate(timezone);
  const todayDate = new Date(today + "T12:00:00"); // noon to avoid DST issues
  const day = todayDate.getDay(); // 0=Sunday
  todayDate.setDate(todayDate.getDate() - day);
  return todayDate.toISOString().split("T")[0];
}

// Get start of month date string (YYYY-MM-DD) in the configured timezone
export function getStartOfMonthDate(timezone) {
  const today = getTodayDate(timezone);
  return today.slice(0, 8) + "01";
}

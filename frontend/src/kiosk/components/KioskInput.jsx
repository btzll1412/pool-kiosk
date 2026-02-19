import { useState, useRef } from "react";
import VirtualKeyboard from "./VirtualKeyboard";
import NumPad from "./NumPad";

// Dispatch custom activity event to reset inactivity timer
const signalActivity = () => {
  window.dispatchEvent(new CustomEvent("kiosk-activity"));
};

export default function KioskInput({
  type = "text",
  value,
  onChange,
  placeholder,
  className = "",
  maxLength,
  icon: Icon,
  label,
  numeric = false,
  showDecimal = false,
  autoFocus = false,
}) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const inputRef = useRef(null);

  const handleFocus = () => {
    signalActivity();
    setShowKeyboard(true);
  };

  const handleVirtualChange = (newValue) => {
    onChange({ target: { value: newValue } });
  };

  const handlePhysicalChange = (e) => {
    signalActivity();
    onChange(e);
  };

  const handleClose = () => {
    signalActivity();
    setShowKeyboard(false);
    // Keep focus on input for continued physical typing
    inputRef.current?.blur();
  };

  const isNumeric = numeric || type === "tel" || type === "number";

  return (
    <>
      <div className="relative">
        {label && (
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handlePhysicalChange}
            onFocus={handleFocus}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus={autoFocus}
            className={`w-full rounded-2xl border-0 bg-white py-4 text-lg font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 ${Icon ? "pl-12 pr-4" : "px-4"} ${className}`}
          />
        </div>
      </div>

      {showKeyboard && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={handleClose}
            onTouchStart={signalActivity}
          />

          {isNumeric ? (
            <NumPad
              value={value}
              onChange={handleVirtualChange}
              onClose={handleClose}
              maxLength={maxLength}
              showDecimal={showDecimal}
            />
          ) : (
            <VirtualKeyboard
              value={value}
              onChange={handleVirtualChange}
              onClose={handleClose}
            />
          )}
        </>
      )}
    </>
  );
}

import { useState } from "react";
import VirtualKeyboard from "./VirtualKeyboard";
import NumPad from "./NumPad";

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

  const handleFocus = () => {
    setShowKeyboard(true);
  };

  const handleChange = (newValue) => {
    onChange({ target: { value: newValue } });
  };

  const handleClose = () => {
    setShowKeyboard(false);
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
            type="text"
            inputMode="none"
            value={value}
            readOnly
            onFocus={handleFocus}
            onClick={handleFocus}
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
          />

          {isNumeric ? (
            <NumPad
              value={value}
              onChange={handleChange}
              onClose={handleClose}
              maxLength={maxLength}
              showDecimal={showDecimal}
            />
          ) : (
            <VirtualKeyboard
              value={value}
              onChange={handleChange}
              onClose={handleClose}
            />
          )}
        </>
      )}
    </>
  );
}

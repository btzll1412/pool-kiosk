import { Delete } from "lucide-react";

export default function NumPad({ value, onChange, maxLength = 10, showDot = false }) {
  function press(digit) {
    if (showDot && digit === "." && value.includes(".")) return;
    if (showDot && value.includes(".")) {
      const [, dec] = value.split(".");
      if (dec && dec.length >= 2) return;
    }
    if (value.length >= maxLength) return;
    onChange(value + digit);
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  function clear() {
    onChange("");
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", showDot ? "." : "C", "0", "DEL"];

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === "DEL") backspace();
            else if (key === "C") clear();
            else press(key);
          }}
          className={`flex h-16 items-center justify-center rounded-xl text-2xl font-semibold transition-all active:scale-95
            ${key === "DEL"
              ? "bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200"
              : key === "C"
                ? "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300"
                : "bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50 active:bg-gray-100"
            }`}
        >
          {key === "DEL" ? <Delete className="h-6 w-6" /> : key}
        </button>
      ))}
    </div>
  );
}

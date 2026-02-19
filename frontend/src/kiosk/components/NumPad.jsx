import { X } from "lucide-react";

// Dispatch custom activity event to reset inactivity timer
const signalActivity = () => {
  window.dispatchEvent(new CustomEvent("kiosk-activity"));
};

export default function NumPad({ value, onChange, onClose, maxLength, showDecimal = false }) {
  const isModal = Boolean(onClose);

  const handlePress = (digit) => {
    signalActivity();
    if (maxLength && value.length >= maxLength) return;
    onChange(value + digit);
  };

  const handleBackspace = () => {
    signalActivity();
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    signalActivity();
    onChange("");
  };

  const Button = ({ children, onClick, className = "" }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-16 w-full items-center justify-center rounded-xl text-2xl font-semibold transition-all active:scale-95 ${className}`}
    >
      {children}
    </button>
  );

  const numPadContent = (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <Button
            key={digit}
            onClick={() => handlePress(String(digit))}
            className="bg-gray-100 text-gray-900 hover:bg-gray-200"
          >
            {digit}
          </Button>
        ))}

        {showDecimal ? (
          <Button
            onClick={() => {
              if (!value.includes(".")) {
                onChange(value ? value + "." : "0.");
              }
            }}
            className="bg-gray-100 text-gray-900 hover:bg-gray-200"
          >
            .
          </Button>
        ) : (
          <Button
            onClick={handleClear}
            className="bg-gray-200 text-gray-700 hover:bg-gray-300 text-base"
          >
            Clear
          </Button>
        )}

        <Button
          onClick={() => handlePress("0")}
          className="bg-gray-100 text-gray-900 hover:bg-gray-200"
        >
          0
        </Button>

        <Button
          onClick={handleBackspace}
          className="bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          ⌫
        </Button>
      </div>
    </>
  );

  // Inline mode (no modal)
  if (!isModal) {
    return <div className="w-full max-w-xs mx-auto">{numPadContent}</div>;
  }

  // Modal mode
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white p-4 shadow-2xl border-t border-gray-200">
      <div className="mx-auto max-w-sm">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {numPadContent}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-brand-600 py-4 text-lg font-semibold text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

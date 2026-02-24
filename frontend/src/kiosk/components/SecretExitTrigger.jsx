import { useState, useRef, useCallback } from "react";
import { X } from "lucide-react";

export default function SecretExitTrigger({ staffExitPin = "0000", children }) {
  const [showModal, setShowModal] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const tapTimesRef = useRef([]);
  const TAP_COUNT = 5;
  const TAP_WINDOW = 3000; // 3 seconds

  const handleCornerTap = useCallback(() => {
    const now = Date.now();

    // Filter out taps older than TAP_WINDOW
    tapTimesRef.current = tapTimesRef.current.filter(t => now - t < TAP_WINDOW);
    tapTimesRef.current.push(now);

    if (tapTimesRef.current.length >= TAP_COUNT) {
      // Triggered!
      tapTimesRef.current = [];
      setShowModal(true);
      setPin("");
      setError("");
      setAttempts(0);
    }
  }, []);

  const handleNumPadPress = (digit) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");

      // Auto-submit when PIN length matches
      if (newPin.length === staffExitPin.length) {
        setTimeout(() => checkPin(newPin), 100);
      }
    }
  };

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const checkPin = (enteredPin) => {
    if (enteredPin === staffExitPin) {
      // Correct PIN - show exit options
      setError("");
    } else {
      // Wrong PIN
      setAttempts(a => a + 1);
      setError("Incorrect PIN");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin("");

      if (attempts + 1 >= 3) {
        // Close modal after 3 failed attempts
        setTimeout(() => {
          setShowModal(false);
          setAttempts(0);
        }, 1000);
      }
    }
  };

  const handleExit = () => {
    // Try multiple exit methods
    try {
      window.close();
    } catch (e) {}

    // Fallback
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  };

  const handleCancel = () => {
    setShowModal(false);
    setPin("");
    setError("");
    setAttempts(0);
  };

  const isPinCorrect = pin === staffExitPin && pin.length > 0;

  return (
    <>
      {children}

      {/* Invisible corner tap zone */}
      <div
        onClick={handleCornerTap}
        className="fixed bottom-0 left-0 w-[60px] h-[60px] z-[9999]"
        style={{ touchAction: "manipulation" }}
      />

      {/* PIN Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/95"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Staff Access</h2>
              <button
                onClick={handleCancel}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {!isPinCorrect ? (
              <>
                {/* PIN Display */}
                <div className={`flex justify-center gap-3 mb-6 ${shake ? "animate-shake" : ""}`}>
                  {Array.from({ length: staffExitPin.length }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full ${
                        i < pin.length ? "bg-brand-600" : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>

                {/* Error Message */}
                {error && (
                  <p className="text-center text-red-500 text-sm font-medium mb-4">
                    {error}
                  </p>
                )}

                {/* NumPad */}
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleNumPadPress(String(digit))}
                      className="h-16 rounded-xl bg-gray-100 text-2xl font-semibold text-gray-900 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={handleClear}
                    className="h-16 rounded-xl bg-gray-100 text-sm font-medium text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => handleNumPadPress("0")}
                    className="h-16 rounded-xl bg-gray-100 text-2xl font-semibold text-gray-900 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    className="h-16 rounded-xl bg-gray-100 text-sm font-medium text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                  >
                    ←
                  </button>
                </div>
              </>
            ) : (
              /* Exit Options */
              <div className="space-y-4">
                <button
                  onClick={handleExit}
                  className="w-full py-4 rounded-xl bg-red-600 text-white text-lg font-semibold hover:bg-red-700 active:scale-[0.98] transition-all"
                >
                  Exit Kiosk
                </button>
                <button
                  onClick={handleCancel}
                  className="w-full py-4 rounded-xl bg-gray-100 text-gray-700 text-lg font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </>
  );
}

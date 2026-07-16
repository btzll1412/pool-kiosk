import { useState } from "react";
import { ArrowLeft, CreditCard, Check, Keyboard } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { tokenizeAndSaveCard, tokenizeCardFromFull } from "../../api/kiosk";

const CARD_BRANDS = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "Amex" },
  { value: "Discover", label: "Discover" },
];

export default function AddCardScreen({ member, goTo, context }) {
  const pin = context.pin;
  const [step, setStep] = useState("choose"); // choose | manual | name | saving | done
  const [cardLast4, setCardLast4] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expDate, setExpDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardBrand, setCardBrand] = useState("Visa");
  const [friendlyName, setFriendlyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isManualCard, setIsManualCard] = useState(false);

  async function simulateCardRead() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    setCardLast4(last4);
    setIsManualCard(false);
    setLoading(false);
    setStep("name");
  }

  function formatExpiry(val) {
    const digits = val.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + "/" + digits.slice(2, 4);
  }

  function detectBrand(num) {
    const d = num.replace(/\D/g, "");
    if (d.startsWith("4")) return "Visa";
    if (d.startsWith("5")) return "Mastercard";
    if (d.startsWith("34") || d.startsWith("37")) return "Amex";
    if (d.startsWith("6")) return "Discover";
    return "Visa";
  }

  function handleManualContinue() {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 13) {
      toast.error("Please enter a valid card number");
      return;
    }
    const expDigits = expDate.replace(/\D/g, "");
    if (expDigits.length !== 4) {
      toast.error("Please enter expiry as MM/YY");
      return;
    }
    const month = parseInt(expDigits.slice(0, 2), 10);
    if (month < 1 || month > 12) {
      toast.error("Invalid expiry month");
      return;
    }
    setCardLast4(digits.slice(-4));
    setCardBrand(detectBrand(digits));
    setIsManualCard(true);
    setStep("name");
  }

  async function handleSave() {
    setStep("saving");
    try {
      if (isManualCard) {
        // Use full tokenization with payment processor
        await tokenizeCardFromFull(
          cardNumber.replace(/\D/g, ""),
          expDate.replace(/\D/g, ""),
          member.member_id,
          pin,
          friendlyName.trim() || null,
          cvv,
        );
      } else {
        // Card reader flow - just save last4 and brand
        await tokenizeAndSaveCard(
          member.member_id,
          pin,
          cardLast4,
          cardBrand,
          friendlyName.trim() || null,
        );
      }
      setStep("done");
      toast.success("Card saved successfully");
      setTimeout(() => goTo("savedCards", { pin }), 1500);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save card");
      setStep("name");
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("savedCards", { pin })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Add Card</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-md text-center">
          {step === "choose" && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50">
                <CreditCard className="h-10 w-10 text-brand-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Add a Payment Card
              </h2>
              <p className="mt-3 text-lg text-gray-500">
                Use the card reader or enter your card details manually
              </p>
              <KioskButton
                variant="primary"
                size="xl"
                icon={CreditCard}
                loading={loading}
                onClick={simulateCardRead}
                className="mt-8 w-full"
              >
                {loading ? "Reading Card..." : "Use Card Reader"}
              </KioskButton>
              <KioskButton
                variant="secondary"
                size="xl"
                icon={Keyboard}
                onClick={() => setStep("manual")}
                className="mt-3 w-full"
              >
                Enter Card Manually
              </KioskButton>
            </>
          )}

          {step === "manual" && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50">
                <Keyboard className="h-10 w-10 text-brand-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Enter Card Details
              </h2>

              <div className="mt-6 space-y-4 text-left">
                <KioskInput
                  label="Card Number"
                  numeric
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Card number"
                  maxLength={19}
                  inputId="card-number"
                />
                <div className="grid grid-cols-3 gap-3">
                  <KioskInput
                    label="Expiry (MM/YY)"
                    numeric
                    value={expDate}
                    onChange={(e) => setExpDate(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    inputId="card-expiry"
                  />
                  <KioskInput
                    label="CVV"
                    numeric
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    placeholder="123"
                    maxLength={4}
                    inputId="card-cvv"
                  />
                  <KioskInput
                    label="Name (optional)"
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                    placeholder="e.g. My Visa"
                    inputId="card-name"
                  />
                </div>
              </div>

              <KioskButton
                variant="primary"
                size="xl"
                icon={Check}
                onClick={handleManualContinue}
                className="mt-6 w-full"
              >
                Save Card
              </KioskButton>
              <button
                type="button"
                onClick={() => { setStep("choose"); setCardNumber(""); setExpDate(""); setCvv(""); }}
                className="mt-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
            </>
          )}

          {step === "name" && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
                <Check className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Card Read Successfully
              </h2>
              <p className="mt-2 text-gray-500">**** **** **** {cardLast4}</p>

              <div className="mt-6 space-y-4 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Card Brand
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {CARD_BRANDS.map((b) => (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => setCardBrand(b.value)}
                        className={`rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                          cardBrand === b.value
                            ? "bg-brand-600 text-white ring-2 ring-brand-600"
                            : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Friendly Name (optional)
                  </label>
                  <input
                    type="text"
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                    placeholder={`${cardBrand} ending ${cardLast4}`}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <KioskButton
                variant="success"
                size="xl"
                icon={Check}
                onClick={handleSave}
                className="mt-6 w-full"
              >
                Save Card
              </KioskButton>
            </>
          )}

          {step === "saving" && (
            <>
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-brand-600" />
              <p className="mt-6 text-lg text-gray-500">Saving card...</p>
            </>
          )}

          {step === "done" && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
                <Check className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Card Saved!
              </h2>
              <p className="mt-2 text-gray-500">
                Returning to your saved cards...
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

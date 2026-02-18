import { useState } from "react";
import { ArrowLeft, CreditCard, Check } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import { tokenizeAndSaveCard } from "../../api/kiosk";

const CARD_BRANDS = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Amex", label: "Amex" },
  { value: "Discover", label: "Discover" },
];

export default function AddCardScreen({ member, goTo, context }) {
  const pin = context.pin;
  const [step, setStep] = useState("read"); // read | name | saving | done
  const [cardLast4, setCardLast4] = useState("");
  const [cardBrand, setCardBrand] = useState("Visa");
  const [friendlyName, setFriendlyName] = useState("");
  const [loading, setLoading] = useState(false);

  async function simulateCardRead() {
    setLoading(true);
    // Simulate a brief delay for card reader
    await new Promise((r) => setTimeout(r, 1500));
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    setCardLast4(last4);
    setLoading(false);
    setStep("name");
  }

  async function handleSave() {
    setStep("saving");
    try {
      await tokenizeAndSaveCard(
        member.member_id,
        pin,
        cardLast4,
        cardBrand,
        friendlyName.trim() || null,
      );
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

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          {step === "read" && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50">
                <CreditCard className="h-10 w-10 text-brand-600" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Add a Payment Card
              </h2>
              <p className="mt-3 text-lg text-gray-500">
                Tap or insert your card on the reader to save it for future payments
              </p>
              <KioskButton
                variant="primary"
                size="xl"
                icon={CreditCard}
                loading={loading}
                onClick={simulateCardRead}
                className="mt-8 w-full"
              >
                {loading ? "Reading Card..." : "Read Card"}
              </KioskButton>
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

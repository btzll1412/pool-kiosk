import { useEffect, useState } from "react";
import { ArrowLeft, Banknote, CreditCard, Star } from "lucide-react";
import toast from "react-hot-toast";
import NumPad from "../components/NumPad";
import KioskButton from "../components/KioskButton";
import { getSavedCards, paySplit } from "../../api/kiosk";

export default function SplitPaymentScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const price = Number(plan?.price || 0);

  const [cashAmount, setCashAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState(null);

  const cashNum = parseFloat(cashAmount) || 0;
  const cardAmount = Math.max(0, price - cashNum);
  const isValid = cashNum > 0 && cashNum < price;

  useEffect(() => {
    getSavedCards(member.member_id, pin)
      .then((cards) => {
        setSavedCards(cards);
        const def = cards.find((c) => c.is_default);
        if (def) setSelectedCardId(def.id);
        else if (cards.length > 0) setSelectedCardId(cards[0].id);
      })
      .catch((err) => console.warn("Failed to load saved cards:", err.response?.data?.detail || err.message))
      .finally(() => setCardsLoading(false));
  }, []);

  async function handlePay() {
    if (!isValid) {
      toast.error("Enter a cash amount less than the total");
      return;
    }

    setLoading(true);
    try {
      const data = await paySplit(
        member.member_id,
        plan.id,
        cashNum,
        pin,
        selectedCardId,
      );
      goTo("status", {
        statusType: "success",
        statusTitle: "Payment Complete!",
        statusMessage:
          data.message ||
          `Split: ${settings.currency}${cashNum.toFixed(2)} cash + ${settings.currency}${cardAmount.toFixed(2)} card.`,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  if (!plan) {
    goTo("payment");
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("payment")}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Split Payment</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-lg">
          {/* Price breakdown */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <p className="text-center text-sm text-gray-500">{plan.name}</p>
            <p className="mt-1 text-center text-3xl font-extrabold text-gray-900">
              {settings.currency}{price.toFixed(2)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  <Banknote className="h-3.5 w-3.5" /> Cash
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {settings.currency}{cashNum.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600">
                  <CreditCard className="h-3.5 w-3.5" /> Card
                </div>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {settings.currency}{cardAmount.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Cash amount numpad */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Enter Cash Amount
            </h3>
            <NumPad value={cashAmount} onChange={setCashAmount} maxLength={7} showDecimal />
          </div>

          {/* Saved card selector */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Card for Remainder
            </h3>
            {cardsLoading ? (
              <div className="flex h-16 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
              </div>
            ) : savedCards.length > 0 ? (
              <div className="space-y-2">
                {savedCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all ${
                      selectedCardId === card.id
                        ? "bg-brand-50 ring-2 ring-brand-600"
                        : "bg-white ring-1 ring-gray-100 hover:ring-gray-200"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                      <CreditCard className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">
                        {card.friendly_name || `Card ending ${card.card_last4}`}
                      </p>
                      <p className="text-sm text-gray-500">**** {card.card_last4}</p>
                    </div>
                    {card.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-4 text-center ring-1 ring-gray-100">
                <p className="text-sm text-gray-500">
                  No saved cards — new card will be used
                </p>
              </div>
            )}
          </div>

          {/* Pay button */}
          <KioskButton
            variant="primary"
            size="xl"
            icon={CreditCard}
            loading={loading}
            disabled={!isValid}
            onClick={handlePay}
            className="mt-6 w-full"
          >
            Confirm Split Payment
          </KioskButton>

          <KioskButton
            variant="ghost"
            size="lg"
            onClick={() => goTo("payment")}
            className="mt-3 w-full"
          >
            Cancel
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

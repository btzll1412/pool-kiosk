import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Star } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import { getSavedCards, payCard } from "../../api/kiosk";

const CARD_BRANDS = ["Visa", "Mastercard", "Amex", "Discover"];

export default function CardPaymentScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const useCredit = context.useCredit || false;
  const creditAmount = Number(context.creditAmount || 0);
  // Use pro-rated price for monthly plans, otherwise full price
  const fullPrice = Number(plan?.price || 0);
  const proratedPrice = plan?.prorated ? Number(plan.prorated.prorated_price) : fullPrice;
  const originalPrice = proratedPrice;
  const price = useCredit ? Number(context.adjustedPrice || originalPrice) : originalPrice;
  const isProrated = plan?.prorated && proratedPrice < fullPrice;
  const [loading, setLoading] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveNewCard, setSaveNewCard] = useState(false);
  const [cardLast4, setCardLast4] = useState("");
  const [cardBrand, setCardBrand] = useState("Visa");

  useEffect(() => {
    getSavedCards(member.member_id, pin)
      .then((cards) => {
        setSavedCards(cards);
        const def = cards.find((c) => c.is_default);
        if (def) setSelectedCardId(def.id);
        else if (cards.length > 0) setSelectedCardId(cards[0].id);
        else setUseNewCard(true);
      })
      .catch(() => setUseNewCard(true))
      .finally(() => setCardsLoading(false));
  }, []);

  async function handlePay() {
    if (useNewCard && saveNewCard) {
      if (cardLast4.length !== 4 || !/^\d{4}$/.test(cardLast4)) {
        toast.error("Enter the last 4 digits of your card");
        return;
      }
    }
    setLoading(true);
    try {
      const opts = useNewCard
        ? { save_card: saveNewCard, card_last4: saveNewCard ? cardLast4 : null, card_brand: saveNewCard ? cardBrand : null, use_credit: useCredit }
        : { saved_card_id: selectedCardId, use_credit: useCredit };

      const data = await payCard(member.member_id, plan.id, pin, opts);

      let message = data.message || "Card payment processed successfully.";
      if (data.credit_used > 0) {
        message = `${settings.currency}${Number(data.credit_used).toFixed(2)} credit applied. ` + message;
      }

      goTo("status", {
        statusType: "success",
        statusTitle: "Payment Complete!",
        statusMessage: message,
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
        <h1 className="text-lg font-bold text-gray-900">Card Payment</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-md">
          {/* Amount */}
          <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">{plan.name}</p>
            {isProrated && (
              <>
                <p className="mt-1 text-lg text-gray-400 line-through">
                  {settings.currency}{fullPrice.toFixed(2)}/mo
                </p>
                <p className="text-sm text-blue-600 font-medium">
                  Pro-rated for {plan.prorated.days_remaining} days
                </p>
              </>
            )}
            {useCredit && creditAmount > 0 ? (
              <>
                {!isProrated && (
                  <p className="mt-1 text-lg text-gray-400 line-through">
                    {settings.currency}{originalPrice.toFixed(2)}
                  </p>
                )}
                <p className="text-sm text-emerald-600 font-medium">
                  -{settings.currency}{creditAmount.toFixed(2)} credit applied
                </p>
                <p className="mt-1 text-4xl font-extrabold text-gray-900">
                  {settings.currency}{price.toFixed(2)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-4xl font-extrabold text-gray-900">
                {settings.currency}{price.toFixed(2)}
              </p>
            )}
          </div>

          {/* Saved Cards */}
          {cardsLoading ? (
            <div className="mt-6 flex h-20 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
            </div>
          ) : savedCards.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Pay With Saved Card
              </h3>
              <div className="space-y-2">
                {savedCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setSelectedCardId(card.id);
                      setUseNewCard(false);
                    }}
                    className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all ${
                      !useNewCard && selectedCardId === card.id
                        ? "bg-brand-50 ring-2 ring-brand-600"
                        : "bg-white ring-1 ring-gray-100 hover:ring-gray-200"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                      <CreditCard className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {card.friendly_name || `Card ending ${card.card_last4}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        **** {card.card_last4}
                      </p>
                    </div>
                    {card.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Use new card option */}
              <button
                type="button"
                onClick={() => setUseNewCard(true)}
                className={`mt-2 flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all ${
                  useNewCard
                    ? "bg-brand-50 ring-2 ring-brand-600"
                    : "bg-white ring-1 ring-gray-100 hover:ring-gray-200"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                  <CreditCard className="h-5 w-5 text-gray-500" />
                </div>
                <p className="font-medium text-gray-900">Use New Card</p>
              </button>
            </div>
          )}

          {/* Save new card toggle and details */}
          {useNewCard && (
            <div className="mt-4 space-y-3">
              {savedCards.length === 0 && (
                <p className="text-center text-lg text-gray-500">
                  Tap or insert your card when prompted
                </p>
              )}
              <label className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewCard}
                  onChange={(e) => setSaveNewCard(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium text-gray-700">
                  Save this card for future payments
                </span>
              </label>

              {saveNewCard && (
                <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-100 space-y-3">
                  <p className="text-sm text-gray-500">
                    Enter your card details to save for future use
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last 4 Digits
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={cardLast4}
                      onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ""))}
                      placeholder="1234"
                      className="w-full rounded-xl border-0 bg-gray-50 py-3 px-4 text-lg font-medium text-gray-900 ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Card Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CARD_BRANDS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setCardBrand(brand)}
                          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                            cardBrand === brand
                              ? "bg-brand-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pay button */}
          <KioskButton
            variant="primary"
            size="xl"
            icon={CreditCard}
            loading={loading}
            onClick={handlePay}
            className="mt-6 w-full"
          >
            {useNewCard ? "Process Payment" : "Pay with Saved Card"}
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

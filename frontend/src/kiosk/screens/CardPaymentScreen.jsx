import { useEffect, useState, useRef } from "react";
import { ArrowLeft, CreditCard, Keyboard, Star, CheckSquare, Square, Delete } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import { getSavedCards, payCard, payCardManual, tokenizeCardFromSwipe } from "../../api/kiosk";

// Compact number pad
function NumberPad({ onKey, onBackspace, onClear }) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["clear", "0", "back"],
  ];

  return (
    <div className="grid grid-cols-3 gap-2 p-3 bg-gray-100 rounded-xl">
      {keys.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === "back") onBackspace();
            else if (key === "clear") onClear();
            else onKey(key);
          }}
          className={`h-12 rounded-lg text-xl font-bold transition-all active:scale-95 ${
            key === "back"
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : key === "clear"
              ? "bg-red-100 text-red-700 hover:bg-red-200 text-sm"
              : "bg-white text-gray-900 hover:bg-gray-50 shadow-sm"
          }`}
        >
          {key === "back" ? <Delete className="h-5 w-5 mx-auto" /> : key === "clear" ? "Clear" : key}
        </button>
      ))}
    </div>
  );
}

export default function CardPaymentScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const useCredit = context.useCredit || false;
  const creditAmount = Number(context.creditAmount || 0);
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

  const [manualEntryChecked, setManualEntryChecked] = useState(false);
  const [manualCardNumber, setManualCardNumber] = useState("");
  const [manualExpMonth, setManualExpMonth] = useState("");
  const [manualExpYear, setManualExpYear] = useState("");
  const [manualCvv, setManualCvv] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [activeField, setActiveField] = useState(null);

  const [swipeData, setSwipeData] = useState("");
  const [swipeStatus, setSwipeStatus] = useState("waiting");
  const swipeInputRef = useRef(null);

  useEffect(() => {
    getSavedCards(member.member_id, pin)
      .then((cards) => {
        setSavedCards(cards);
        const def = cards.find((c) => c.is_default);
        if (def) setSelectedCardId(def.id);
        else if (cards.length > 0) setSelectedCardId(cards[0].id);
        else setUseNewCard(true);
      })
      .catch(() => {
        setSavedCards([]);
        setUseNewCard(true);
      })
      .finally(() => setCardsLoading(false));
  }, []);

  useEffect(() => {
    if (useNewCard && !manualEntryChecked && swipeInputRef.current) {
      swipeInputRef.current.focus();
    }
  }, [useNewCard, manualEntryChecked]);

  function handleNumPadKey(key) {
    if (activeField === "card") {
      if (manualCardNumber.replace(/\s/g, "").length < 19) {
        const newValue = manualCardNumber.replace(/\s/g, "") + key;
        setManualCardNumber(formatCardNumber(newValue));
      }
    } else if (activeField === "cvv") {
      if (manualCvv.length < 4) {
        setManualCvv(manualCvv + key);
      }
    } else if (activeField === "month") {
      if (manualExpMonth.length < 2) {
        const newMonth = manualExpMonth + key;
        if (newMonth.length === 2) {
          const monthNum = parseInt(newMonth, 10);
          if (monthNum >= 1 && monthNum <= 12) {
            setManualExpMonth(newMonth);
            setActiveField("year");
          } else {
            toast.error("Month must be 01-12");
          }
        } else {
          setManualExpMonth(newMonth);
        }
      }
    } else if (activeField === "year") {
      if (manualExpYear.length < 2) {
        const newYear = manualExpYear + key;
        setManualExpYear(newYear);
        if (newYear.length === 2) {
          setActiveField("cvv");
        }
      }
    }
  }

  function handleNumPadBackspace() {
    if (activeField === "card") {
      const digits = manualCardNumber.replace(/\s/g, "");
      setManualCardNumber(formatCardNumber(digits.slice(0, -1)));
    } else if (activeField === "cvv") {
      setManualCvv(manualCvv.slice(0, -1));
    } else if (activeField === "month") {
      setManualExpMonth(manualExpMonth.slice(0, -1));
    } else if (activeField === "year") {
      setManualExpYear(manualExpYear.slice(0, -1));
    }
  }

  function handleNumPadClear() {
    if (activeField === "card") setManualCardNumber("");
    else if (activeField === "cvv") setManualCvv("");
    else if (activeField === "month") setManualExpMonth("");
    else if (activeField === "year") setManualExpYear("");
  }

  function handleSwipeInput(e) {
    const value = e.target.value;
    setSwipeData(value);
    if ((value.startsWith("%") || value.startsWith(";")) && value.includes("?")) {
      processSwipe(value);
    }
  }

  async function processSwipe(trackData) {
    setSwipeStatus("processing");
    setLoading(true);
    try {
      const tokenResult = await tokenizeCardFromSwipe(trackData, member.member_id, pin, saveCard ? "Swiped Card" : null);
      if (!tokenResult.success) {
        toast.error(tokenResult.message || "Failed to read card");
        setSwipeStatus("error");
        setSwipeData("");
        setLoading(false);
        return;
      }
      const payResult = await payCard(member.member_id, plan.id, pin, {
        saved_card_id: tokenResult.card_id,
        use_credit: useCredit,
      });
      let message = payResult.message || "Card payment processed successfully.";
      if (payResult.credit_used > 0) {
        message = `${settings.currency}${Number(payResult.credit_used).toFixed(2)} credit applied. ` + message;
      }
      goTo("status", { statusType: "success", statusTitle: "Payment Complete!", statusMessage: message });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
      setSwipeStatus("error");
      setSwipeData("");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavedCardPay() {
    if (!selectedCardId) {
      toast.error("Please select a card");
      return;
    }
    setLoading(true);
    try {
      const data = await payCard(member.member_id, plan.id, pin, {
        saved_card_id: selectedCardId,
        use_credit: useCredit,
      });
      let message = data.message || "Card payment processed successfully.";
      if (data.credit_used > 0) {
        message = `${settings.currency}${Number(data.credit_used).toFixed(2)} credit applied. ` + message;
      }
      goTo("status", { statusType: "success", statusTitle: "Payment Complete!", statusMessage: message });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualPay() {
    const cleanCardNumber = manualCardNumber.replace(/\s/g, "");
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      toast.error("Please enter a valid card number");
      return;
    }
    if (!manualExpMonth || !manualExpYear) {
      toast.error("Please enter the card expiration date");
      return;
    }
    if (manualCvv.length < 3 || manualCvv.length > 4) {
      toast.error("Please enter a valid CVV (3-4 digits)");
      return;
    }
    const expDate = `${manualExpMonth.padStart(2, "0")}${manualExpYear}`;
    setLoading(true);
    try {
      const data = await payCardManual(member.member_id, plan.id, pin, cleanCardNumber, expDate, manualCvv, saveCard, useCredit);
      let message = data.message || "Card payment processed successfully.";
      if (data.credit_used > 0) {
        message = `${settings.currency}${Number(data.credit_used).toFixed(2)} credit applied. ` + message;
      }
      goTo("status", { statusType: "success", statusTitle: "Payment Complete!", statusMessage: message });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  function formatCardNumber(value) {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 23);
  }

  if (!plan) {
    goTo("payment");
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => goTo("payment")}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <h1 className="text-base font-bold text-gray-900">Card Payment</h1>
        <div className="w-16" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-4">
        <div className="w-full max-w-sm space-y-4">
          {/* Amount */}
          <div className="rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-xs text-gray-500">{plan.name}</p>
            <p className="text-3xl font-extrabold text-gray-900">{settings.currency}{price.toFixed(2)}</p>
            {isProrated && <p className="text-xs text-blue-600">Pro-rated: {plan.prorated.days_remaining} days</p>}
            {useCredit && creditAmount > 0 && <p className="text-xs text-emerald-600">-{settings.currency}{creditAmount.toFixed(2)} credit</p>}
          </div>

          {cardsLoading ? (
            <div className="flex h-16 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
            </div>
          ) : (
            <>
              {/* Saved Cards */}
              {savedCards.length > 0 && !useNewCard && (
                <div className="space-y-2">
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => { setSelectedCardId(card.id); setUseNewCard(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
                        selectedCardId === card.id ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-1 ring-gray-100"
                      }`}
                    >
                      <CreditCard className="h-5 w-5 text-gray-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{card.friendly_name || `**** ${card.card_last4}`}</p>
                      </div>
                      {card.is_default && <Star className="h-4 w-4 text-amber-500" />}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setUseNewCard(true); setSelectedCardId(null); }}
                    className="w-full rounded-xl bg-white p-3 text-center text-sm font-medium text-gray-600 ring-1 ring-gray-200"
                  >
                    + Use Different Card
                  </button>
                  <KioskButton variant="primary" size="lg" icon={CreditCard} loading={loading} onClick={handleSavedCardPay} className="w-full" disabled={!selectedCardId}>
                    Pay {settings.currency}{price.toFixed(2)}
                  </KioskButton>
                </div>
              )}

              {/* New Card */}
              {useNewCard && (
                <div className="space-y-3">
                  {/* Swipe prompt */}
                  {!manualEntryChecked && (
                    <div className="rounded-xl bg-blue-50 p-4 text-center">
                      <CreditCard className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                      <h3 className="text-lg font-semibold text-blue-900">Swipe Your Card</h3>
                      <p className="text-sm text-blue-700">Swipe through the card reader</p>
                      {swipeStatus === "processing" && <p className="mt-2 text-sm text-blue-600">Processing...</p>}
                      <input ref={swipeInputRef} type="text" value={swipeData} onChange={handleSwipeInput} className="absolute opacity-0 pointer-events-none" autoFocus />
                    </div>
                  )}

                  {/* Manual entry checkbox */}
                  <button
                    type="button"
                    onClick={() => { setManualEntryChecked(!manualEntryChecked); if (!manualEntryChecked) setActiveField("card"); }}
                    className="flex w-full items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-200"
                  >
                    {manualEntryChecked ? <CheckSquare className="h-5 w-5 text-brand-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                    <span className="flex-1 text-left text-sm font-medium text-gray-700">Enter card manually</span>
                    <Keyboard className="h-4 w-4 text-gray-400" />
                  </button>

                  {/* Manual entry form */}
                  {manualEntryChecked && (
                    <div className="space-y-3">
                      {/* Card Number */}
                      <button
                        type="button"
                        onClick={() => setActiveField("card")}
                        className={`w-full rounded-xl p-3 text-left font-mono text-lg ring-1 ${
                          activeField === "card" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                        } ${manualCardNumber ? "text-gray-900" : "text-gray-400"}`}
                      >
                        <span className="text-xs text-gray-500 block mb-1">Card Number</span>
                        {manualCardNumber || "0000 0000 0000 0000"}
                      </button>

                      {/* Exp & CVV row */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveField("month")}
                          className={`rounded-xl p-3 text-center font-mono ring-1 ${
                            activeField === "month" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                          } ${manualExpMonth ? "text-gray-900" : "text-gray-400"}`}
                        >
                          <span className="text-xs text-gray-500 block mb-1">MM</span>
                          {manualExpMonth || "00"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveField("year")}
                          className={`rounded-xl p-3 text-center font-mono ring-1 ${
                            activeField === "year" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                          } ${manualExpYear ? "text-gray-900" : "text-gray-400"}`}
                        >
                          <span className="text-xs text-gray-500 block mb-1">YY</span>
                          {manualExpYear || "00"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveField("cvv")}
                          className={`rounded-xl p-3 text-center font-mono ring-1 ${
                            activeField === "cvv" ? "ring-2 ring-brand-500 bg-brand-50" : "ring-gray-200 bg-white"
                          } ${manualCvv ? "text-gray-900" : "text-gray-400"}`}
                        >
                          <span className="text-xs text-gray-500 block mb-1">CVV</span>
                          {manualCvv ? "•".repeat(manualCvv.length) : "•••"}
                        </button>
                      </div>

                      {/* Number Pad */}
                      <NumberPad onKey={handleNumPadKey} onBackspace={handleNumPadBackspace} onClear={handleNumPadClear} />

                      {/* Save card */}
                      <label className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-100 cursor-pointer">
                        <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                        <span className="text-sm text-gray-700">Save card for future</span>
                      </label>

                      {/* Pay Button */}
                      <KioskButton variant="primary" size="lg" icon={CreditCard} loading={loading} onClick={handleManualPay} className="w-full">
                        Pay {settings.currency}{price.toFixed(2)}
                      </KioskButton>
                    </div>
                  )}

                  {/* Swipe mode options */}
                  {!manualEntryChecked && (
                    <>
                      <label className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-100 cursor-pointer">
                        <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                        <span className="text-sm text-gray-700">Save card for future</span>
                      </label>
                      <div className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-500">
                        Waiting for card swipe...
                      </div>
                    </>
                  )}

                  {savedCards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setUseNewCard(false); setManualEntryChecked(false); const def = savedCards.find((c) => c.is_default); setSelectedCardId(def ? def.id : savedCards[0].id); }}
                      className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                    >
                      Back to saved cards
                    </button>
                  )}
                </div>
              )}

              <button type="button" onClick={() => goTo("payment")} className="w-full text-center py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

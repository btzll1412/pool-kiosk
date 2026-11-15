import { useState } from "react";
import { ArrowLeft, Banknote } from "lucide-react";
import toast from "react-hot-toast";
import NumPad from "../components/NumPad";
import KioskButton from "../components/KioskButton";
import { payCash, topupCash } from "../../api/kiosk";
import { describeBilling, getBillingParams, getPurchasePrice } from "../utils/billing";

export default function CashScreen({ member, goTo, goIdle, context, settings }) {
  // Add Money ("top-up") reuses this screen: no plan, a fixed amount and a description.
  // Only a top-up when Add Money sent us here (it clears plan); a plan purchase always wins.
  const topup = context.topup && !context.plan ? context.topup : null;
  const plan = topup
    ? { id: "__topup__", name: `Add to account: ${topup.description}`, price: Number(topup.amount), plan_type: "topup" }
    : context.plan;
  const pin = context.pin;
  const useCredit = context.useCredit || false;
  const creditAmount = Number(context.creditAmount || 0);
  // Monthly-type plans use the billing option the member chose, otherwise the plan price
  const billing = context.billing;
  const originalPrice = getPurchasePrice(plan, billing);
  const price = useCredit ? Number(context.adjustedPrice || originalPrice) : originalPrice;
  const billingSummary = describeBilling(plan, billing, settings.currency);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const isOver = amountNum > price;
  const overpay = isOver ? (amountNum - price).toFixed(2) : "0.00";

  async function handlePay() {
    if (amountNum <= 0) {
      toast.error("Enter the amount");
      return;
    }
    if (amountNum < price) {
      toast.error(`Minimum ${settings.currency}${price.toFixed(2)} required`);
      return;
    }

    setLoading(true);
    try {
      // Always add overpayment to credit (wantsChange = false)
      const data = topup
        ? await topupCash(member.member_id, pin, topup.amount, topup.description, amountNum.toFixed(2))
        : await payCash(member.member_id, plan.id, amountNum, pin, false, useCredit, getBillingParams(plan, billing));

      const amountStr = `${settings.currency}${amountNum.toFixed(2)}`;
      let message = (settings.cash_success_message || "Place {amount} in the cash box.").replace("{amount}", amountStr);
      if (data.credit_used > 0) {
        message = `${settings.currency}${Number(data.credit_used).toFixed(2)} credit applied.`;
      }
      if (topup) {
        message += ` ${settings.currency}${Number(data.amount_added).toFixed(2)} has been added to your account.`;
      } else if (data.credit_added > 0) {
        message += ` ${settings.currency}${Number(data.credit_added).toFixed(2)} added to your account credit.`;
      }

      goTo("status", {
        statusType: "success",
        statusTitle: topup ? "Money Added!" : "Payment Complete!",
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
  const goBack = () => (topup ? goTo("addMoney", { pin }) : goTo("payment"));

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Cash Payment</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">{plan.name}</p>
            {billingSummary && (
              <p className="mt-1 text-sm font-medium text-blue-600">{billingSummary}</p>
            )}
            {useCredit && creditAmount > 0 ? (
              <>
                <p className="mt-1 text-lg text-gray-400 line-through">
                  {settings.currency}{originalPrice.toFixed(2)}
                </p>
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
            <p className="mt-2 text-xs font-medium text-amber-600">
              Exact Change Only
            </p>
          </div>

          <div className="mb-4 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">Amount Tendered</p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">
              {settings.currency}{amount || "0.00"}
            </p>
            {isOver && (
              <p className="mt-2 text-sm font-medium text-emerald-600">
                {settings.currency}{overpay} will be added to account credit
              </p>
            )}
          </div>

          <NumPad value={amount} onChange={setAmount} maxLength={7} showDecimal />

          <KioskButton
            variant="success"
            size="xl"
            icon={Banknote}
            loading={loading}
            disabled={amountNum < price}
            onClick={handlePay}
            className="mt-4 w-full"
          >
            Confirm Payment
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

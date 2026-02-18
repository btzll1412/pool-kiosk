import { useState } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import { payCard } from "../../api/kiosk";

export default function CardPaymentScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const price = Number(plan?.price || 0);
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const data = await payCard(member.member_id, plan.id, pin);
      goTo("status", {
        statusType: "success",
        statusTitle: "Payment Complete!",
        statusMessage: data.message || "Card payment processed successfully.",
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

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50">
            <CreditCard className="h-10 w-10 text-brand-600" />
          </div>

          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            Card Payment
          </h2>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm text-gray-500">{plan.name}</p>
            <p className="mt-1 text-4xl font-extrabold text-gray-900">
              {settings.currency}{price.toFixed(2)}
            </p>
          </div>

          <p className="mt-6 text-lg text-gray-500">
            Tap or insert your card when prompted by the card reader
          </p>

          <KioskButton
            variant="primary"
            size="xl"
            icon={CreditCard}
            loading={loading}
            onClick={handlePay}
            className="mt-8 w-full"
          >
            Process Payment
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

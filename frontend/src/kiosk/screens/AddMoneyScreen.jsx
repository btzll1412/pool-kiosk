import { useState } from "react";
import { ArrowLeft, Check, DollarSign } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import { addCredit } from "../../api/kiosk";

export default function AddMoneyScreen({ member, goTo, goIdle, context, settings }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [addedAmount, setAddedAmount] = useState("");
  const currency = settings?.currency || "$";

  async function handleAddMoney() {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      await addCredit(member.member_id, context.pin, value);
      setAddedAmount(value.toFixed(2));
      setDone(true);
      setTimeout(() => goIdle(), 4000);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add money");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-50 px-8 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-12 w-12 text-emerald-600" />
        </div>
        <h2 className="mt-6 text-3xl font-bold text-gray-900">
          {currency}{addedAmount} was added to your account
        </h2>
        <p className="mt-3 text-xl text-gray-500">Thank you!</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={goIdle}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Add Money</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50">
            <DollarSign className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            How much would you like to add?
          </h2>

          <div className="mt-6">
            <KioskInput
              numeric
              showDecimal
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputId="add-money-amount"
            />
          </div>

          <KioskButton
            variant="primary"
            size="xl"
            icon={DollarSign}
            loading={loading}
            onClick={handleAddMoney}
            disabled={!amount || parseFloat(amount) <= 0}
            className="mt-6 w-full"
          >
            Add {currency}{amount || "0.00"}
          </KioskButton>
        </div>
      </div>
    </div>
  );
}

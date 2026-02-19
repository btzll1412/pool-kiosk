import { useState } from "react";
import { ArrowLeft, Banknote, CreditCard, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import KioskButton from "../components/KioskButton";
import KioskInput from "../components/KioskInput";
import PlanCard from "../components/PlanCard";
import { getPlans, guestVisit } from "../../api/kiosk";

export default function GuestScreen({ goTo, goIdle, settings }) {
  const [step, setStep] = useState("info"); // info | plan | method
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleNext() {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    setLoadingPlans(true);
    getPlans()
      .then((data) => {
        const singlePlans = data.filter((p) => p.plan_type === "single");
        setPlans(singlePlans.length > 0 ? singlePlans : data);
        if (singlePlans.length === 1) setSelectedPlan(singlePlans[0]);
        setStep("plan");
      })
      .catch(() => toast.error("Failed to load plans"))
      .finally(() => setLoadingPlans(false));
  }

  async function handlePay(method) {
    if (!selectedPlan) {
      toast.error("Select a plan");
      return;
    }
    setLoading(true);
    try {
      const data = await guestVisit(name.trim(), phone.trim() || null, method, selectedPlan.id);
      goTo("status", {
        statusType: "success",
        statusTitle: `Welcome, ${name.trim()}!`,
        statusMessage: data.message || "Enjoy your swim!",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => {
            if (step === "plan") setStep("info");
            else goIdle();
          }}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Guest Visit</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        {step === "info" && (
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                <UserPlus className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                Welcome, Guest!
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your details to get started
              </p>
            </div>

            <div className="space-y-4">
              <KioskInput
                label="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tap to enter your name"
              />
              <KioskInput
                label="Phone *"
                type="tel"
                numeric
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Tap to enter phone number"
              />
            </div>

            <KioskButton
              variant="primary"
              size="xl"
              loading={loadingPlans}
              onClick={handleNext}
              className="mt-6 w-full"
            >
              Continue
            </KioskButton>
          </div>
        )}

        {step === "plan" && (
          <div className="w-full max-w-2xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900 text-center">
              Select a Swim Option
            </h2>

            {plans.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
                <p className="text-lg font-semibold text-gray-900">No plans available</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    selected={selectedPlan?.id === plan.id}
                    onSelect={setSelectedPlan}
                  />
                ))}
              </div>
            )}

            {selectedPlan && (
              <div className="mt-8 text-center">
                <p className="mb-4 text-lg font-semibold text-gray-900">
                  {selectedPlan.name} — {settings.currency}
                  {Number(selectedPlan.price).toFixed(2)}
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handlePay("cash")}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    <Banknote className="h-8 w-8 text-emerald-600" />
                    <span className="text-lg font-semibold text-gray-900">Cash</span>
                    <span className="text-xs text-amber-600 font-medium">Exact Change Only</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handlePay("card")}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    <CreditCard className="h-8 w-8 text-blue-600" />
                    <span className="text-lg font-semibold text-gray-900">Card</span>
                    <span className="text-xs text-gray-400">Credit or Debit</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

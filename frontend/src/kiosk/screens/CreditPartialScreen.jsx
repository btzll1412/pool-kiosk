import { ArrowLeft, Banknote, CreditCard, Wallet } from "lucide-react";

export default function CreditPartialScreen({ goTo, context, settings }) {
  const plan = context.plan;
  const pin = context.pin;
  const creditUsed = Number(context.creditUsed || 0);
  const remainingDue = Number(context.remainingDue || 0);

  if (!plan) {
    goTo("payment");
    return null;
  }

  function goPayMethod(method) {
    goTo(method, {
      plan,
      pin,
      useCredit: true,
      creditAmount: creditUsed,
      adjustedPrice: remainingDue,
    });
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
        <h1 className="text-lg font-bold text-gray-900">Use Account Credit</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">
          {/* Credit breakdown */}
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Wallet className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{plan.name}</p>
                <p className="text-sm text-gray-500">
                  Total: {settings.currency}{Number(plan.price).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Account Credit Applied</span>
                <span className="font-semibold text-emerald-600">
                  -{settings.currency}{creditUsed.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-lg font-bold text-gray-900">Remaining to Pay</span>
                <span className="text-2xl font-extrabold text-gray-900">
                  {settings.currency}{remainingDue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment method selection */}
          <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">
            Pay remaining with:
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => goPayMethod("cash")}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98]"
            >
              <Banknote className="h-8 w-8 text-emerald-600" />
              <span className="text-lg font-semibold text-gray-900">Cash</span>
              <span className="text-xs text-amber-600 font-medium">Exact Change Only</span>
            </button>
            <button
              type="button"
              onClick={() => goPayMethod("card")}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.98]"
            >
              <CreditCard className="h-8 w-8 text-blue-600" />
              <span className="text-lg font-semibold text-gray-900">Card</span>
              <span className="text-xs text-gray-400">Credit or Debit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

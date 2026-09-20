import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import KioskButton from "../components/KioskButton";
import { getQuote } from "../../api/kiosk";
import { addDays, formatDate, ordinal, parseISODate, toISODate } from "../utils/billing";

const MAX_START_DAYS_AHEAD = 60;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function StartDatePicker({ value, min, max, onChange }) {
  const minParts = parseISODate(min);
  const maxParts = parseISODate(max);
  const selected = parseISODate(value);
  const [view, setView] = useState({ year: selected.year, month: selected.month });

  const cells = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
    const daysInMonth = new Date(view.year, view.month, 0).getDate();
    const list = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day++) list.push(day);
    return list;
  }, [view]);

  const viewIndex = view.year * 12 + view.month;
  const canGoPrev = viewIndex > minParts.year * 12 + minParts.month;
  const canGoNext = viewIndex < maxParts.year * 12 + maxParts.month;

  function shiftMonth(delta) {
    const d = new Date(view.year, view.month - 1 + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-all active:scale-95 active:bg-gray-200 disabled:opacity-30"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <p className="text-xl font-bold text-gray-900">
          {MONTHS[view.month - 1]} {view.year}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={!canGoNext}
          aria-label="Next month"
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-all active:scale-95 active:bg-gray-200 disabled:opacity-30"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((name) => (
          <p key={name} className="py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {name}
          </p>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const iso = toISODate(view.year, view.month, day);
          const isDisabled = iso < min || iso > max;
          const isSelected = iso === value;
          const isToday = iso === min;
          return (
            <button
              key={iso}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(iso)}
              className={`flex h-14 items-center justify-center rounded-xl text-lg font-semibold transition-all active:scale-95 ${
                isSelected
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                  : isDisabled
                  ? "text-gray-300"
                  : isToday
                  ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                  : "bg-gray-50 text-gray-900 hover:bg-gray-100"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BillingOptionsScreen({ member, goTo, context, settings }) {
  const plan = context.plan;
  const options = plan?.billing_options;
  const today = options?.full?.start_date;
  const currency = settings.currency;

  const [mode, setMode] = useState(context.billing?.planId === plan?.id ? context.billing.mode : null);
  const [startDate, setStartDate] = useState(
    (context.billing?.planId === plan?.id && context.billing.startDate) || today
  );
  const [quote, setQuote] = useState(options?.prorate || null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!plan || !options) return;
    const requestId = ++requestRef.current;
    setQuoteError(null);

    if (startDate === today) {
      setQuote(options.prorate);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    getQuote(member.member_id, plan.id, "prorate", startDate)
      .then((data) => {
        if (requestId !== requestRef.current) return;
        setQuote(data.quote);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setQuote(null);
        setQuoteError(err.response?.data?.detail || "Could not get the price for that date. Please try another date.");
      })
      .finally(() => {
        if (requestId === requestRef.current) setQuoteLoading(false);
      });
  }, [startDate]);

  if (!plan || !options) {
    goTo("payment");
    return null;
  }

  const full = options.full;
  const maxDate = addDays(today, MAX_START_DAYS_AHEAD);
  const isFutureStart = startDate > today;
  const quoteReady = !!quote && !quoteLoading && quote.start_date === startDate;

  function chooseFull() {
    goTo("payment", {
      plan,
      billing: { planId: plan.id, mode: "full", startDate: null, amount: full.amount, quote: full },
    });
  }

  function chooseProrate() {
    if (!quoteReady) return;
    goTo("payment", {
      plan,
      billing: {
        planId: plan.id,
        mode: "prorate",
        startDate: startDate === today ? null : startDate,
        amount: quote.amount,
        quote,
      },
    });
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("payment", { plan: null, billing: null })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Choose Your Start</h1>
        <div className="w-24" />
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl">
          <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
          <p className="mt-1 text-sm text-gray-500">How would you like to start your plan?</p>

          <div className="mt-6 space-y-4">
            {/* Option A — full price, starts today */}
            <button
              type="button"
              onClick={chooseFull}
              className="flex w-full items-center gap-5 rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                <CalendarCheck className="h-8 w-8 text-brand-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-gray-900">Start today — full price</p>
                <p className="mt-1 text-sm text-gray-500">
                  Covers {formatDate(full.start_date)} – {formatDate(full.valid_until)}, renews on the{" "}
                  {ordinal(full.billing_day)}
                </p>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">
                {currency}{Number(full.amount).toFixed(2)}
              </p>
            </button>

            {/* Option B — pro-rated, member picks the start date */}
            {mode !== "prorate" ? (
              <button
                type="button"
                onClick={() => setMode("prorate")}
                className="flex w-full items-center gap-5 rounded-2xl bg-white p-6 text-left shadow-sm ring-1 ring-gray-200 transition-all hover:ring-brand-300 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
                  <CalendarDays className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold text-gray-900">Choose my start date — pro-rated</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Pay less now and line up your billing with the {ordinal(options.prorate.billing_day)}.
                    Later charges are {currency}{Number(options.prorate.full_price).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">From today</p>
                  <p className="text-3xl font-extrabold text-gray-900">
                    {currency}{Number(options.prorate.amount).toFixed(2)}
                  </p>
                </div>
              </button>
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-2 ring-brand-600">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <CalendarDays className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">Choose my start date — pro-rated</p>
                    <p className="text-sm text-gray-500">Tap the day you want your plan to start</p>
                  </div>
                </div>

                <div className="mt-4">
                  <StartDatePicker value={startDate} min={today} max={maxDate} onChange={setStartDate} />
                </div>

                <div className="mt-4 rounded-2xl bg-gray-50 p-5 text-center">
                  <p className="text-sm text-gray-500">Start date: {formatDate(startDate)}</p>
                  {quoteLoading ? (
                    <div className="flex h-16 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                    </div>
                  ) : quoteError ? (
                    <p className="mt-2 text-base font-medium text-red-600">{quoteError}</p>
                  ) : quote ? (
                    <>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Due now</p>
                      <p className="text-4xl font-extrabold text-gray-900">
                        {currency}{Number(quote.amount).toFixed(2)}
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        Covers {formatDate(quote.start_date)} – {formatDate(quote.valid_until)}.
                        {quote.next_billing_date && (
                          <>
                            {" "}Next charge {formatDate(quote.next_billing_date)}: {currency}
                            {Number(quote.full_price).toFixed(2)}
                          </>
                        )}
                      </p>
                    </>
                  ) : null}
                </div>

                {isFutureStart && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                    <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-500" />
                    <p className="text-sm font-medium text-amber-800">
                      This plan starts on {formatDate(startDate)}. You will not be able to check in with it
                      before that date.
                    </p>
                  </div>
                )}

                <KioskButton
                  variant="primary"
                  size="xl"
                  icon={ArrowRight}
                  disabled={!quoteReady}
                  onClick={chooseProrate}
                  className="mt-5 w-full"
                >
                  {quoteReady
                    ? `Continue — ${currency}${Number(quote.amount).toFixed(2)}`
                    : "Continue"}
                </KioskButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

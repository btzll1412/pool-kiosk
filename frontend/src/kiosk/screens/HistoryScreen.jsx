import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, History, Receipt, Waves } from "lucide-react";
import { getAccountHistory } from "../../api/kiosk";

// Read-only "My History" for a PIN-verified member: plans, upcoming charges, visits, payments.

const TABS = [
  { key: "plans", label: "My Plans", icon: Waves },
  { key: "visits", label: "Visits", icon: History },
  { key: "payments", label: "Payments", icon: Receipt },
];

const STATUS_STYLE = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  frozen: { label: "Frozen", cls: "bg-blue-100 text-blue-700" },
  upcoming: { label: "Starts later", cls: "bg-amber-100 text-amber-700" },
  used_up: { label: "Used up", cls: "bg-gray-100 text-gray-600" },
  ended: { label: "Ended", cls: "bg-gray-100 text-gray-600" },
};

function plainDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "2026-11-12T14:05" is already local pool time; parse without any timezone shift.
function localDateTime(s) {
  if (!s) return { date: "", time: "" };
  const [d, t = "00:00"] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const dt = new Date(y, m - 1, day, hh, mm);
  return {
    date: dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    time: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
}

function Empty({ children }) {
  return <p className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm ring-1 ring-gray-100">{children}</p>;
}

function PlansTab({ data }) {
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const charges = Array.isArray(data.upcoming_charges) ? data.upcoming_charges : [];
  return (
    <div className="space-y-4">
      {charges.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-gray-900">Upcoming Automatic Charges</h3>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {charges.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{c.plan_name || "Plan"}{c.one_time ? " (one time)" : ""}</p>
                  <p className="text-gray-500">{c.card}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{c.date ? plainDate(c.date) : "Date not set"}</p>
                  {c.amount && <p className="text-gray-500">{money(c.amount)}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Any money on your account balance is used first.</p>
        </div>
      )}

      {plans.length === 0 ? (
        <Empty>You have no plans yet.</Empty>
      ) : (
        plans.map((p) => {
          const st = STATUS_STYLE[p.status] || STATUS_STYLE.ended;
          return (
            <div key={p.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-gray-900">{p.plan_name}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {p.valid_from && (
                  <div>
                    <p className="text-gray-500">Starts</p>
                    <p className="font-medium text-gray-900">{plainDate(p.valid_from)}</p>
                  </div>
                )}
                {p.valid_until && (
                  <div>
                    <p className="text-gray-500">{p.status === "ended" ? "Ended" : "Valid until"}</p>
                    <p className="font-medium text-gray-900">{plainDate(p.valid_until)}</p>
                  </div>
                )}
                {p.swims_remaining != null && (
                  <div>
                    <p className="text-gray-500">Swims left</p>
                    <p className="font-medium text-gray-900">{p.swims_remaining} of {p.swims_total}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function VisitsTab({ data }) {
  const visits = Array.isArray(data.visits) ? data.visits : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
          <p className="text-3xl font-bold text-gray-900">{data.visits_this_month ?? 0}</p>
          <p className="text-sm text-gray-500">visits this month</p>
        </div>
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-gray-100">
          <p className="text-3xl font-bold text-gray-900">{data.visits_this_year ?? 0}</p>
          <p className="text-sm text-gray-500">visits this year</p>
        </div>
      </div>
      {visits.length === 0 ? (
        <Empty>No visits yet.</Empty>
      ) : (
        <div className="divide-y divide-gray-100 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-gray-100">
          {visits.map((v, i) => {
            const { date, time } = localDateTime(v.at);
            return (
              <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{date}</p>
                  <p className="text-gray-500">{v.plan_name || v.type}{v.guests > 0 ? ` · +${v.guests} guest${v.guests > 1 ? "s" : ""}` : ""}</p>
                </div>
                <p className="text-gray-700">{time}</p>
              </div>
            );
          })}
        </div>
      )}
      {visits.length >= (data.limit || 50) && (
        <p className="text-center text-xs text-gray-400">Showing your last {data.limit || 50} visits.</p>
      )}
    </div>
  );
}

function PaymentsTab({ data }) {
  const payments = Array.isArray(data.payments) ? data.payments : [];
  if (payments.length === 0) return <Empty>No payments yet.</Empty>;
  return (
    <div className="space-y-2">
      <div className="divide-y divide-gray-100 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-gray-100">
        {payments.map((p, i) => {
          const { date, time } = localDateTime(p.at);
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{p.description || p.type}</p>
                <p className="text-gray-500">{date} · {time}</p>
                <p className="text-gray-400">{p.type} · {p.method}</p>
              </div>
              <p className={`font-semibold ${p.is_refund ? "text-emerald-600" : "text-gray-900"}`}>
                {p.is_refund ? "+" : ""}{money(p.amount)}
              </p>
            </div>
          );
        })}
      </div>
      {payments.length >= (data.limit || 50) && (
        <p className="text-center text-xs text-gray-400">Showing your last {data.limit || 50} transactions.</p>
      )}
    </div>
  );
}

// Tab bodies are exported only so they can be render-tested without a browser.
export { PlansTab, VisitsTab, PaymentsTab };

export default function HistoryScreen({ member, goTo, context }) {
  const pin = context?.pin;
  const [tab, setTab] = useState("plans");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!member || !pin) {
      setError("Please sign in again.");
      return undefined;
    }
    getAccountHistory(member.member_id, pin)
      .then((d) => { if (!cancelled) setData(d || {}); })
      .catch((err) => {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Could not load your history. Please try again.");
      });
    return () => { cancelled = true; };
  }, [member, pin]);

  if (!member) return null;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => goTo("manage", { pin })}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-gray-500 transition-all hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-lg font-bold text-gray-900">My History</h1>
        <div className="w-24" />
      </div>

      <div className="flex justify-center gap-2 border-b border-gray-100 bg-white px-6 py-3">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-all ${
              tab === key ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-lg">
          {error ? (
            <Empty>{error}</Empty>
          ) : !data ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
            </div>
          ) : tab === "plans" ? (
            <PlansTab data={data} />
          ) : tab === "visits" ? (
            <VisitsTab data={data} />
          ) : (
            <PaymentsTab data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

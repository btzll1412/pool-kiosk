// Helpers for the billing choice on monthly-type plans (full price vs. pro-rated
// with a chosen start date) and for the "YYYY-MM-DD" dates the API returns.

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Parse "YYYY-MM-DD" into { year, month, day } without any timezone shift. */
export function parseISODate(iso) {
  if (!iso) return null;
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function toISODate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "YYYY-MM-DD" → "MM/DD/YYYY" (project-wide display format). */
export function formatDate(iso) {
  const parts = parseISODate(iso);
  if (!parts) return "";
  return `${pad(parts.month)}/${pad(parts.day)}/${parts.year}`;
}

/** Add days to a "YYYY-MM-DD" string, returning a "YYYY-MM-DD" string. */
export function addDays(iso, days) {
  const { year, month, day } = parseISODate(iso);
  const d = new Date(year, month - 1, day + days);
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function ordinal(n) {
  const num = Number(n);
  const rem100 = num % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${num}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[num % 10] || "th";
  return `${num}${suffix}`;
}

/** True when the member has a real choice to make (full and pro-rated differ). */
export function needsBillingChoice(plan) {
  return plan?.plan_type === "monthly" && plan?.billing_options?.prorate?.prorated === true;
}

/** Billing selection used when there is nothing to choose: full price, starting today. */
export function defaultBilling(plan) {
  const full = plan?.billing_options?.full;
  if (plan?.plan_type !== "monthly" || !full) return null;
  return { planId: plan.id, mode: "full", startDate: null, amount: full.amount, quote: full };
}

/** Amount due for a purchase: the chosen quote for monthly-type plans, else the plan price. */
export function getPurchasePrice(plan, billing) {
  if (!plan) return 0;
  if (plan.plan_type === "monthly") {
    if (billing && billing.planId === plan.id) return Number(billing.amount);
    const full = plan.billing_options?.full;
    if (full) return Number(full.amount);
  }
  return Number(plan.price || 0);
}

/** Request fields the pay endpoints expect — must match what the member was shown. */
export function getBillingParams(plan, billing) {
  if (billing && plan && billing.planId === plan.id) {
    return { billing_mode: billing.mode, start_date: billing.startDate || null };
  }
  return { billing_mode: "full", start_date: null };
}

/** One-line description of the chosen billing, or "" for non-monthly plans. */
export function describeBilling(plan, billing, currency = "$") {
  if (!billing || !plan || billing.planId !== plan.id || !billing.quote) return "";
  const q = billing.quote;
  const covers = `Covers ${formatDate(q.start_date)} – ${formatDate(q.valid_until)}`;
  if (billing.mode === "prorate") {
    const next = q.next_billing_date
      ? `. Next charge ${formatDate(q.next_billing_date)}: ${currency}${Number(q.full_price).toFixed(2)}`
      : "";
    return `${q.prorated ? "Pro-rated. " : ""}${covers}${next}`;
  }
  return `${covers}, renews on the ${ordinal(q.billing_day)}`;
}

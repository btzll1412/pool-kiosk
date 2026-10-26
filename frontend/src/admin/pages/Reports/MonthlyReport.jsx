import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Download, Printer, Search, X } from "lucide-react";
import { exportMonthlyCsv, getMonthlyReport, getMonthlyReportBounds } from "../../../api/reports";
import { getMember, getMembers } from "../../../api/members";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import { SkeletonCard } from "../../../shared/Skeleton";
import { formatDateTime, getTodayDate, useTimezone } from "../../../context/TimezoneContext";
import ReportTabs from "./ReportTabs";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Plain calendar dates (YYYY-MM-DD) have no time zone; show them as written.
const plainDate = (d) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : "");

const money = (v) => {
  const n = Number(v || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
};

const selectClass =
  "rounded-lg border-0 py-1.5 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100";

// The rows of the month-by-month comparison table, in display order.
const METRIC_ROWS = [
  { key: "total", label: "Net total", money: true, bold: true },
  { key: "cash", label: "Cash", money: true },
  { key: "card", label: "Card", money: true },
  { key: "card_on_file", label: "Card on file", money: true },
  { key: "credit", label: "Account credit used", money: true },
  { key: "account", label: "Charged to account", money: true },
  { key: "refunds", label: "Refunds", money: true, negative: true },
  { key: "credits_added", label: "Credits added", money: true },
  { key: "sales", label: "Sales (count)" },
  { key: "swims", label: "Swims" },
  { key: "swim_guests", label: "Guests brought by members" },
  { key: "unique_swimmers", label: "Unique swimmers" },
  { key: "guest_visits", label: "Guest visits" },
  { key: "memberships_started", label: "Memberships started" },
  { key: "memberships_expired", label: "Memberships expired" },
  { key: "active_at_end", label: "Active at month end" },
];

function MonthPicker({ value, onChange, years }) {
  const [y, m] = value.split("-");
  return (
    <div className="flex gap-2">
      <select
        value={Number(m)}
        onChange={(e) => onChange(`${y}-${String(e.target.value).padStart(2, "0")}`)}
        className={selectClass}
        aria-label="Month"
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <select value={y} onChange={(e) => onChange(`${e.target.value}-${m}`)} className={selectClass} aria-label="Year">
        {years.map((yr) => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  );
}

function CustomerPicker({ selected, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      getMembers({ search: query.trim(), per_page: 8 })
        .then((data) => setResults(data.items || []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const add = (m) => {
    if (!selected.some((s) => s.member_id === m.id)) {
      onChange([...selected, { member_id: m.id, name: `${m.first_name} ${m.last_name}` }]);
    }
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:ring-gray-600">
        {selected.map((s) => (
          <span
            key={s.member_id}
            className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
          >
            {s.name}
            <button
              type="button"
              onClick={() => onChange(selected.filter((x) => x.member_id !== s.member_id))}
              aria-label={`Remove ${s.name}`}
              className="rounded hover:bg-brand-100 dark:hover:bg-brand-900/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <div className="flex min-w-[12rem] flex-1 items-center gap-1">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length ? "Add another customer…" : "All customers — type a name to filter"}
            className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-gray-100"
          />
        </div>
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => add(m)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="text-gray-900 dark:text-gray-100">{m.first_name} {m.last_name}</span>
                <span className="text-xs text-gray-400">{m.phone || m.email || ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricTable({ months, totals }) {
  const multi = months.length > 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500" />
            {months.map((m) => (
              <th key={m.period} className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                {m.label}
              </th>
            ))}
            {multi && (
              <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {METRIC_ROWS.map((row) => {
            const cell = (v) => (row.money ? money(row.negative && Number(v) ? -Number(v) : v) : v);
            return (
              <tr key={row.key} className={row.bold ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}>
                <td className="whitespace-nowrap py-2 pr-4">{row.label}</td>
                {months.map((m) => (
                  <td key={m.period} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cell(m[row.key])}</td>
                ))}
                {multi && (
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                    {row.key === "active_at_end" ? totals[row.key] : cell(totals[row.key])}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {multi && (
        <p className="mt-2 text-xs text-gray-400">"Active at month end" total shows the last month, not a sum.</p>
      )}
    </div>
  );
}

const TYPE_COLORS = { payment: "green", refund: "red", credit_add: "blue", credit_use: "purple", manual_adjustment: "gray" };
const typeLabel = (t) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// The rendered report itself (everything below the controls). Exported so it can be
// rendered on its own with fixture data.
export function ReportBody({ data, customers, periodLabel, timezone }) {
  const totals = data.totals;
  return (
  <div className="space-y-6">
    {/* Summary tiles */}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "Net total", value: money(totals.total), sub: `${totals.sales} sales` },
        { label: "Collected", value: money(Number(totals.cash) + Number(totals.card) + Number(totals.card_on_file)), sub: "cash + card + card on file" },
        { label: "Swims", value: totals.swims, sub: `${totals.unique_swimmers} swimmers · ${totals.guest_visits} guest visits` },
        { label: "Memberships", value: `${totals.memberships_started} started`, sub: `${totals.memberships_expired} expired · ${totals.active_at_end} active at end` },
      ].map((tile) => (
        <div key={tile.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{tile.label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{tile.value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tile.sub}</p>
        </div>
      ))}
    </div>

    <Card>
      <CardHeader title={data.months.length > 1 ? "Month by month" : periodLabel} />
      <MetricTable months={data.months} totals={totals} />
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Sales by plan" />
        {data.sales_by_plan.length === 0 ? (
          <p className="text-sm text-gray-400">No sales in this period</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.sales_by_plan.map((p) => (
                <tr key={p.plan} className="text-gray-700 dark:text-gray-300">
                  <td className="py-2">{p.plan}</td>
                  <td className="py-2 text-right text-gray-500">{p.count}×</td>
                  <td className="py-2 text-right font-medium tabular-nums">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title={customers.length ? "Account balances (as of today)" : "Outstanding balances (as of today)"} />
        {data.balances.length === 0 ? (
          <p className="text-sm text-gray-400">Nobody owes anything and nobody has credit</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.balances.map((b) => (
                <tr key={b.member_id} className="text-gray-700 dark:text-gray-300">
                  <td className="py-2">
                    <Link to={`/admin/members/${b.member_id}`} className="hover:underline">{b.name}</Link>
                  </td>
                  <td className="py-2 text-right">
                    <Badge color={b.owes ? "red" : "green"}>{b.owes ? "Owes" : "Credit"}</Badge>
                  </td>
                  <td className={`py-2 text-right font-medium tabular-nums ${b.owes ? "text-red-600" : "text-green-600"}`}>
                    {money(Math.abs(Number(b.balance)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>

    <Card>
      <CardHeader title={customers.length ? "Selected customers" : "Customers this period"} />
      {data.members.length === 0 ? (
        <p className="text-sm text-gray-400">No customer activity in this period</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700">
                <th className="py-2 pr-3">Customer</th>
                <th className="px-3 py-2 text-right">Net paid</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Charged to account</th>
                <th className="px-3 py-2 text-right">Swims</th>
                <th className="px-3 py-2">Memberships started</th>
                <th className="px-3 py-2 text-right">Balance now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.members.map((m) => (
                <tr key={m.member_id} className="text-gray-700 dark:text-gray-300">
                  <td className="py-2 pr-3">
                    <Link to={`/admin/members/${m.member_id}`} className="font-medium hover:underline">{m.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(m.total)}</td>
                  <td className="px-3 py-2 text-right">{m.sales}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(m.account) ? money(m.account) : "–"}</td>
                  <td className="px-3 py-2 text-right">{m.swims}</td>
                  <td className="px-3 py-2 text-gray-500">{m.memberships_started.join(", ") || "–"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Number(m.balance) < 0 ? "text-red-600" : Number(m.balance) > 0 ? "text-green-600" : ""}`}>
                    {Number(m.balance) ? money(m.balance) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>

    {(data.memberships_started.length > 0 || data.memberships_expired.length > 0) && (
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { title: "Memberships started", items: data.memberships_started, dateKey: "valid_from" },
          { title: "Memberships expired", items: data.memberships_expired, dateKey: "valid_until" },
        ].map((section) => (
          <Card key={section.title}>
            <CardHeader title={`${section.title} (${section.items.length})`} />
            {section.items.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin print:max-h-none print:overflow-visible">
                {section.items.map((m) => (
                  <div key={m.membership_id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50">
                    <div>
                      <Link to={`/admin/members/${m.member_id}`} className="font-medium text-gray-800 hover:underline dark:text-gray-200">{m.member_name}</Link>
                      <span className="text-gray-500"> · {m.plan_name}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {plainDate(m.valid_from) || "?"} → {plainDate(m.valid_until) || "open"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    )}

    {data.checkins.length > 0 && (
      <Card>
        <CardHeader title={`Check-ins (${data.checkins.length})`} />
        <div className="max-h-96 overflow-y-auto scrollbar-thin print:max-h-none print:overflow-visible">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.checkins.map((c) => (
                <tr key={c.id} className="text-gray-700 dark:text-gray-300">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(c.checked_in_at, timezone)}</td>
                  <td className="px-3 py-2">{c.member_name}</td>
                  <td className="px-3 py-2 text-gray-500">{typeLabel(c.checkin_type)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{c.guest_count ? `+${c.guest_count} guests` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )}

    <Card>
      <CardHeader title={`Transactions (${data.transactions.length})`} />
      {data.transactions.length === 0 ? (
        <p className="text-sm text-gray-400">No transactions in this period</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700">
                <th className="py-2 pr-3">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Plan / notes</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.transactions.map((tx) => (
                <tr key={tx.id} className="text-gray-700 dark:text-gray-300">
                  <td className="whitespace-nowrap py-2 pr-3">{formatDateTime(tx.created_at, timezone)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {tx.member_id ? (
                      <Link to={`/admin/members/${tx.member_id}`} className="hover:underline">{tx.member_name}</Link>
                    ) : tx.guest_name ? (
                      <span>Guest: {tx.guest_name}</span>
                    ) : (
                      <span className="text-gray-400">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><Badge color={TYPE_COLORS[tx.transaction_type] || "gray"}>{typeLabel(tx.transaction_type)}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {tx.method_label}
                    {tx.card && <span className="text-gray-400"> · {tx.card}</span>}
                  </td>
                  <td className="max-w-md px-3 py-2">
                    {tx.plan_name && <span className="font-medium">{tx.plan_name}</span>}
                    {tx.plan_name && tx.notes && <span className="text-gray-400"> · </span>}
                    {tx.notes && <span className="text-gray-500">{tx.notes}</span>}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${Number(tx.amount) < 0 ? "text-red-600" : ""}`}>
                    {money(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  </div>
  );
}

export default function MonthlyReport() {
  const timezone = useTimezone();
  const [searchParams, setSearchParams] = useSearchParams();
  const thisMonth = getTodayDate(timezone).slice(0, 7);

  const [bounds, setBounds] = useState(null);
  const [start, setStart] = useState(searchParams.get("start") || thisMonth);
  const [end, setEnd] = useState(searchParams.get("end") || searchParams.get("start") || thisMonth);
  const [isRange, setIsRange] = useState(Boolean(searchParams.get("end") && searchParams.get("end") !== searchParams.get("start")));
  const [customers, setCustomers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Opened from a member's page: preselect that customer
  useEffect(() => {
    const preset = searchParams.get("member");
    if (!preset) return;
    getMember(preset)
      .then((m) => setCustomers([{ member_id: m.id, name: `${m.first_name} ${m.last_name}` }]))
      .catch(() => toast.error("Could not load that member"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getMonthlyReportBounds().then(setBounds).catch(() => setBounds({ first_month: thisMonth, last_month: thisMonth }));
  }, [thisMonth]);

  const effectiveEnd = isRange ? (end < start ? start : end) : start;
  const memberIds = customers.map((c) => c.member_id);
  const memberKey = memberIds.join(",");

  const load = useCallback(() => {
    setLoading(true);
    getMonthlyReport({ start, end: effectiveEnd, member_ids: memberIds.length ? memberIds : undefined })
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load the monthly report"))
      .finally(() => setLoading(false));
  }, [start, effectiveEnd, memberKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const next = { start };
    if (effectiveEnd !== start) next.end = effectiveEnd;
    if (memberIds.length === 1) next.member = memberIds[0];
    setSearchParams(next, { replace: true });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => {
    const first = Number((bounds?.first_month || thisMonth).slice(0, 4));
    const last = Math.max(Number(thisMonth.slice(0, 4)), Number(start.slice(0, 4)), Number(end.slice(0, 4)));
    const out = [];
    for (let y = last; y >= Math.min(first, last); y--) out.push(String(y));
    return out;
  }, [bounds, thisMonth, start, end]);

  const periodLabel = data
    ? data.start === data.end
      ? data.months[0].label
      : `${data.months[0].label} – ${data.months[data.months.length - 1].label}`
    : "";
  const customerLabel = customers.length ? customers.map((c) => c.name).join(", ") : "All customers";

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportMonthlyCsv({ start, end: effectiveEnd, member_ids: memberIds.length ? memberIds : undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monthly_report_${start}${effectiveEnd !== start ? `_to_${effectiveEnd}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Monthly Report"
        description="Everything that happened in a month, a range of months, or for chosen customers"
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" icon={Download} loading={exporting} onClick={handleExport} disabled={!data}>
              CSV
            </Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!data}>
              Print / PDF
            </Button>
          </div>
        }
      />
      <ReportTabs />

      {/* Controls */}
      <Card className="mb-6 print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
              {isRange ? "From" : "Month"}
            </label>
            <MonthPicker value={start} onChange={setStart} years={years} />
          </div>
          {isRange && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">To</label>
              <MonthPicker value={end} onChange={setEnd} years={years} />
            </div>
          )}
          <div className="flex items-center gap-4 pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={isRange}
                onChange={(e) => {
                  setIsRange(e.target.checked);
                  if (e.target.checked && end < start) setEnd(start);
                }}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
              />
              Range of months
            </label>
            {isRange && (
              <button
                type="button"
                className="text-sm text-brand-600 hover:underline"
                onClick={() => {
                  setStart(`${start.slice(0, 4)}-01`);
                  setEnd(`${start.slice(0, 4)}-12`);
                }}
              >
                Whole year {start.slice(0, 4)}
              </button>
            )}
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Customers</label>
            <CustomerPicker selected={customers} onChange={setCustomers} />
          </div>
        </div>
      </Card>

      {/* Print header */}
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-semibold">{periodLabel}</p>
        <p className="text-sm text-gray-600">{customerLabel}</p>
      </div>

      {loading || !data ? (
        <div className="space-y-6">
          <SkeletonCard className="h-32" />
          <SkeletonCard className="h-64" />
        </div>
      ) : (
        <ReportBody data={data} customers={customers} periodLabel={periodLabel} timezone={timezone} />
      )}
    </div>
  );
}

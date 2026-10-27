import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Banknote, CreditCard, Download, Phone, Search, ShoppingBag, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { exportItemSalesCsv, getItemSalePlans, getItemSales } from "../../../api/itemSales";
import { useTimezone, formatDateTime } from "../../../context/TimezoneContext";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import PageHeader from "../../../shared/PageHeader";
import Table from "../../../shared/Table";

const FILTER_KEYS = ["search", "buyer", "plan_id", "method", "start_date", "end_date"];
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""]));

const methodColors = {
  cash: "green",
  card: "blue",
  credit: "purple",
  account: "yellow",
  split: "gray",
};

const inputClass =
  "rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100";
const selectClass =
  "rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100";

function money(v) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function SummaryTile({ label, value, icon: Icon, tone = "text-gray-900 dark:text-gray-100" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export default function ItemSalesList() {
  const timezone = useTimezone();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0, summary: null });
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    ...Object.fromEntries(FILTER_KEYS.filter((k) => searchParams.get(k)).map((k) => [k, searchParams.get(k)])),
  }));
  const [searchText, setSearchText] = useState(filters.search);
  const perPage = 25;

  // Debounce the free-text search so we don't hit the server on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText !== filters.search) {
        setFilters((f) => ({ ...f, search: searchText }));
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    getItemSalePlans().then(setPlans).catch(() => {});
  }, []);

  const activeParams = () => {
    const params = {};
    for (const k of FILTER_KEYS) if (filters[k]) params[k] = filters[k];
    return params;
  };

  useEffect(() => {
    setLoading(true);
    setSearchParams(activeParams(), { replace: true });
    getItemSales({ ...activeParams(), page, per_page: perPage })
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load item sales"))
      .finally(() => setLoading(false));
  }, [page, filters]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
    setPage(1);
  };

  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  const handleExport = async () => {
    try {
      const blob = await exportItemSalesCsv(activeParams());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "item-sales.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to export CSV");
    }
  };

  const columns = [
    {
      key: "created_at",
      label: "Date & Time",
      render: (row) => (
        <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">
          {formatDateTime(row.created_at, timezone)}
        </span>
      ),
    },
    {
      key: "name",
      label: "Buyer",
      render: (row) =>
        row.buyer === "member" && row.member_id ? (
          <Link
            to={`/admin/members/${row.member_id}`}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
          >
            {row.name}
          </Link>
        ) : (
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {row.name} <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">Guest</span>
          </span>
        ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (row) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
          <Phone className="h-3.5 w-3.5" />
          {row.phone || "—"}
        </span>
      ),
    },
    {
      key: "plan_name",
      label: "Item",
      render: (row) => <span className="text-gray-900 dark:text-gray-100">{row.plan_name || "—"}</span>,
    },
    {
      key: "description",
      label: "Description",
      render: (row) => (
        <span className="block max-w-[260px] whitespace-normal break-words text-sm leading-tight text-gray-600 dark:text-gray-400">
          {row.description || "—"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (row) => <span className="font-semibold text-gray-900 dark:text-gray-100">{money(row.amount)}</span>,
    },
    {
      key: "method",
      label: "Payment",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge color={methodColors[row.method] || "gray"}>{row.method}</Badge>
          {(row.method === "split" || row.parts?.[0]?.card_last4) && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{row.method_label}</span>
          )}
        </div>
      ),
    },
    {
      key: "recorded_by",
      label: "Recorded By",
      render: (row) => <span className="text-gray-500 dark:text-gray-400">{row.recorded_by}</span>,
    },
  ];

  const s = data.summary;

  return (
    <div>
      <PageHeader
        title="Item Sales"
        description="One-time purchases (Misc and other items) by members and guests. These are never counted as swims."
        actions={
          <Button variant="secondary" icon={Download} onClick={handleExport}>
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Name, phone, or description"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Buyer</label>
          <select value={filters.buyer} onChange={(e) => setFilter("buyer", e.target.value)} className={selectClass}>
            <option value="">Everyone</option>
            <option value="member">Members</option>
            <option value="guest">Guests</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Item</label>
          <select value={filters.plan_id} onChange={(e) => setFilter("plan_id", e.target.value)} className={selectClass}>
            <option value="">All items</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Payment</label>
          <select value={filters.method} onChange={(e) => setFilter("method", e.target.value)} className={selectClass}>
            <option value="">All payments</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="credit">Account credit</option>
            <option value="account">Charged to account</option>
            <option value="split">Split</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">From</label>
          <input type="date" value={filters.start_date} onChange={(e) => setFilter("start_date", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">To</label>
          <input type="date" value={filters.end_date} onChange={(e) => setFilter("end_date", e.target.value)} className={inputClass} />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Summary for the current filters */}
      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryTile label="Sales" value={s.count} icon={ShoppingBag} />
          <SummaryTile label="Total" value={money(s.amount)} />
          <SummaryTile label="Cash" value={money(s.cash)} icon={Banknote} tone="text-emerald-600 dark:text-emerald-400" />
          <SummaryTile label="Card" value={money(s.card)} icon={CreditCard} tone="text-blue-600 dark:text-blue-400" />
          <SummaryTile
            label="Credit / Account"
            value={money(Number(s.credit) + Number(s.account))}
            icon={Wallet}
            tone="text-purple-600 dark:text-purple-400"
          />
        </div>
      )}

      <Table
        columns={columns}
        data={data.items}
        loading={loading}
        page={page}
        totalPages={Math.ceil(data.total / perPage)}
        onPageChange={setPage}
        emptyMessage={hasFilters ? "No item sales match these filters" : "No item sales yet"}
      />
    </div>
  );
}

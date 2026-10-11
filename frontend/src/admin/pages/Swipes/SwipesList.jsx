import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Download, Search } from "lucide-react";
import toast from "react-hot-toast";
import { getSwipes } from "../../../api/swipes";
import { useTimezone, formatDate, formatTime, formatDateTime, getTodayDate, getStartOfWeekDate, getStartOfMonthDate } from "../../../context/TimezoneContext";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import PageHeader from "../../../shared/PageHeader";
import Table from "../../../shared/Table";

const OUTCOMES = {
  checked_in: { label: "Checked In", color: "green" },
  no_action: { label: "No Action", color: "gray" },
  no_plan: { label: "No Plan", color: "red" },
  expired: { label: "Expired Plan", color: "amber" },
  frozen: { label: "Frozen", color: "blue" },
  outside_hours: { label: "Outside Hours", color: "purple" },
  unknown_card: { label: "Unknown Card", color: "rose" },
  inactive_member: { label: "Inactive Member", color: "orange" },
};

export default function SwipesList() {
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [data, setData] = useState({ items: [], total: 0, unique_members: 0, outcome_counts: {} });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    outcome: "",
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
  });
  const perPage = 25;

  const load = () => {
    setLoading(true);
    const params = { page, per_page: perPage };
    if (filters.search) params.search = filters.search;
    if (filters.outcome) params.outcome = filters.outcome;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.start_time) params.start_time = filters.start_time;
    if (filters.end_time) params.end_time = filters.end_time;

    getSwipes(params)
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load swipes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, filters]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.outcome, filters.start_date, filters.end_date, filters.start_time, filters.end_time]);

  const handleExport = () => {
    const headers = ["Member", "Card", "Source", "Outcome", "Date", "Time"];
    const rows = data.items.map((row) => [
      row.member_name || "Unknown",
      row.card_uid || "",
      row.source === "search" ? "Name search" : "Card",
      OUTCOMES[row.outcome]?.label || row.outcome,
      formatDate(row.created_at, timezone),
      formatTime(row.created_at, timezone),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swipes-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  const columns = [
    {
      key: "member_name",
      label: "Member",
      render: (row) =>
        row.member_name ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 text-sm font-semibold text-brand-700 dark:text-brand-300">
              {row.member_name.split(" ").map((n) => n[0]).join("")}
            </div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{row.member_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">
              <CreditCard className="h-4 w-4" />
            </div>
            <span className="font-mono text-sm text-gray-500 dark:text-gray-400">{row.card_uid || "Unknown"}</span>
          </div>
        ),
    },
    {
      key: "outcome",
      label: "Outcome",
      render: (row) => {
        const info = OUTCOMES[row.outcome] || { label: row.outcome, color: "gray" };
        return <Badge color={info.color}>{info.label}</Badge>;
      },
    },
    {
      key: "source",
      label: "How",
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-400">{row.source === "search" ? "Name search" : "Card"}</span>
      ),
    },
    {
      key: "created_at",
      label: "Date & Time",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(row.created_at, timezone)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatTime(row.created_at, timezone, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
      ),
    },
  ];

  // Set default dates to today for quick filtering (using system timezone)
  const setToday = () => {
    const today = getTodayDate(timezone);
    setFilters((f) => ({ ...f, start_date: today, end_date: today }));
  };

  const setThisWeek = () => {
    const today = getTodayDate(timezone);
    const startOfWeek = getStartOfWeekDate(timezone);
    setFilters((f) => ({
      ...f,
      start_date: startOfWeek,
      end_date: today,
    }));
  };

  const setThisMonth = () => {
    const today = getTodayDate(timezone);
    const startOfMonth = getStartOfMonthDate(timezone);
    setFilters((f) => ({
      ...f,
      start_date: startOfMonth,
      end_date: today,
    }));
  };

  // Check if quick date filters are active (using system timezone)
  const todayStr = getTodayDate(timezone);
  const startOfWeekStr = getStartOfWeekDate(timezone);
  const startOfMonthStr = getStartOfMonthDate(timezone);

  const isTodayActive = filters.start_date === todayStr && filters.end_date === todayStr;
  const isThisWeekActive = filters.start_date === startOfWeekStr && filters.end_date === todayStr;
  const isThisMonthActive = filters.start_date === startOfMonthStr && filters.end_date === todayStr;

  return (
    <div>
      <PageHeader
        title="Swipes"
        description={
          <span>
            {data.total} swipe{data.total !== 1 ? "s" : ""}
            {data.unique_members > 0 && (
              <span className="ml-2 text-brand-600 dark:text-brand-400">
                ({data.unique_members} unique member{data.unique_members !== 1 ? "s" : ""})
              </span>
            )}
            {(data.outcome_counts?.no_plan || data.outcome_counts?.expired) ? (
              <span className="ml-2 text-red-600 dark:text-red-400">
                · {(data.outcome_counts.no_plan || 0) + (data.outcome_counts.expired || 0)} without a usable plan
              </span>
            ) : null}
          </span>
        }
        actions={
          <Button variant="secondary" icon={Download} onClick={handleExport}>
            Export CSV
          </Button>
        }
      />

      {/* Quick date filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={setToday}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            isTodayActive
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Today
        </button>
        <button
          onClick={setThisWeek}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            isThisWeekActive
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          This Week
        </button>
        <button
          onClick={setThisMonth}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            isThisMonthActive
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          This Month
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className={`mb-1 block text-xs font-medium ${filters.search ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Search Member {filters.search && "●"}
          </label>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${filters.search ? "text-brand-500" : "text-gray-400"}`} />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Name or card number..."
              className={`w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 ${
                filters.search
                  ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "ring-gray-300 dark:ring-gray-600"
              }`}
            />
          </div>
        </div>

        {/* Outcome filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.outcome ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Outcome {filters.outcome && "●"}
          </label>
          <select
            value={filters.outcome}
            onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.outcome
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All outcomes</option>
            {Object.entries(OUTCOMES).map(([value, info]) => (
              <option key={value} value={value}>{info.label}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.start_date ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            From {filters.start_date && "●"}
          </label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.start_date
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.end_date ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            To {filters.end_date && "●"}
          </label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.end_date
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>

        {/* Time range */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.start_time ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            From Time {filters.start_time && "●"}
          </label>
          <input
            type="time"
            value={filters.start_time}
            onChange={(e) => setFilters((f) => ({ ...f, start_time: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.start_time
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.end_time ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            To Time {filters.end_time && "●"}
          </label>
          <input
            type="time"
            value={filters.end_time}
            onChange={(e) => setFilters((f) => ({ ...f, end_time: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.end_time
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>

        {/* Clear filters */}
        {(filters.search ||
          filters.outcome ||
          filters.start_date ||
          filters.end_date ||
          filters.start_time ||
          filters.end_time) && (
          <button
            onClick={() =>
              setFilters({
                search: "",
                outcome: "",
                start_date: "",
                end_date: "",
                start_time: "",
                end_time: "",
              })
            }
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <Table
        columns={columns}
        data={data.items}
        loading={loading}
        page={page}
        totalPages={Math.ceil(data.total / perPage)}
        onPageChange={setPage}
        onRowClick={(row) => row.member_id && navigate(`/admin/members/${row.member_id}`)}
        emptyMessage="No swipes found"
      />
    </div>
  );
}

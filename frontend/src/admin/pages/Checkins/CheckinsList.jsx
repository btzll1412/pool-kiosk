import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import { getCheckins } from "../../../api/checkins";
import { useTimezone, formatDate, formatTime, formatDateTime } from "../../../context/TimezoneContext";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import PageHeader from "../../../shared/PageHeader";
import Table from "../../../shared/Table";

export default function CheckinsList() {
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [data, setData] = useState({ items: [], total: 0, unique_members: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    checkin_type: "",
    start_date: "",
    end_date: "",
    unique_only: false,
  });
  const perPage = 25;

  const load = () => {
    setLoading(true);
    const params = { page, per_page: perPage };
    if (filters.search) params.search = filters.search;
    if (filters.checkin_type) params.checkin_type = filters.checkin_type;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.unique_only) params.unique_only = true;

    getCheckins(params)
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load check-ins"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, filters]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.checkin_type, filters.start_date, filters.end_date, filters.unique_only]);

  const handleExport = () => {
    // Create CSV from current data
    const headers = ["Member", "Type", "Guests", "Date", "Time", "Notes"];
    const rows = data.items.map((row) => {
      return [
        row.member_name,
        row.checkin_type.replace(/_/g, " "),
        row.guest_count,
        formatDate(row.checked_in_at, timezone),
        formatTime(row.checked_in_at, timezone),
        row.notes || "",
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkins-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  const typeColors = {
    membership: "blue",
    swim_pass: "purple",
    paid_single: "green",
    free: "gray",
    guest: "rose",
  };

  const typeLabels = {
    membership: "Membership",
    swim_pass: "Swim Pass",
    paid_single: "Single Visit",
    free: "Free",
    guest: "Guest",
  };

  const columns = [
    {
      key: "member_name",
      label: "Member",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 text-sm font-semibold text-brand-700 dark:text-brand-300">
            {row.member_name.split(" ").map((n) => n[0]).join("")}
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {row.member_name}
          </span>
        </div>
      ),
    },
    {
      key: "checkin_type",
      label: "Type",
      render: (row) => (
        <Badge color={typeColors[row.checkin_type] || "gray"}>
          {typeLabels[row.checkin_type] || row.checkin_type}
        </Badge>
      ),
    },
    {
      key: "guest_count",
      label: "Guests",
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-400">
          {row.guest_count > 0 ? `+${row.guest_count}` : "—"}
        </span>
      ),
    },
    {
      key: "checked_in_at",
      label: "Date & Time",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {formatDate(row.checked_in_at, timezone, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatTime(row.checked_in_at, timezone, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      ),
    },
    {
      key: "notes",
      label: "Notes",
      render: (row) => (
        <span className="max-w-[200px] truncate text-gray-500 dark:text-gray-400">
          {row.notes || "—"}
        </span>
      ),
    },
  ];

  // Set default dates to today for quick filtering
  const setToday = () => {
    const today = new Date().toISOString().split("T")[0];
    setFilters((f) => ({ ...f, start_date: today, end_date: today }));
  };

  const setThisWeek = () => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    setFilters((f) => ({
      ...f,
      start_date: startOfWeek.toISOString().split("T")[0],
      end_date: today.toISOString().split("T")[0],
    }));
  };

  const setThisMonth = () => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setFilters((f) => ({
      ...f,
      start_date: startOfMonth.toISOString().split("T")[0],
      end_date: today.toISOString().split("T")[0],
    }));
  };

  return (
    <div>
      <PageHeader
        title="Check-ins"
        description={
          <span>
            {data.total} check-in{data.total !== 1 ? "s" : ""}
            {data.unique_members > 0 && (
              <span className="ml-2 text-brand-600 dark:text-brand-400">
                ({data.unique_members} unique member{data.unique_members !== 1 ? "s" : ""})
              </span>
            )}
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
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Today
        </button>
        <button
          onClick={setThisWeek}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          This Week
        </button>
        <button
          onClick={setThisMonth}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
              placeholder="Search by name..."
              className={`w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 ${
                filters.search
                  ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "ring-gray-300 dark:ring-gray-600"
              }`}
            />
          </div>
        </div>

        {/* Type filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.checkin_type ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Type {filters.checkin_type && "●"}
          </label>
          <select
            value={filters.checkin_type}
            onChange={(e) => setFilters((f) => ({ ...f, checkin_type: e.target.value }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.checkin_type
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All types</option>
            <option value="membership">Membership</option>
            <option value="swim_pass">Swim Pass</option>
            <option value="paid_single">Single Visit</option>
            <option value="free">Free</option>
            <option value="guest">Guest</option>
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

        {/* Unique toggle */}
        <label className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer ring-1 ring-inset transition-colors ${
          filters.unique_only
            ? "bg-brand-50 dark:bg-brand-950 ring-2 ring-brand-500"
            : "bg-gray-50 dark:bg-gray-800 ring-gray-200 dark:ring-gray-700"
        }`}>
          <input
            type="checkbox"
            checked={filters.unique_only}
            onChange={(e) => setFilters((f) => ({ ...f, unique_only: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <Users className={`h-4 w-4 ${filters.unique_only ? "text-brand-500" : "text-gray-500"}`} />
          <span className={`text-sm font-medium ${filters.unique_only ? "text-brand-700 dark:text-brand-300" : "text-gray-700 dark:text-gray-300"}`}>
            Unique Only
          </span>
        </label>

        {/* Clear filters */}
        {(filters.search ||
          filters.checkin_type ||
          filters.start_date ||
          filters.end_date ||
          filters.unique_only) && (
          <button
            onClick={() =>
              setFilters({
                search: "",
                checkin_type: "",
                start_date: "",
                end_date: "",
                unique_only: false,
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
        emptyMessage="No check-ins found"
      />
    </div>
  );
}

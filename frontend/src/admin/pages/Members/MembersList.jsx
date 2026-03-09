import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Plus, Search, Upload, Filter } from "lucide-react";
import toast from "react-hot-toast";
import { exportMembersCsv, getMembers, importMembersCsv } from "../../../api/members";
import { getPlans } from "../../../api/plans";
import { useTimezone, formatDate } from "../../../context/TimezoneContext";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import PageHeader from "../../../shared/PageHeader";
import Table from "../../../shared/Table";

export default function MembersList() {
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [plans, setPlans] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    is_active: "",
    has_plan: "",
    plan_id: "",
    has_credit: "",
    joined_after: "",
    joined_before: "",
  });
  const perPage = 25;
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // Load plans for filter dropdown
  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() => {}); // Silent fail for plans load
  }, []);

  const handleExport = async () => {
    try {
      const blob = await exportMembersCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "members.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Members exported");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Export failed");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importMembersCsv(file);
      toast.success(result.message);
      // Reload the list
      setPage(1);
      setFilters((f) => ({ ...f, search: "" }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Load members with filters
  const load = () => {
    setLoading(true);
    const params = { page, per_page: perPage };
    if (filters.search) params.search = filters.search;
    if (filters.is_active !== "") params.is_active = filters.is_active === "true";
    if (filters.has_plan !== "") params.has_plan = filters.has_plan === "true";
    if (filters.plan_id) params.plan_id = filters.plan_id;
    if (filters.has_credit !== "") params.has_credit = filters.has_credit === "true";
    if (filters.joined_after) params.joined_after = filters.joined_after;
    if (filters.joined_before) params.joined_before = filters.joined_before;

    getMembers(params)
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load members"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, filters]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.is_active, filters.has_plan, filters.plan_id, filters.has_credit, filters.joined_after, filters.joined_before]);

  // Generate consistent color for plan names
  const planColors = [
    "blue", "purple", "cyan", "pink", "indigo", "teal", "orange", "lime", "amber", "rose"
  ];

  const getPlanColor = (planName) => {
    if (!planName) return "gray";
    let hash = 0;
    for (let i = 0; i < planName.length; i++) {
      hash = planName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return planColors[Math.abs(hash) % planColors.length];
  };

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {row.first_name?.[0]}
            {row.last_name?.[0]}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {row.first_name} {row.last_name}
            </p>
            {row.email && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{row.email}</p>
            )}
          </div>
        </div>
      ),
    },
    { key: "phone", label: "Phone" },
    {
      key: "active_plans",
      label: "Plans",
      render: (row) => {
        if (!row.active_plans || row.active_plans.length === 0) {
          return <span className="text-gray-400 dark:text-gray-500">No plan</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {row.active_plans.map((plan, idx) => (
              <Badge key={idx} color={getPlanColor(plan.plan_name)}>
                {plan.plan_name}
                {plan.swims_remaining !== null && (
                  <span className="ml-1 opacity-75">({plan.swims_remaining})</span>
                )}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "credit_balance",
      label: "Credit",
      render: (row) => (
        <span className={`font-medium ${Number(row.credit_balance) > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
          ${Number(row.credit_balance).toFixed(2)}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      render: (row) =>
        row.is_active ? (
          <Badge color="green">Active</Badge>
        ) : (
          <Badge color="red">Inactive</Badge>
        ),
    },
    {
      key: "created_at",
      label: "Joined",
      render: (row) => formatDate(row.created_at, timezone),
    },
  ];

  const hasActiveFilters =
    filters.search ||
    filters.is_active !== "" ||
    filters.has_plan !== "" ||
    filters.plan_id ||
    filters.has_credit !== "" ||
    filters.joined_after ||
    filters.joined_before;

  const clearFilters = () => {
    setFilters({
      search: "",
      is_active: "",
      has_plan: "",
      plan_id: "",
      has_credit: "",
      joined_after: "",
      joined_before: "",
    });
  };

  return (
    <div>
      <PageHeader
        title="Members"
        description={`${data.total} total member${data.total !== 1 ? "s" : ""}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={Download} onClick={handleExport}>
              Export
            </Button>
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => fileInputRef.current?.click()}
              loading={importing}
            >
              Import
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleImport}
              className="hidden"
            />
            <Button icon={Plus} onClick={() => navigate("/admin/members/new")}>
              Add Member
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className={`mb-1 block text-xs font-medium ${filters.search ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Search {filters.search && "●"}
          </label>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${filters.search ? "text-brand-500" : "text-gray-400"}`} />
            <input
              type="text"
              placeholder="Name, phone, email..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className={`w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 ${
                filters.search
                  ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "ring-gray-300 dark:ring-gray-600"
              }`}
            />
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.is_active !== "" ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Status {filters.is_active !== "" && "●"}
          </label>
          <select
            value={filters.is_active}
            onChange={(e) => setFilters((f) => ({ ...f, is_active: e.target.value }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.is_active !== ""
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {/* Has Plan filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.has_plan !== "" ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Has Plan {filters.has_plan !== "" && "●"}
          </label>
          <select
            value={filters.has_plan}
            onChange={(e) => setFilters((f) => ({ ...f, has_plan: e.target.value, plan_id: e.target.value === "false" ? "" : f.plan_id }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.has_plan !== ""
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All</option>
            <option value="true">Has Active Plan</option>
            <option value="false">No Plan</option>
          </select>
        </div>

        {/* Specific Plan filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.plan_id ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Specific Plan {filters.plan_id && "●"}
          </label>
          <select
            value={filters.plan_id}
            onChange={(e) => setFilters((f) => ({ ...f, plan_id: e.target.value, has_plan: e.target.value ? "true" : f.has_plan }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.plan_id
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All Plans</option>
            {plans.filter(p => p.is_active).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>

        {/* Has Credit filter */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.has_credit !== "" ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Credit {filters.has_credit !== "" && "●"}
          </label>
          <select
            value={filters.has_credit}
            onChange={(e) => setFilters((f) => ({ ...f, has_credit: e.target.value }))}
            className={`rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.has_credit !== ""
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          >
            <option value="">All</option>
            <option value="true">Has Credit</option>
            <option value="false">No Credit</option>
          </select>
        </div>

        {/* Joined After */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.joined_after ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Joined After {filters.joined_after && "●"}
          </label>
          <input
            type="date"
            value={filters.joined_after}
            onChange={(e) => setFilters((f) => ({ ...f, joined_after: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.joined_after
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>

        {/* Joined Before */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${filters.joined_before ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"}`}>
            Joined Before {filters.joined_before && "●"}
          </label>
          <input
            type="date"
            value={filters.joined_before}
            onChange={(e) => setFilters((f) => ({ ...f, joined_before: e.target.value }))}
            className={`rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-600 dark:text-gray-100 ${
              filters.joined_before
                ? "ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-950"
                : "ring-gray-300 dark:ring-gray-600 dark:bg-gray-800"
            }`}
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
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
        onRowClick={(row) => navigate(`/admin/members/${row.id}`)}
        page={page}
        totalPages={Math.ceil(data.total / perPage)}
        onPageChange={setPage}
        emptyMessage="No members found"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Plus, Search, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { exportMembersCsv, getMembers, importMembersCsv } from "../../../api/members";
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

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
      setSearch("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    setLoading(true);
    getMembers({ search: search || undefined, page, per_page: perPage })
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load members"))
      .finally(() => setLoading(false));
  }, [search, page]);

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
      key: "credit_balance",
      label: "Credit",
      render: (row) => (
        <span className="font-medium">
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
      render: (row) =>
        formatDate(row.created_at, timezone, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
    },
  ];

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

      {/* Search */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="block w-full rounded-lg border-0 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800"
          />
        </div>
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

import { useEffect, useState } from "react";
import { Download, Filter } from "lucide-react";
import toast from "react-hot-toast";
import { getTransactions } from "../../../api/payments";
import { exportCsv } from "../../../api/reports";
import { useTimezone, formatDateTime } from "../../../context/TimezoneContext";
import Badge from "../../../shared/Badge";
import Button from "../../../shared/Button";
import PageHeader from "../../../shared/PageHeader";
import Table from "../../../shared/Table";

export default function TransactionsList() {
  const timezone = useTimezone();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    transaction_type: "",
    payment_method: "",
    start_date: "",
    end_date: "",
  });
  const perPage = 25;

  const load = () => {
    setLoading(true);
    const params = { page, per_page: perPage };
    if (filters.transaction_type) params.transaction_type = filters.transaction_type;
    if (filters.payment_method) params.payment_method = filters.payment_method;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;

    getTransactions(params)
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load transactions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, filters]);

  const handleExport = async () => {
    try {
      const blob = await exportCsv({
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to export CSV");
    }
  };

  const typeColors = {
    payment: "green",
    refund: "red",
    credit_add: "blue",
    credit_use: "purple",
    manual_adjustment: "yellow",
  };

  const methodColors = {
    cash: "green",
    card: "blue",
    credit: "purple",
    manual: "gray",
  };

  const columns = [
    {
      key: "created_at",
      label: "Date",
      render: (row) =>
        formatDateTime(row.created_at, timezone, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
    },
    {
      key: "transaction_type",
      label: "Type",
      render: (row) => (
        <Badge color={typeColors[row.transaction_type] || "gray"}>
          {row.transaction_type.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "payment_method",
      label: "Method",
      render: (row) => (
        <Badge color={methodColors[row.payment_method] || "gray"}>
          {row.payment_method}
        </Badge>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (row) => (
        <span
          className={`font-semibold ${
            row.transaction_type === "refund" || row.transaction_type === "credit_use"
              ? "text-red-600"
              : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {row.transaction_type === "refund" || row.transaction_type === "credit_use"
            ? "-"
            : ""}
          ${Number(row.amount).toFixed(2)}
        </span>
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

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={`${data.total} transaction${data.total !== 1 ? "s" : ""}`}
        actions={
          <Button variant="secondary" icon={Download} onClick={handleExport}>
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Type
          </label>
          <select
            value={filters.transaction_type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, transaction_type: e.target.value }))
            }
            className="rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All types</option>
            <option value="payment">Payment</option>
            <option value="refund">Refund</option>
            <option value="credit_add">Credit Add</option>
            <option value="credit_use">Credit Use</option>
            <option value="manual_adjustment">Manual</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Method
          </label>
          <select
            value={filters.payment_method}
            onChange={(e) =>
              setFilters((f) => ({ ...f, payment_method: e.target.value }))
            }
            className="rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="credit">Credit</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            From
          </label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) =>
              setFilters((f) => ({ ...f, start_date: e.target.value }))
            }
            className="rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            To
          </label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) =>
              setFilters((f) => ({ ...f, end_date: e.target.value }))
            }
            className="rounded-lg border-0 py-2 px-3 text-sm shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-brand-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        {(filters.transaction_type ||
          filters.payment_method ||
          filters.start_date ||
          filters.end_date) && (
          <button
            onClick={() =>
              setFilters({
                transaction_type: "",
                payment_method: "",
                start_date: "",
                end_date: "",
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
        emptyMessage="No transactions found"
      />
    </div>
  );
}

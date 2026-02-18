import { useEffect, useState } from "react";
import {
  Activity,
  DollarSign,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { getDashboard } from "../../api/reports";
import StatCard from "../../shared/StatCard";
import PageHeader from "../../shared/PageHeader";
import Card from "../../shared/Card";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch((err) => toast.error(err.response?.data?.detail || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of today's pool activity"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Check-ins Today"
          value={stats?.total_checkins_today ?? 0}
          icon={Activity}
          color="brand"
        />
        <StatCard
          title="Unique Swimmers"
          value={stats?.unique_members_today ?? 0}
          icon={UserCheck}
          color="emerald"
        />
        <StatCard
          title="Revenue Today"
          value={`$${Number(stats?.revenue_today ?? 0).toFixed(2)}`}
          icon={DollarSign}
          color="purple"
        />
        <StatCard
          title="Active Memberships"
          value={stats?.active_memberships ?? 0}
          icon={Users}
          color="amber"
        />
        <StatCard
          title="Guests Today"
          value={stats?.guests_today ?? 0}
          icon={TrendingUp}
          color="rose"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              href="/admin/members"
              label="View Members"
              icon={Users}
            />
            <QuickAction
              href="/admin/plans"
              label="Manage Plans"
              icon={TrendingUp}
            />
            <QuickAction
              href="/admin/transactions"
              label="Transactions"
              icon={DollarSign}
            />
            <QuickAction
              href="/admin/reports"
              label="View Reports"
              icon={Activity}
            />
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            System Status
          </h3>
          <div className="space-y-3">
            <StatusRow label="Backend API" status="online" />
            <StatusRow label="Database" status="online" />
            <StatusRow label="Payment Adapter" status="stub" />
            <StatusRow label="Notifications" status="pending" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
    >
      <Icon className="h-4 w-4 text-gray-400" />
      {label}
    </a>
  );
}

function StatusRow({ label, status }) {
  const colors = {
    online: "bg-emerald-500",
    offline: "bg-red-500",
    stub: "bg-amber-500",
    pending: "bg-gray-400",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${colors[status]}`} />
        <span className="text-xs font-medium capitalize text-gray-500">
          {status}
        </span>
      </div>
    </div>
  );
}

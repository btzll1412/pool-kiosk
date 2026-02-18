import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getRevenueReport, getMembershipReport } from "../../../api/reports";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import StatCard from "../../../shared/StatCard";
import { DollarSign, TrendingUp, Users } from "lucide-react";

export default function RevenueReport() {
  const [revenue, setRevenue] = useState(null);
  const [memberships, setMemberships] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [groupBy, setGroupBy] = useState("day");

  useEffect(() => {
    setLoading(true);
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - parseInt(range) * 86400000)
      .toISOString()
      .split("T")[0];

    Promise.all([
      getRevenueReport({ start_date: start, end_date: end, group_by: groupBy }),
      getMembershipReport(),
    ])
      .then(([rev, mem]) => {
        setRevenue(rev);
        setMemberships(mem);
      })
      .finally(() => setLoading(false));
  }, [range, groupBy]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  const chartData =
    revenue?.items?.map((item) => ({
      name: item.period,
      Cash: parseFloat(item.cash),
      Card: parseFloat(item.card),
      Credit: parseFloat(item.credit),
    })) || [];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue analytics and membership insights"
      />

      {/* Top stats */}
      <div className="grid gap-5 sm:grid-cols-3 mb-6">
        <StatCard
          title="Total Revenue"
          value={`$${Number(revenue?.grand_total ?? 0).toFixed(2)}`}
          icon={DollarSign}
          color="purple"
          trend={`Last ${range} days`}
        />
        <StatCard
          title="Active Memberships"
          value={memberships?.total_active ?? 0}
          icon={Users}
          color="emerald"
        />
        <StatCard
          title="Expiring Soon"
          value={memberships?.expiring_soon ?? 0}
          icon={TrendingUp}
          color="amber"
          trend="Within 7 days"
        />
      </div>

      {/* Revenue Chart */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-gray-900">
            Revenue Breakdown
          </h3>
          <div className="flex gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-lg border-0 py-1.5 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-lg border-0 py-1.5 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
            >
              <option value="day">By day</option>
              <option value="week">By week</option>
              <option value="month">By month</option>
            </select>
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                }}
                formatter={(v) => [`$${v.toFixed(2)}`]}
              />
              <Legend />
              <Bar dataKey="Cash" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Card" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Credit" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">
            No revenue data for this period
          </div>
        )}
      </Card>

      {/* Membership breakdown */}
      {memberships && Object.keys(memberships.by_plan || {}).length > 0 && (
        <Card>
          <CardHeader title="Active Memberships by Plan" />
          <div className="space-y-3">
            {Object.entries(memberships.by_plan).map(([plan, count]) => {
              const pct = memberships.total_active
                ? Math.round((count / memberships.total_active) * 100)
                : 0;
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {plan}
                    </span>
                    <span className="text-sm text-gray-500">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

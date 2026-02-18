import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getSwimReport } from "../../../api/reports";
import Card, { CardHeader } from "../../../shared/Card";
import PageHeader from "../../../shared/PageHeader";
import StatCard from "../../../shared/StatCard";
import { Activity, TrendingUp, Users } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

export default function SwimReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");

  useEffect(() => {
    setLoading(true);
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - parseInt(range) * 86400000)
      .toISOString()
      .split("T")[0];

    getSwimReport({ start_date: start, end_date: end })
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  const pieData = data?.by_type
    ? Object.entries(data.by_type).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
      }))
    : [];

  return (
    <div>
      <PageHeader
        title="Swim Report"
        description="Check-in analytics and swim data"
        actions={
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border-0 py-2 pl-3 pr-8 text-sm shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        }
      />

      <div className="grid gap-5 sm:grid-cols-3 mb-6">
        <StatCard
          title="Total Swims"
          value={data?.total_swims ?? 0}
          icon={Activity}
          color="brand"
        />
        <StatCard
          title="Unique Swimmers"
          value={data?.unique_swimmers ?? 0}
          icon={Users}
          color="emerald"
        />
        <StatCard
          title="Daily Average"
          value={data?.average_daily ?? 0}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {pieData.length > 0 && (
        <Card>
          <CardHeader title="Check-ins by Type" />
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

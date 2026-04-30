"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendDatum = {
  date: string;
  sales: number;
};

type StatusDatum = {
  name: string;
  value: number;
};

type DashboardChartsProps = {
  trend: TrendDatum[];
  status: StatusDatum[];
};

const statusColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];

export function DashboardCharts({ trend, status }: DashboardChartsProps) {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
      <section className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">销售趋势</h2>
          <p className="mt-1 text-sm text-slate-500">近 7 天销售额</p>
        </div>
        <div className="h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={trend} margin={{ left: 0, right: 16, top: 10 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" tickLine={false} />
              <YAxis stroke="#64748b" tickFormatter={(value) => `¥${Number(value) / 1000}k`} tickLine={false} width={56} />
              <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString("zh-CN")}`, "销售额"]} />
              <Area dataKey="sales" fill="url(#salesGradient)" stroke="#10b981" strokeWidth={2} type="monotone" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">订单状态分布</h2>
          <p className="mt-1 text-sm text-slate-500">按当前订单状态统计</p>
        </div>
        <div className="h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie data={status} dataKey="value" innerRadius={58} nameKey="name" outerRadius={92} paddingAngle={3}>
                {status.map((entry, index) => (
                  <Cell fill={statusColors[index % statusColors.length]} key={entry.name} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} 单`, "订单数"]} />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

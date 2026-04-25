"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MarketingChartsProps = {
  growth: Array<{ label: string; newUsers: number; activeUsers: number }>;
  tags: Array<{ name: string; count: number }>;
};

export function MarketingCharts({ growth, tags }: MarketingChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">用户增长与活跃</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis allowDecimals={false} tickLine={false} />
              <Tooltip formatter={(value, name) => [value, name === "newUsers" ? "新增用户" : "活跃用户"]} />
              <Line dataKey="newUsers" name="新增用户" stroke="#2563eb" strokeWidth={2} type="monotone" />
              <Line dataKey="activeUsers" name="活跃用户" stroke="#dc2626" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">画像标签分布</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={tags} layout="vertical" margin={{ left: 36 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis allowDecimals={false} type="number" />
              <YAxis dataKey="name" tick={{ fontSize: 12 }} type="category" width={112} />
              <Tooltip formatter={(value) => [`${value} 人`, "人数"]} />
              <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

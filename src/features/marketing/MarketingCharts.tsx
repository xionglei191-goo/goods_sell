"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { dashboardChartAxis, dashboardChartGrid, dashboardTooltipWrapper } from "@/components/charts/chartTheme";

type MarketingChartsProps = {
  growth: Array<{ label: string; newUsers: number; activeUsers: number }>;
  tags: Array<{ name: string; count: number }>;
};

export function MarketingCharts({ growth, tags }: MarketingChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">用户增长与活跃</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={growth}>
              <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={dashboardChartAxis} tickLine={false} />
              <YAxis allowDecimals={false} stroke={dashboardChartAxis} tickLine={false} />
              <Tooltip formatter={(value, name) => [value, name === "newUsers" ? "新增用户" : "活跃用户"]} wrapperStyle={dashboardTooltipWrapper} />
              <Line dataKey="newUsers" name="新增用户" stroke="#f97316" strokeWidth={2} type="monotone" />
              <Line dataKey="activeUsers" name="活跃用户" stroke="#d8001b" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">画像标签分布</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={tags} layout="vertical" margin={{ left: 36 }}>
              <CartesianGrid horizontal={false} stroke={dashboardChartGrid} strokeDasharray="3 3" />
              <XAxis allowDecimals={false} stroke={dashboardChartAxis} type="number" />
              <YAxis dataKey="name" stroke={dashboardChartAxis} tick={{ fontSize: 12 }} type="category" width={112} />
              <Tooltip formatter={(value) => [`${value} 人`, "人数"]} wrapperStyle={dashboardTooltipWrapper} />
              <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

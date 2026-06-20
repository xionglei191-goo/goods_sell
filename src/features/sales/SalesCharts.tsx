"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { dashboardChartAxis, dashboardChartGrid, dashboardTooltipWrapper } from "@/components/charts/chartTheme";
import { formatCurrency } from "@/features/orders/utils";

type SalesChartsProps = {
  trend: Array<{ label: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; sales: number; quantity: number }>;
};

export function SalesCharts({ trend, topProducts }: SalesChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">销售趋势</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={trend}>
              <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={dashboardChartAxis} tickLine={false} />
              <YAxis stroke={dashboardChartAxis} tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} />
              <Tooltip formatter={(value, name) => [name === "sales" ? formatCurrency(Number(value)) : value, name === "sales" ? "销售额" : "订单数"]} wrapperStyle={dashboardTooltipWrapper} />
              <Line dataKey="sales" name="销售额" stroke="#f97316" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">TOP10 畅销产品</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={topProducts} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid horizontal={false} stroke={dashboardChartGrid} strokeDasharray="3 3" />
              <XAxis stroke={dashboardChartAxis} tickFormatter={(value) => `${Number(value) / 1000}k`} type="number" />
              <YAxis dataKey="name" stroke={dashboardChartAxis} tick={{ fontSize: 12 }} type="category" width={96} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} wrapperStyle={dashboardTooltipWrapper} />
              <Bar dataKey="sales" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

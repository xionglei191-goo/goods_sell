"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { dashboardChartAxis, dashboardChartGrid, dashboardTooltipWrapper } from "@/components/charts/chartTheme";
import { formatCurrency } from "@/features/orders/utils";

export function IncomeTrendChart({ data }: { data: Array<{ label: string; income: number }> }) {
  return (
    <div className="h-80">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={dashboardChartAxis} tickLine={false} />
          <YAxis stroke={dashboardChartAxis} tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} wrapperStyle={dashboardTooltipWrapper} />
          <Line dataKey="income" name="收入" stroke="#f97316" strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgingChart({ data }: { data: Array<{ bucket: string; amount: number }> }) {
  return (
    <div className="h-72">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" stroke={dashboardChartAxis} />
          <YAxis stroke={dashboardChartAxis} tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} wrapperStyle={dashboardTooltipWrapper} />
          <Bar dataKey="amount" fill="#ffa600" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

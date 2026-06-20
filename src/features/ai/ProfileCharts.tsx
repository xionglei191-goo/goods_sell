"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { dashboardChartAxis, dashboardChartGrid, dashboardTooltipWrapper } from "@/components/charts/chartTheme";
import { formatCurrency } from "@/features/orders/utils";

export function ProfileTrendChart({ data }: { data: Array<{ month: string; amount: number }> }) {
  return (
    <div className="h-56">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" stroke={dashboardChartAxis} tick={{ fontSize: 12 }} />
          <YAxis stroke={dashboardChartAxis} tickFormatter={(value) => `${Number(value) / 1000}k`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} wrapperStyle={dashboardTooltipWrapper} />
          <Line dataKey="amount" name="消费额" stroke="#e86f51" strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

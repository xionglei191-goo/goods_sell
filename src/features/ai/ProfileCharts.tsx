"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/features/orders/utils";

export function ProfileTrendChart({ data }: { data: Array<{ month: string; amount: number }> }) {
  return (
    <div className="h-56">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Line dataKey="amount" name="消费额" stroke="#2563eb" strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

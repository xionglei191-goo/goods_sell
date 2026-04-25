"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/features/orders/utils";

export function IncomeTrendChart({ data }: { data: Array<{ label: string; income: number }> }) {
  return (
    <div className="h-80">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} />
          <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Line dataKey="income" name="收入" stroke="#2563eb" strokeWidth={2} type="monotone" />
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
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="bucket" />
          <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

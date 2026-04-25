"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/features/orders/utils";

type SalesChartsProps = {
  trend: Array<{ label: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; sales: number; quantity: number }>;
};

export function SalesCharts({ trend, topProducts }: SalesChartsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">销售趋势</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} />
              <Tooltip formatter={(value, name) => [name === "sales" ? formatCurrency(Number(value)) : value, name === "sales" ? "销售额" : "订单数"]} />
              <Line dataKey="sales" name="销售额" stroke="#2563eb" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">TOP10 畅销产品</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={topProducts} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis tickFormatter={(value) => `${Number(value) / 1000}k`} type="number" />
              <YAxis dataKey="name" tick={{ fontSize: 12 }} type="category" width={96} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="sales" fill="#dc2626" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

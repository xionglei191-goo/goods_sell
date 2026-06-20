"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { dashboardChartAxis, dashboardChartGrid, dashboardTooltipWrapper } from "@/components/charts/chartTheme";

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

const statusColors = ["#e86f51", "#16a34a", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7"];
const chartHeight = 288;

function ChartFrame({ children }: { children: (width: number, height: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const updateWidth = () => {
      setWidth(Math.max(1, Math.floor(node.getBoundingClientRect().width)));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-72 min-h-72 min-w-0 w-full" ref={ref}>
      {width > 0 ? children(width, chartHeight) : <div className="h-full w-full animate-pulse rounded-md bg-orange-50" />}
    </div>
  );
}

export function DashboardCharts({ trend, status }: DashboardChartsProps) {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
      <section className="dashboard-data-card min-w-0 p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-950">销售趋势</h2>
          <p className="mt-1 text-sm text-neutral-500">近 7 天销售额</p>
        </div>
        <ChartFrame>
          {(width, height) => (
            <AreaChart data={trend} height={height} margin={{ left: 0, right: 16, top: 10 }} width={width}>
              <defs>
                <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#e86f51" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#e86f51" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={dashboardChartGrid} strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke={dashboardChartAxis} tickLine={false} />
              <YAxis stroke={dashboardChartAxis} tickFormatter={(value) => `¥${Number(value) / 1000}k`} tickLine={false} width={56} />
              <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString("zh-CN")}`, "销售额"]} wrapperStyle={dashboardTooltipWrapper} />
              <Area dataKey="sales" fill="url(#salesGradient)" stroke="#e86f51" strokeWidth={2} type="monotone" />
            </AreaChart>
          )}
        </ChartFrame>
      </section>

      <section className="dashboard-data-card min-w-0 p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-950">订单状态分布</h2>
          <p className="mt-1 text-sm text-neutral-500">按当前订单状态统计</p>
        </div>
        <ChartFrame>
          {(width, height) => (
            <PieChart height={height} width={width}>
              <Pie data={status} dataKey="value" innerRadius={58} nameKey="name" outerRadius={92} paddingAngle={3}>
                {status.map((entry, index) => (
                  <Cell fill={statusColors[index % statusColors.length]} key={entry.name} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} 单`, "订单数"]} wrapperStyle={dashboardTooltipWrapper} />
              <Legend iconType="circle" />
            </PieChart>
          )}
        </ChartFrame>
      </section>
    </div>
  );
}

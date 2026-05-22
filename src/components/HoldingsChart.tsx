"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HoldingsPoint } from "@/lib/types";
import { formatUsd, formatUsdShort, formatDate } from "@/lib/format";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="mb-1 text-faint">{formatDate(label)}</div>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatUsd(entry.value)}
        </div>
      ))}
    </div>
  );
}

export function HoldingsChart({ data }: { data: HoldingsPoint[] }) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[13px] font-medium text-ink">
          HODLings value over time
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-[3px] w-3.5 bg-up" />
          portfolio value
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-bitcoin" />
          BTC price
        </span>
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <CartesianGrid
              stroke="#232830"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(0, 4)}
              minTickGap={44}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={formatUsdShort}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
              width={54}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatUsdShort}
              tick={{ fill: "#f7931a", fontSize: 11 }}
              stroke="#232830"
              width={54}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="portfolioValue"
              name="Portfolio value"
              stroke="#16c784"
              strokeWidth={2}
              fill="#16c784"
              fillOpacity={0.15}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="btcPrice"
              name="BTC price"
              stroke="#f7931a"
              strokeWidth={1.6}
              strokeDasharray="4 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

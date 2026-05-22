"use client";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Lot } from "@/lib/types";
import { formatUsd, formatUsdShort, formatDateShort } from "@/lib/format";

function SubmarineTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="text-faint">
        {formatDateShort(p.dateStr)} · {p.source}
      </div>
      <div className="text-ink">Buy price: {formatUsd(p.y)}</div>
      <div className="text-ink">Amount: {formatUsd(p.z)}</div>
      <div className={p.roi >= 0 ? "text-up" : "text-down"}>
        ROI: {(p.roi * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export function SubmarineChart({
  lots,
  currentPrice,
}: {
  lots: Lot[];
  currentPrice: number;
}) {
  const points = lots.map((l) => ({
    x: new Date(l.date.replace(" ", "T") + "Z").getTime(),
    y: l.buyPrice,
    z: l.usd,
    roi: l.roi,
    source: l.source,
    dateStr: l.date,
  }));
  const inProfit = points.filter((p) => p.y <= currentPrice);
  const underwater = points.filter((p) => p.y > currentPrice);

  const prices = points.map((p) => p.y);
  const yMin = Math.max(1, Math.min(...prices) * 0.7);
  const yMax = Math.max(...prices, currentPrice) * 1.3;

  const times = points.map((p) => p.x);
  const minYear = new Date(Math.min(...times)).getUTCFullYear();
  const maxYear = new Date(Math.max(...times)).getUTCFullYear();
  const yearTicks: number[] = [];
  for (let y = minYear; y <= maxYear + 1; y++) {
    yearTicks.push(Date.UTC(y, 0, 1));
  }

  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-[13px] font-medium text-ink">
          Submarine chart — buy price vs. time
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-up" />
          in profit
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-down" />
          underwater
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-0 w-3.5 border-t border-dashed border-muted" />
          current price
        </span>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[yearTicks[0], yearTicks[yearTicks.length - 1]]}
              ticks={yearTicks}
              tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
            />
            <YAxis
              type="number"
              dataKey="y"
              scale="log"
              domain={[yMin, yMax]}
              allowDataOverflow
              tickFormatter={formatUsdShort}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
              width={54}
            />
            <ZAxis type="number" dataKey="z" range={[16, 320]} />
            <ReferenceLine
              y={currentPrice}
              stroke="#8a8f99"
              strokeDasharray="5 4"
            />
            <Tooltip
              content={<SubmarineTooltip />}
              cursor={{ strokeDasharray: "3 3" }}
            />
            <Scatter
              name="in profit"
              data={inProfit}
              fill="#16c784"
              fillOpacity={0.7}
            />
            <Scatter
              name="underwater"
              data={underwater}
              fill="#ea3943"
              fillOpacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

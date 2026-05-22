"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PowerLawResult } from "@/lib/powerlaw";
import { formatUsd } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";

const GENESIS_MS = Date.UTC(2009, 0, 3);
const DAY_MS = 86400000;

function priceTick(v: number): string {
  if (v >= 1000000) return "$" + (v / 1000000).toFixed(1) + "M";
  if (v >= 1000) return "$" + Math.round(v / 1000) + "K";
  if (v >= 1) return "$" + Math.round(v);
  return "$" + v;
}

function PowerLawTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const year = new Date(GENESIS_MS + p.days * DAY_MS).getUTCFullYear();
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="text-faint">~{year}</div>
      <div className="text-bitcoin">Price: {formatUsd(p.price)}</div>
      <div className="text-muted">Model: {formatUsd(p.model)}</div>
    </div>
  );
}

export function PowerLawSection({ data }: { data: PowerLawResult }) {
  const aboveModel = data.multiplier >= 1;
  const years = [2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026];
  const yearTicks = years.map((y) => (Date.UTC(y, 0, 1) - GENESIS_MS) / DAY_MS);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Current price" value={formatUsd(data.currentPrice)} />
        <MetricCard
          label="Power-law model"
          value={formatUsd(data.modelPriceNow)}
        />
        <MetricCard
          label="Market / model"
          value={data.multiplier.toFixed(2) + "×"}
          accent={aboveModel ? "up" : "down"}
        />
        <MetricCard label="Slope β" value={data.beta.toFixed(3)} />
        <MetricCard
          label="Fit R²"
          value={(data.r2 * 100).toFixed(1) + "%"}
        />
      </div>

      <Panel
        title="Bitcoin power law — price vs. time (log-log)"
        legend={
          <>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-[3px] w-3.5 bg-bitcoin" />
              actual price
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-muted" />
              power-law model
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-up" />
              today
            </span>
          </>
        }
      >
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data.points}
              margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
              <XAxis
                dataKey="days"
                type="number"
                scale="log"
                domain={[600, 7000]}
                ticks={yearTicks}
                tickFormatter={(d: number) =>
                  String(new Date(GENESIS_MS + d * DAY_MS).getUTCFullYear())
                }
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                allowDataOverflow
              />
              <YAxis
                type="number"
                scale="log"
                domain={[0.1, 1000000]}
                ticks={[0.1, 1, 10, 100, 1000, 10000, 100000, 1000000]}
                tickFormatter={priceTick}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                width={54}
                allowDataOverflow
              />
              <Tooltip content={<PowerLawTooltip />} />
              <Line
                type="linear"
                dataKey="model"
                stroke="#8a8f99"
                strokeWidth={1.6}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="price"
                stroke="#f7931a"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={data.nowDays}
                y={data.currentPrice}
                r={4}
                fill="#16c784"
                stroke="#0d0f12"
                strokeWidth={1.5}
                isFront
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Bitcoin&apos;s price has historically tracked a power law of time
          since the 2009 genesis block — close to a straight line on these
          log-log axes. The dashed line is a least-squares fit of the price
          history; the green dot marks today. A market / model ratio above
          1.0 means price sits above the long-run trend. Shown for educational
          purposes — not a prediction.
        </p>
      </Panel>

      <Panel title="Power-law model — forward fair value">
        <div className="grid grid-cols-3 gap-2">
          {data.projections.map((p) => (
            <div key={p.label} className="rounded-lg bg-night px-4 py-3">
              <div className="mb-1 text-xs text-muted">{p.label}</div>
              <div className="font-mono text-lg font-medium text-ink">
                {priceTick(p.model)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

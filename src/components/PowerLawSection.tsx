"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PowerLawResult, FuturePoint } from "@/lib/powerlaw";
import type { Snapshot } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";

const GENESIS_MS = Date.UTC(2009, 0, 3);
const DAY_MS = 86400000;

function priceTick(v: number): string {
  if (v >= 1_000_000_000) return "$" + (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
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

// ─── Holdings projection tooltip ──────────────────────────────────────────────

// chartData already stores portfolio values (btcPrice × totalBtc), so the
// tooltip reads the pre-computed keys directly — no second multiplication.
// dcaValue is also pre-computed and optional.
function ProjectionTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as {
    days: number;
    bear: number;
    pessimistic: number;
    median: number;
    optimistic: number;
    bull: number;
    dcaValue?: number;
  };
  const date = new Date(GENESIS_MS + p.days * DAY_MS);
  const label =
    date.toLocaleString("default", { month: "short", timeZone: "UTC" }) +
    " " +
    date.getUTCFullYear();
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px] space-y-0.5">
      <div className="mb-1 font-medium text-ink">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-[#16c784]">Bull (+2σ)</span>
        <span className="text-ink">{priceTick(p.bull)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[#22c55e]">Optimistic (+1σ)</span>
        <span className="text-ink">{priceTick(p.optimistic)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-bitcoin">Base (model)</span>
        <span className="text-ink">{priceTick(p.median)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[#f97316]">Pessimistic (−1σ)</span>
        <span className="text-ink">{priceTick(p.pessimistic)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[#ef4444]">Bear (−2σ)</span>
        <span className="text-ink">{priceTick(p.bear)}</span>
      </div>
      {p.dcaValue != null && (
        <div className="mt-1 flex justify-between gap-4 border-t border-edge pt-1">
          <span className="text-white">+ DCA stack</span>
          <span className="font-medium text-white">{priceTick(p.dcaValue)}</span>
        </div>
      )}
    </div>
  );
}

// ─── DCA options ───────────────────────────────────────────────────────────────

const DCA_OPTIONS = [0, 50, 100, 200, 300] as const;
type DcaAmount = (typeof DCA_OPTIONS)[number];

// ─── Holdings projection panel ─────────────────────────────────────────────────

function HoldingsProjectionPanel({
  data,
  snapshot,
}: {
  data: PowerLawResult;
  snapshot: Snapshot;
}) {
  const { totalBtc, totalInvested, currentValue } = snapshot;
  const { futurePoints, projections, nowDays, currentPrice, sigma, intercept, beta } = data;

  // ── DCA state ──────────────────────────────────────────────────────────────
  const [dcaAmount, setDcaAmount] = useState<DcaAmount>(0);

  /**
   * Daily DCA accumulation — runs once per DCA amount selection.
   *
   * Strategy: BASE scenario only. Each future day the user buys
   * `dcaAmount / modelPrice(day)` BTC at the power-law model price.
   * Portfolio value at each monthly checkpoint =
   *   (existingBtc + accumulated DCA BTC) × modelPrice(checkpoint).
   *
   * Returns one value per futurePoints entry, aligned by index.
   */
  const dcaPortfolioValues = useMemo<number[]>(() => {
    if (dcaAmount === 0) return [];
    const startDay = Math.round(nowDays);
    const endDay = Math.round(futurePoints[futurePoints.length - 1].days);
    let accBtc = totalBtc;
    let fpIdx = 0;
    const result: number[] = new Array(futurePoints.length).fill(0);

    for (let d = startDay; d <= endDay; d++) {
      // Buy at model price on every day *after* today
      if (d > startDay) {
        const modelPriceDay = Math.pow(10, intercept + beta * Math.log10(d));
        accBtc += dcaAmount / modelPriceDay;
      }
      // Capture value at each monthly checkpoint (futurePoints are ~30 days apart)
      while (
        fpIdx < futurePoints.length &&
        Math.round(futurePoints[fpIdx].days) <= d
      ) {
        // Use the model (median) price at this checkpoint for evaluation
        result[fpIdx] = accBtc * futurePoints[fpIdx].median;
        fpIdx++;
      }
    }
    return result;
  }, [dcaAmount, futurePoints, nowDays, totalBtc, intercept, beta]);

  // Transform future price points → portfolio value points for the chart,
  // merging in the DCA overlay values when active.
  const chartData = useMemo(
    () =>
      futurePoints.map((fp, i) => ({
        ...fp,
        bear: fp.bear * totalBtc,
        pessimistic: fp.pessimistic * totalBtc,
        median: fp.median * totalBtc,
        optimistic: fp.optimistic * totalBtc,
        bull: fp.bull * totalBtc,
        ...(dcaAmount > 0 ? { dcaValue: dcaPortfolioValues[i] } : {}),
      })),
    [futurePoints, totalBtc, dcaAmount, dcaPortfolioValues],
  );

  // Y-axis: span bear → max(bull, DCA). Build decade ticks.
  const minVal = Math.min(...chartData.map((d) => d.bear));
  const dcaMax =
    dcaAmount > 0
      ? Math.max(...dcaPortfolioValues.filter(Boolean))
      : 0;
  const maxVal = Math.max(Math.max(...chartData.map((d) => d.bull)), dcaMax);
  const logMin = Math.floor(Math.log10(Math.max(minVal, 1)));
  const logMax = Math.ceil(Math.log10(maxVal));
  const yTicks: number[] = [];
  for (let e = logMin; e <= logMax; e++) {
    yTicks.push(Math.pow(10, e));
  }

  // X-axis: years from nowDays to ~15 years out
  const startYear = new Date(GENESIS_MS + nowDays * DAY_MS).getUTCFullYear();
  const endYear = startYear + 15;
  const yearTicks: number[] = [];
  for (let y = startYear; y <= endYear; y += 2) {
    yearTicks.push(
      Math.max(1, (Date.UTC(y, 0, 1) - GENESIS_MS) / DAY_MS),
    );
  }

  // Projection cards: show portfolio value for bear/base/bull
  const scenarios = [
    { key: "bear" as const, label: "Bear (−2σ)", color: "#ef4444" },
    { key: "pessimistic" as const, label: "Pessimistic (−1σ)", color: "#f97316" },
    { key: "model" as const, label: "Base (model)", color: "#f7931a" },
    { key: "optimistic" as const, label: "Optimistic (+1σ)", color: "#22c55e" },
    { key: "bull" as const, label: "Bull (+2σ)", color: "#16c784" },
  ];

  return (
    <>
      <Panel
        title="My stack projection — portfolio value by scenario"
        legend={
          <span className="flex flex-wrap gap-3">
            {scenarios.map((s) => (
              <span
                key={s.key}
                className="flex items-center gap-1.5 text-[11px] text-muted"
              >
                <span
                  className="inline-block h-[3px] w-3.5 rounded"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            ))}
            {dcaAmount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="inline-block h-[3px] w-3.5 rounded bg-white" />
                DCA ${dcaAmount}/day
              </span>
            )}
          </span>
        }
      >
        {/* ── Assumption strip — lets you spot a bad import instantly ── */}
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { label: "Stack size", value: totalBtc < 1
                ? (totalBtc * 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " sats (" + totalBtc.toFixed(4) + " BTC)"
                : totalBtc.toFixed(4) + " BTC" },
            { label: "Current value", value: priceTick(currentValue) },
            { label: "Cost basis", value: priceTick(totalInvested) },
            { label: "Model today", value: priceTick(data.modelPriceNow) + " / BTC" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded bg-night px-3 py-1.5 text-[11px]">
              <span className="text-faint">{label}: </span>
              <span className="font-mono text-ink">{value}</span>
            </div>
          ))}
        </div>
        {/* ── DCA selector ──────────────────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted">DCA:</span>
          {DCA_OPTIONS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setDcaAmount(amt)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                dcaAmount === amt
                  ? "bg-bitcoin text-night"
                  : "bg-night text-muted hover:text-ink"
              }`}
            >
              {amt === 0 ? "Off" : `$${amt}/day`}
            </button>
          ))}
        </div>

        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
              <XAxis
                dataKey="days"
                type="number"
                scale="log"
                domain={[chartData[0]?.days ?? nowDays, chartData[chartData.length - 1]?.days ?? nowDays + 15 * 365]}
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
                domain={[
                  Math.pow(10, Math.floor(Math.log10(Math.max(minVal * 0.5, 1)))),
                  Math.pow(10, Math.ceil(Math.log10(maxVal * 1.2))),
                ]}
                ticks={yTicks}
                tickFormatter={priceTick}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                width={62}
                allowDataOverflow
              />
              <Tooltip content={<ProjectionTooltip />} />

              {/* Cost-basis reference line */}
              <ReferenceLine
                y={totalInvested}
                stroke="#8a8f99"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{
                  value: "Cost basis",
                  position: "insideTopRight",
                  fill: "#8a8f99",
                  fontSize: 10,
                  dy: -4,
                }}
              />

              {/* Scenario lines — outer bands dashed, inner + median solid */}
              <Line
                type="monotone"
                dataKey="bear"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pessimistic"
                stroke="#f97316"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="#f7931a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="optimistic"
                stroke="#22c55e"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="bull"
                stroke="#16c784"
                strokeWidth={1}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />

              {/* Today dot */}
              <ReferenceDot
                x={nowDays}
                y={currentValue}
                r={4}
                fill="#16c784"
                stroke="#0d0f12"
                strokeWidth={1.5}
                isFront
              />

              {/* DCA overlay — white solid line, drawn on top of scenarios */}
              {dcaAmount > 0 && (
                <Line
                  type="monotone"
                  dataKey="dcaValue"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Scenario bands assume no new buys or sells from your current{" "}
          <span className="text-bitcoin">
            {totalBtc < 1
              ? (totalBtc * 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " sats"
              : totalBtc.toFixed(4) + " BTC"}
          </span>
          . Each σ step multiplies or divides the model price by{" "}
          <span className="text-ink">{Math.pow(10, sigma).toFixed(2)}×</span>{" "}
          (derived from {data.points.length} weekly price points).{" "}
          {dcaAmount > 0 ? (
            <>
              The <span className="text-white">white line</span> shows your
              projected stack if you add{" "}
              <span className="text-white">${dcaAmount}/day</span> at the
              power-law model price — buying price and portfolio value both
              follow the base scenario.{" "}
            </>
          ) : null}
          The dashed gray line is your total cost basis of{" "}
          {formatUsd(totalInvested)}; the green dot marks today&apos;s portfolio
          value. Not a prediction.
        </p>
      </Panel>

      <Panel title="My stack — power-law milestones">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="pb-2 pr-4 font-medium text-muted">Date</th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#ef4444" }}>
                  Bear (−2σ)
                </th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#f97316" }}>
                  Pessimistic (−1σ)
                </th>
                <th className="pb-2 pr-4 font-medium text-bitcoin">Base</th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#22c55e" }}>
                  Optimistic (+1σ)
                </th>
                <th className="pb-2 font-medium" style={{ color: "#16c784" }}>
                  Bull (+2σ)
                </th>
              </tr>
            </thead>
            <tbody>
              {projections.map((proj) => (
                <tr key={proj.label} className="border-b border-edge last:border-0">
                  <td className="py-2 pr-4 text-muted">{proj.label}</td>
                  <td className="py-2 pr-4 font-mono text-ink">
                    {priceTick(proj.bear * totalBtc)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-ink">
                    {priceTick(proj.pessimistic * totalBtc)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-ink">
                    {priceTick(proj.model * totalBtc)}
                  </td>
                  <td className="py-2 pr-4 font-mono text-ink">
                    {priceTick(proj.optimistic * totalBtc)}
                  </td>
                  <td className="py-2 font-mono text-ink">
                    {priceTick(proj.bull * totalBtc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Portfolio value = your {totalBtc < 1
            ? (totalBtc * 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " sats"
            : totalBtc.toFixed(4) + " BTC"} × model price at each milestone date.
          BTC prices at model: {projections.map((p) => `${p.label} ${priceTick(p.model)}`).join(" · ")}.
        </p>
      </Panel>
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PowerLawSection({
  data,
  snapshot,
}: {
  data: PowerLawResult;
  snapshot?: Snapshot;
}) {
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
              <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
                <span style={{ color: "#16c784" }}>
                  Bull: {priceTick(p.bull)}
                </span>
                <span style={{ color: "#ef4444" }}>
                  Bear: {priceTick(p.bear)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {snapshot && (
        <HoldingsProjectionPanel data={data} snapshot={snapshot} />
      )}
    </div>
  );
}

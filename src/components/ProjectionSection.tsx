"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BtcProjection,
  ProjectionModelId,
  ProjectionPoint,
} from "@/lib/projection";
import type { Snapshot } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";
import { DateRangeControls } from "./charts/DateRangeControls";
import { useChartZoom } from "./charts/useChartZoom";
import {
  BACKWARD_PRESETS,
  FORWARD_PRESETS,
  backwardWindowDays,
  forwardWindowDays,
  type BackwardPresetId,
  type ForwardPresetId,
} from "./charts/dateRangePresets";

const GENESIS_MS = Date.UTC(2009, 0, 3);
const DAY_MS = 86400000;

function priceTick(v: number): string {
  if (v >= 1_000_000_000) return "$" + (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  if (v >= 1) return "$" + Math.round(v);
  return "$" + v;
}

/**
 * Build a tick array for a days-since-genesis axis covering [lo, hi]. Adapts
 * tick granularity to range length so the axis stays readable at any zoom:
 * year ticks when zoomed out, month ticks in the middle, week-ish ticks deep.
 */
function daysToTicks(loDays: number, hiDays: number): number[] {
  const range = hiDays - loDays;
  const ticks: number[] = [];
  if (range > 730) {
    const startYear = new Date(GENESIS_MS + loDays * DAY_MS).getUTCFullYear();
    const endYear = new Date(GENESIS_MS + hiDays * DAY_MS).getUTCFullYear();
    const step = range > 10 * 365 ? 2 : 1;
    for (let y = startYear; y <= endYear + 1; y += step) {
      const days = (Date.UTC(y, 0, 1) - GENESIS_MS) / DAY_MS;
      if (days >= loDays && days <= hiDays) ticks.push(Math.max(1, days));
    }
  } else if (range > 90) {
    const d = new Date(GENESIS_MS + loDays * DAY_MS);
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    const step = range > 365 ? 2 : 1;
    while (true) {
      const days = (Date.UTC(y, m, 1) - GENESIS_MS) / DAY_MS;
      if (days > hiDays) break;
      if (days >= loDays) ticks.push(Math.max(1, days));
      m += step;
      while (m > 11) {
        m -= 12;
        y += 1;
      }
    }
  } else {
    for (let dd = loDays; dd <= hiDays; dd += 7) ticks.push(Math.max(1, dd));
  }
  return ticks.length > 0 ? ticks : [Math.max(1, loDays), Math.max(2, hiDays)];
}

function daysTickFormatter(
  loDays: number,
  hiDays: number,
): (d: number) => string {
  const range = hiDays - loDays;
  if (range > 730) {
    return (d) => String(new Date(GENESIS_MS + d * DAY_MS).getUTCFullYear());
  }
  if (range > 90) {
    return (d) => {
      const dt = new Date(GENESIS_MS + d * DAY_MS);
      return dt.toLocaleString("default", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    };
  }
  return (d) => {
    const dt = new Date(GENESIS_MS + d * DAY_MS);
    return dt.toLocaleString("default", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
}

function ModelLineTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload as ProjectionPoint;
  // With daily price data, show the exact date the cursor is on rather than
  // just the year — otherwise zooming in to a single quarter makes every point
  // read "~2026" and there's no way to tell March from May.
  const d = new Date(GENESIS_MS + p.days * DAY_MS);
  const label = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="text-faint">{label}</div>
      {p.price != null && (
        <div className="text-bitcoin">Price: {formatUsd(p.price)}</div>
      )}
      <div className="text-muted">Model: {formatUsd(p.model)}</div>
    </div>
  );
}

// ─── Holdings projection tooltip ──────────────────────────────────────────────

function makeProjectionTooltip(data: BtcProjection) {
  const { bandLabels } = data;
  return function ProjectionTooltip({ active, payload }: any) {
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
          <span className="text-[#16c784]">{bandLabels.bull}</span>
          <span className="text-ink">{priceTick(p.bull)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#22c55e]">{bandLabels.optimistic}</span>
          <span className="text-ink">{priceTick(p.optimistic)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-bitcoin">{bandLabels.median}</span>
          <span className="text-ink">{priceTick(p.median)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#f97316]">{bandLabels.pessimistic}</span>
          <span className="text-ink">{priceTick(p.pessimistic)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#ef4444]">{bandLabels.bear}</span>
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
  };
}

// ─── DCA options ───────────────────────────────────────────────────────────────

const DCA_OPTIONS = [0, 50, 100, 200, 300] as const;
type DcaAmount = (typeof DCA_OPTIONS)[number];

// ─── Holdings projection panel ─────────────────────────────────────────────────

function HoldingsProjectionPanel({
  data,
  snapshot,
}: {
  data: BtcProjection;
  snapshot: Snapshot;
}) {
  const { totalBtc, totalInvested, currentValue } = snapshot;
  const { futurePoints, projections, nowDays, bandLabels, medianAt } = data;

  // ── DCA state ──────────────────────────────────────────────────────────────
  const [dcaAmount, setDcaAmount] = useState<DcaAmount>(0);

  /**
   * Daily DCA accumulation — runs once per DCA amount selection.
   *
   * Strategy: BASE scenario only. Each future day the user buys
   * `dcaAmount / medianModelPrice(day)` BTC at the active model's median
   * price. Portfolio value at each monthly checkpoint =
   *   (existingBtc + accumulated DCA BTC) × medianModelPrice(checkpoint).
   *
   * Calls `data.medianAt(day)` so the same loop works for both Power Law
   * and Quantile Bands without branching on model id.
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
        const modelPriceDay = medianAt(d);
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
  }, [dcaAmount, futurePoints, nowDays, medianAt, totalBtc]);

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

  // Full forward range for zoom — anchor left at today (nowDays), right at the
  // last projection point. Both must be > 0 to keep the log axis well-defined.
  const farthestDays = chartData[chartData.length - 1]?.days ?? nowDays + 15 * 365;
  const fullRangeDays: [number, number] = [nowDays, farthestDays];

  const zoom = useChartZoom({ fullRange: fullRangeDays });

  const handlePreset = (id: string) => {
    const window = forwardWindowDays(
      id as ForwardPresetId,
      nowDays,
      farthestDays,
    );
    zoom.setDomain(window, id);
  };

  const [xLo, xHi] = zoom.domain ?? fullRangeDays;

  // Visible projection slice — used both for Y-axis bounds and for drawing.
  const visibleChartData = useMemo(
    () => chartData.filter((d) => d.days >= xLo && d.days <= xHi),
    [chartData, xLo, xHi],
  );

  // Y-axis: span bear → max(bull, DCA) of the **visible** window. Build decade
  // ticks so the axis snaps to clean round-number lines.
  const visibleValues = useMemo(() => {
    const vals: number[] = [];
    for (const d of visibleChartData) {
      vals.push(d.bear, d.bull);
      if (dcaAmount > 0 && d.dcaValue != null) vals.push(d.dcaValue);
    }
    return vals;
  }, [visibleChartData, dcaAmount]);

  const minVal = visibleValues.length > 0 ? Math.min(...visibleValues) : 1;
  const maxVal = visibleValues.length > 0 ? Math.max(...visibleValues) : 10;
  const logMin = Math.floor(Math.log10(Math.max(minVal, 1)));
  const logMax = Math.ceil(Math.log10(maxVal));
  const yTicks: number[] = [];
  for (let e = logMin; e <= logMax; e++) yTicks.push(Math.pow(10, e));

  const xTicks = useMemo(() => daysToTicks(xLo, xHi), [xLo, xHi]);
  const xFormatter = useMemo(() => daysTickFormatter(xLo, xHi), [xLo, xHi]);

  // Projection cards: show portfolio value for bear/base/bull
  const scenarios = [
    { key: "bear" as const, label: bandLabels.bear, color: "#ef4444" },
    { key: "pessimistic" as const, label: bandLabels.pessimistic, color: "#f97316" },
    { key: "model" as const, label: bandLabels.median, color: "#f7931a" },
    { key: "optimistic" as const, label: bandLabels.optimistic, color: "#22c55e" },
    { key: "bull" as const, label: bandLabels.bull, color: "#16c784" },
  ];

  const Tooltip2 = useMemo(() => makeProjectionTooltip(data), [data]);

  // Model-specific caption explaining how the bands are derived. Power Law's
  // bands come from log-residual sigma; Quantile Bands are the rearranged
  // conditional quantiles themselves — no σ multiplier applies.
  const bandsCaption =
    data.id === "powerlaw" && data.sigma != null ? (
      <>
        Each σ step multiplies or divides the model price by{" "}
        <span className="text-ink">{Math.pow(10, data.sigma).toFixed(2)}×</span>{" "}
        (derived from {data.points.length} weekly price points).{" "}
      </>
    ) : (
      <>
        Bands are the rearranged conditional quantiles of log₁₀(price) from
        Cowen (2026)&apos;s asymmetric quadratic regression in centered
        log-time — Q10/Q25/Q50/Q75/Q95.{" "}
      </>
    );

  const modelFairValueLabel =
    data.id === "powerlaw" ? "Power-law fair value" : "Quantile median (Q50)";

  return (
    <>
      <Panel
        title={`My stack projection — portfolio value by scenario (${data.modelLabel})`}
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
            // Live market price first so the comparison with the model below
            // is immediate — the model fair-value is a regression projection,
            // not a quote, and pairing them defuses the "wait, BTC is $122K?"
            // misread.
            { label: "Live BTC price", value: priceTick(data.currentPrice) + " / BTC" },
            { label: modelFairValueLabel, value: priceTick(data.modelPriceNow) + " / BTC" },
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

        <DateRangeControls
          presets={FORWARD_PRESETS}
          activePreset={zoom.activePreset}
          onPreset={handlePreset}
          onReset={zoom.reset}
        />

        <div className="h-[320px] w-full select-none" onDoubleClick={zoom.reset}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
              onMouseDown={zoom.onMouseDown}
              onMouseMove={zoom.onMouseMove}
              onMouseUp={zoom.onMouseUp}
              onMouseLeave={zoom.onMouseLeave}
            >
              <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
              <XAxis
                dataKey="days"
                type="number"
                scale="log"
                domain={[xLo, xHi]}
                ticks={xTicks}
                tickFormatter={xFormatter}
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
              <Tooltip content={<Tooltip2 />} />

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

              {/* Today dot — only show if inside the visible window */}
              {nowDays >= xLo && nowDays <= xHi && (
                <ReferenceDot
                  x={nowDays}
                  y={currentValue}
                  r={4}
                  fill="#16c784"
                  stroke="#0d0f12"
                  strokeWidth={1.5}
                  isFront
                />
              )}

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

              {zoom.dragStart != null && zoom.dragEnd != null && (
                <ReferenceArea
                  x1={zoom.dragStart as number}
                  x2={zoom.dragEnd as number}
                  stroke="#f7931a"
                  strokeOpacity={0.4}
                  fill="#f7931a"
                  fillOpacity={0.08}
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
          . {bandsCaption}
          {dcaAmount > 0 ? (
            <>
              The <span className="text-white">white line</span> shows your
              projected stack if you add{" "}
              <span className="text-white">${dcaAmount}/day</span> at the{" "}
              {data.modelLabel.toLowerCase()} model price — buying price and
              portfolio value both follow the base scenario.{" "}
            </>
          ) : null}
          The dashed gray line is your total cost basis of{" "}
          {formatUsd(totalInvested)}; the green dot marks today&apos;s portfolio
          value. Not a prediction.
        </p>
      </Panel>

      <Panel title={`My stack — ${data.modelLabel.toLowerCase()} milestones`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="pb-2 pr-4 font-medium text-muted">Date</th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#ef4444" }}>
                  {bandLabels.bear}
                </th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#f97316" }}>
                  {bandLabels.pessimistic}
                </th>
                <th className="pb-2 pr-4 font-medium text-bitcoin">
                  {bandLabels.median}
                </th>
                <th className="pb-2 pr-4 font-medium" style={{ color: "#22c55e" }}>
                  {bandLabels.optimistic}
                </th>
                <th className="pb-2 font-medium" style={{ color: "#16c784" }}>
                  {bandLabels.bull}
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

const FORECAST_YEARS = 5;
const FORECAST_DAYS = FORECAST_YEARS * 365;

interface ProjectionSectionProps {
  /** Both model results, pre-computed by the parent so toggling is instant. */
  models: Record<ProjectionModelId, BtcProjection>;
  /** Which model to show first — defaults to "powerlaw" for continuity. */
  defaultModel?: ProjectionModelId;
  snapshot?: Snapshot;
}

export function ProjectionSection({
  models,
  defaultModel = "powerlaw",
  snapshot,
}: ProjectionSectionProps) {
  const [activeId, setActiveId] = useState<ProjectionModelId>(defaultModel);
  const data = models[activeId];

  const aboveModel = data.multiplier >= 1;

  // When the user opts in, append model-only points from "today" out to
  // +5Y so the dashed model line projects forward. The actual-price line
  // has no `price` on these points, so it terminates at today automatically.
  const [extendForecast, setExtendForecast] = useState(false);

  const forecastPoints = useMemo<ProjectionPoint[]>(() => {
    if (!extendForecast) return [];
    const pts: ProjectionPoint[] = [];
    // Weekly cadence keeps the projection light without affecting visual
    // smoothness — both models are smooth in log-log space.
    const step = 7;
    const startDay = Math.round(data.nowDays) + step;
    const endDay = Math.round(data.nowDays + FORECAST_DAYS);
    for (let d = startDay; d <= endDay; d += step) {
      pts.push({ days: d, model: data.medianAt(d) });
    }
    return pts;
  }, [extendForecast, data]);

  // Series passed to the chart — historical points unchanged when forecast is
  // off; appended with model-only future points when on.
  const chartPoints = useMemo(
    () => (extendForecast ? [...data.points, ...forecastPoints] : data.points),
    [data.points, forecastPoints, extendForecast],
  );

  // Full historical range in days-since-genesis. The right edge stretches
  // when forecast is enabled so the "All" preset takes you all the way out
  // to the projected horizon.
  const fullRangeDays = useMemo<[number, number]>(() => {
    if (data.points.length === 0) return [1, Math.max(data.nowDays, 2)];
    const minDays = Math.max(1, data.points[0].days);
    const historicalMax = Math.max(
      data.nowDays,
      data.points[data.points.length - 1].days,
    );
    const maxDays = extendForecast
      ? data.nowDays + FORECAST_DAYS
      : historicalMax;
    return [minDays, maxDays];
  }, [data.points, data.nowDays, extendForecast]);

  const zoom = useChartZoom({ fullRange: fullRangeDays });

  const handlePreset = (id: string) => {
    const window = backwardWindowDays(
      id as BackwardPresetId,
      fullRangeDays[1],
      fullRangeDays[0],
    );
    zoom.setDomain(window, id);
  };

  const [xLo, xHi] = zoom.domain ?? fullRangeDays;

  // Filter visible points + derive Y bounds from them. With forecast on, the
  // future model points are included in the visible set when the zoom range
  // overlaps them, so the Y axis auto-expands to fit projected highs.
  const visiblePoints = useMemo(
    () => chartPoints.filter((p) => p.days >= xLo && p.days <= xHi),
    [chartPoints, xLo, xHi],
  );

  const { yLo, yHi, yTicks } = useMemo(() => {
    const vals: number[] = [];
    for (const p of visiblePoints) {
      if (p.price != null && p.price > 0) vals.push(p.price);
      if (p.model > 0) vals.push(p.model);
    }
    if (vals.length === 0) {
      return { yLo: 0.1, yHi: 1_000_000, yTicks: [0.1, 1, 10, 100, 1000, 10000, 100000, 1000000] };
    }
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const lo = Math.pow(10, Math.floor(Math.log10(minV * 0.7)));
    const hi = Math.pow(10, Math.ceil(Math.log10(maxV * 1.3)));
    const ticks: number[] = [];
    for (let e = Math.log10(lo); e <= Math.log10(hi) + 0.001; e++) {
      ticks.push(Math.pow(10, e));
    }
    return { yLo: lo, yHi: hi, yTicks: ticks };
  }, [visiblePoints]);

  const xTicks = useMemo(() => daysToTicks(xLo, xHi), [xLo, xHi]);
  const xFormatter = useMemo(() => daysTickFormatter(xLo, xHi), [xLo, xHi]);

  // Model-aware metric cards. Power Law has β / R² from the regression fit;
  // Quantile Bands doesn't fit anything (coefficients come from the paper),
  // so we show μ and the band span instead.
  const trailingMetrics = useMemo(() => {
    if (data.id === "powerlaw") {
      return [
        { label: "Slope β", value: (data.beta ?? 0).toFixed(3) },
        { label: "Fit R²", value: ((data.r2 ?? 0) * 100).toFixed(1) + "%" },
      ];
    }
    return [
      { label: "Centering μ", value: (data.centeringMu ?? 0).toFixed(4) },
      { label: "Bands shown", value: "Q10 – Q95" },
    ];
  }, [data]);

  const headlineModelLabel = data.modelLabel;

  return (
    <div className="space-y-3">
      {/* ── Model picker ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-faint">
          Model
        </span>
        {(Object.keys(models) as ProjectionModelId[]).map((id) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveId(id)}
              aria-pressed={isActive}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-bitcoin text-night"
                  : "bg-night text-muted hover:text-ink"
              }`}
            >
              {models[id].modelLabel}
            </button>
          );
        })}
        <span className="ml-1 text-[11px] text-faint">
          {data.id === "powerlaw" ? (
            <>Least-squares fit of log₁₀(price) vs log₁₀(time)</>
          ) : (
            <>Cowen (2026) asymmetric quadratic quantile regression</>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Current price" value={formatUsd(data.currentPrice)} />
        <MetricCard
          label={`${headlineModelLabel} model`}
          value={formatUsd(data.modelPriceNow)}
        />
        <MetricCard
          label="Market / model"
          value={data.multiplier.toFixed(2) + "×"}
          accent={aboveModel ? "up" : "down"}
        />
        {trailingMetrics.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      <Panel
        title={`Bitcoin ${headlineModelLabel.toLowerCase()} — price vs. time (log-log)`}
        legend={
          <>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-[3px] w-3.5 bg-bitcoin" />
              actual price
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-muted" />
              {headlineModelLabel.toLowerCase()} model
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-up" />
              today
            </span>
          </>
        }
      >
        <DateRangeControls
          presets={BACKWARD_PRESETS}
          activePreset={zoom.activePreset}
          onPreset={handlePreset}
          onReset={zoom.reset}
          extras={
            <button
              type="button"
              onClick={() => setExtendForecast((v) => !v)}
              aria-pressed={extendForecast}
              title="Extend the model line 5 years into the future"
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                extendForecast
                  ? "bg-bitcoin text-night"
                  : "bg-night text-muted hover:text-ink"
              }`}
            >
              +5Y forecast
            </button>
          }
        />
        <div className="h-[320px] w-full select-none" onDoubleClick={zoom.reset}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartPoints}
              margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
              onMouseDown={zoom.onMouseDown}
              onMouseMove={zoom.onMouseMove}
              onMouseUp={zoom.onMouseUp}
              onMouseLeave={zoom.onMouseLeave}
            >
              <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
              <XAxis
                dataKey="days"
                type="number"
                scale="log"
                domain={[xLo, xHi]}
                ticks={xTicks}
                tickFormatter={xFormatter}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                allowDataOverflow
              />
              <YAxis
                type="number"
                scale="log"
                domain={[yLo, yHi]}
                ticks={yTicks}
                tickFormatter={priceTick}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                width={54}
                allowDataOverflow
              />
              <Tooltip content={<ModelLineTooltip />} />
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
              {data.nowDays >= xLo && data.nowDays <= xHi && (
                <ReferenceDot
                  x={data.nowDays}
                  y={data.currentPrice}
                  r={4}
                  fill="#16c784"
                  stroke="#0d0f12"
                  strokeWidth={1.5}
                  isFront
                />
              )}
              {zoom.dragStart != null && zoom.dragEnd != null && (
                <ReferenceArea
                  x1={zoom.dragStart as number}
                  x2={zoom.dragEnd as number}
                  stroke="#f7931a"
                  strokeOpacity={0.4}
                  fill="#f7931a"
                  fillOpacity={0.08}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {data.id === "powerlaw" ? (
            <>
              Bitcoin&apos;s price has historically tracked a power law of
              time since the 2009 genesis block — close to a straight line on
              these log-log axes. The dashed line is a least-squares fit of
              the price history; the green dot marks today. A market / model
              ratio above 1.0 means price sits above the long-run trend.
            </>
          ) : (
            <>
              The dashed line is the Q50 (median) of Cowen (2026)&apos;s
              asymmetric quadratic quantile regression, evaluated at each
              date and rearranged for monotonicity. Unlike the linear power
              law, this model bends slightly downward in log-log space — the
              upper-tail quantiles curve harder than the lower-tail ones,
              encoding a compressing ceiling. The green dot marks today.
            </>
          )}{" "}
          Shown for educational purposes — not a prediction.
        </p>
      </Panel>

      <Panel title={`${headlineModelLabel} — forward fair value`}>
        <div className="grid grid-cols-3 gap-2">
          {data.projections.map((p) => (
            <div key={p.label} className="rounded-lg bg-night px-4 py-3">
              <div className="mb-1 text-xs text-muted">{p.label}</div>
              <div className="font-mono text-lg font-medium text-ink">
                {priceTick(p.model)}
              </div>
              <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
                <span style={{ color: "#16c784" }}>
                  {data.bandLabels.bull}: {priceTick(p.bull)}
                </span>
                <span style={{ color: "#ef4444" }}>
                  {data.bandLabels.bear}: {priceTick(p.bear)}
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

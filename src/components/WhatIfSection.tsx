"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint, Transaction } from "@/lib/types";
import {
  simulateAllStrategies,
  STRATEGIES,
  type StrategyId,
  type StrategyResult,
} from "@/lib/whatif";
import { formatUsd, formatUsdShort, formatPct, formatDate } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";
import { DateRangeControls } from "./charts/DateRangeControls";
import { useChartZoom } from "./charts/useChartZoom";
import {
  BACKWARD_PRESETS,
  backwardWindowMs,
  type BackwardPresetId,
} from "./charts/dateRangePresets";

const DAY_MS = 86400000;

function dateStrToMs(s: string): number {
  return new Date(s.slice(0, 10) + "T00:00:00Z").getTime();
}

/** X-axis label formatter that adapts to the visible range, same ladder as
 *  HoldingsChart so the charts feel consistent. */
function buildDateStrFormatter(rangeMs: number): (d: string) => string {
  if (rangeMs > 730 * DAY_MS) return (d) => d.slice(0, 4);
  if (rangeMs > 90 * DAY_MS) {
    return (d) => {
      const dt = new Date(d.slice(0, 10) + "T00:00:00Z");
      return dt.toLocaleString("default", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    };
  }
  return (d) => {
    const dt = new Date(d.slice(0, 10) + "T00:00:00Z");
    return dt.toLocaleString("default", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
}

function WhatIfTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  // Sort the strategies by value desc so the leader is at the top.
  const sorted = [...payload]
    .filter((p: any) => p.value != null)
    .sort((a: any, b: any) => b.value - a.value);
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="mb-1 text-faint">{formatDate(label)}</div>
      {sorted.map((entry: any) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-3"
          style={{ color: entry.color }}
        >
          <span>{entry.name}</span>
          <span className="font-mono tabular-nums">
            {formatUsd(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WhatIfSection({
  txns,
  prices,
  currentPrice,
  asOf,
}: {
  txns: Transaction[];
  prices: PricePoint[];
  currentPrice: number;
  asOf: string;
}) {
  // Run every strategy once per (ledger, prices, price) change. Each strategy
  // returns its own daily series; we'll merge them by date below for the chart.
  const results = useMemo(
    () => simulateAllStrategies({ txns, prices, currentPrice, asOf }),
    [txns, prices, currentPrice, asOf],
  );

  const actual = results.find((r) => r.strategyId === "actual");
  const totalInvested = actual?.totalInvested ?? 0;
  const firstDate = actual?.buys[0]?.date ?? "";
  const lastDate = actual?.buys[actual.buys.length - 1]?.date ?? "";
  const spanDays =
    firstDate && lastDate
      ? Math.round((dateStrToMs(lastDate) - dateStrToMs(firstDate)) / DAY_MS)
      : 0;

  // ── Merge each strategy's daily series into one chart-data array keyed by date.
  // Recharts wants rows like { date, actual: <value>, lumpSum: <value>, … }.
  const merged = useMemo(() => {
    if (results.length === 0) return [] as Array<Record<string, number | string>>;
    const allDates = new Set<string>();
    for (const r of results) for (const p of r.series) allDates.add(p.date);
    const sorted = [...allDates].sort();
    const indexByStrategy: Record<string, Map<string, number>> = {};
    for (const r of results) {
      const m = new Map<string, number>();
      for (const p of r.series) m.set(p.date, p.value);
      indexByStrategy[r.strategyId] = m;
    }
    return sorted.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const r of results) {
        const v = indexByStrategy[r.strategyId].get(date);
        if (v !== undefined) row[r.strategyId] = v;
      }
      return row;
    });
  }, [results]);

  // ── Date-range zoom (reuses shared infra). Operates on ms.
  const fullRangeMs = useMemo<[number, number]>(() => {
    if (merged.length === 0) return [0, 1];
    const first = dateStrToMs(merged[0].date as string);
    const last = dateStrToMs(merged[merged.length - 1].date as string);
    return [first, last];
  }, [merged]);

  const zoom = useChartZoom({ fullRange: fullRangeMs });

  const handlePreset = (id: string) => {
    const w = backwardWindowMs(
      id as BackwardPresetId,
      fullRangeMs[1],
      fullRangeMs[0],
    );
    zoom.setDomain(w, id);
  };

  const filtered = useMemo(() => {
    if (!zoom.domain) return merged;
    const [lo, hi] = zoom.domain;
    return merged.filter((row) => {
      const t = dateStrToMs(row.date as string);
      return t >= lo && t <= hi;
    });
  }, [merged, zoom.domain]);

  const visibleRangeMs = useMemo(() => {
    if (zoom.domain) return zoom.domain[1] - zoom.domain[0];
    return fullRangeMs[1] - fullRangeMs[0];
  }, [zoom.domain, fullRangeMs]);

  const xFormatter = useMemo(
    () => buildDateStrFormatter(visibleRangeMs),
    [visibleRangeMs],
  );

  // ── Per-strategy visibility — clickable legend, same pattern as HoldingsChart.
  const [hidden, setHidden] = useState<Set<StrategyId>>(new Set());
  const toggle = (id: StrategyId) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!actual || merged.length === 0) {
    return (
      <Panel title="What if?">
        <p className="text-[12px] text-muted">
          Load a ledger with at least one buy to compare strategies.
        </p>
      </Panel>
    );
  }

  // ── Scoreboard: order by final value desc so the winner sits on top.
  const scoreboard = useMemo(() => {
    return [...results].sort((a, b) => b.finalValue - a.finalValue);
  }, [results]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-faint">
        Same {formatUsd(totalInvested)} deployed differently. Each strategy
        spends your real total across the same {spanDays.toLocaleString()}-day
        window — only the timing rule changes. The hindsight oracle is the
        ceiling no realistic strategy can beat.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard label="Total invested" value={formatUsd(totalInvested)} />
        <MetricCard label="First buy" value={firstDate || "—"} />
        <MetricCard label="Window" value={`${spanDays.toLocaleString()} days`} />
        <MetricCard
          label="Live BTC price"
          value={formatUsd(currentPrice)}
        />
      </div>

      <Panel title="Portfolio value over time — by strategy">
        <DateRangeControls
          presets={BACKWARD_PRESETS}
          activePreset={zoom.activePreset}
          onPreset={handlePreset}
          onReset={zoom.reset}
        />

        {/* Clickable legend — toggles a strategy's line + axis tracking */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {STRATEGIES.map((s) => {
            const isHidden = hidden.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={!isHidden}
                title={s.description}
                className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
                  isHidden
                    ? "text-faint opacity-60 hover:opacity-100"
                    : "text-muted hover:text-ink"
                }`}
              >
                <span
                  className="inline-block h-[3px] w-3.5"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        <div
          className="h-[360px] w-full select-none"
          onDoubleClick={zoom.reset}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={filtered}
              margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
              onMouseDown={zoom.onMouseDown}
              onMouseMove={zoom.onMouseMove}
              onMouseUp={zoom.onMouseUp}
              onMouseLeave={zoom.onMouseLeave}
            >
              <CartesianGrid stroke="#232830" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={xFormatter}
                minTickGap={visibleRangeMs > 730 * DAY_MS ? 44 : 28}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
              />
              <YAxis
                tickFormatter={formatUsdShort}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                width={62}
              />
              <Tooltip content={<WhatIfTooltip />} />
              {STRATEGIES.map((s) => {
                if (hidden.has(s.id)) return null;
                return (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.id === "actual" ? 2.2 : 1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                );
              })}
              {zoom.dragStart != null && zoom.dragEnd != null && (
                <ReferenceArea
                  x1={zoom.dragStart as string}
                  x2={zoom.dragEnd as string}
                  stroke="#f7931a"
                  strokeOpacity={0.4}
                  fill="#f7931a"
                  fillOpacity={0.08}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Scoreboard — ranked by final portfolio value">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-muted">
                <th className="py-1.5 text-left font-normal">#</th>
                <th className="py-1.5 text-left font-normal">Strategy</th>
                <th className="py-1.5 text-right font-normal">Final value</th>
                <th className="py-1.5 text-right font-normal">BTC</th>
                <th className="py-1.5 text-right font-normal">Avg buy</th>
                <th className="py-1.5 text-right font-normal">CAGR</th>
                <th className="py-1.5 text-right font-normal">vs. you</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.map((r, idx) => {
                const meta = STRATEGIES.find((s) => s.id === r.strategyId)!;
                const isYou = r.strategyId === "actual";
                const delta = r.finalValue - (actual?.finalValue ?? 0);
                return (
                  <tr
                    key={r.strategyId}
                    className={`border-t border-edge ${isYou ? "font-medium text-ink" : "text-ink"}`}
                  >
                    <td className="py-1.5 text-left font-mono text-faint">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 text-left">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-[3px] w-3.5"
                          style={{ backgroundColor: meta.color }}
                        />
                        {meta.label}
                        {isYou && (
                          <span className="rounded bg-bitcoin/20 px-1.5 py-0.5 text-[10px] text-bitcoin">
                            you
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatUsd(r.finalValue)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {r.totalBtc.toFixed(4)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatUsd(r.avgBuyPrice)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono tabular-nums ${
                        r.cagr == null
                          ? "text-faint"
                          : r.cagr >= 0
                            ? "text-up"
                            : "text-down"
                      }`}
                    >
                      {r.cagr == null ? "—" : formatPct(r.cagr)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono tabular-nums ${
                        isYou
                          ? "text-faint"
                          : delta >= 0
                            ? "text-up"
                            : "text-down"
                      }`}
                    >
                      {isYou ? "—" : (delta >= 0 ? "+" : "") + formatUsd(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          All strategies deploy the same {formatUsd(totalInvested)} across the
          same window. <span className="text-ink">CAGR</span> is annualized
          over your first-buy → today span. The{" "}
          <span className="text-ink">vs. you</span> column shows the dollar
          delta against your actual strategy. The{" "}
          <span style={{ color: "#facc15" }}>hindsight oracle</span> lump-sums
          on the single lowest-price day in your window — no realistic
          strategy can beat it; it just shows you how much you left on the
          table by not being clairvoyant.
        </p>
      </Panel>
    </div>
  );
}

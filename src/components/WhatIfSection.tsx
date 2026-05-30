"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  CUSTOM_STRATEGY_COLOR,
  DEFAULT_CUSTOM_PARAMS,
  describeCustomStrategy,
  type StrategyId,
  type StrategyResult,
  type StrategyMeta,
  type CustomStrategyParams,
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

/**
 * Generate an explicit array of X-axis tick positions (date strings) snapped
 * to round calendar boundaries — Jan 1 of each year, first of each month, or
 * 7-day grid — so labels never duplicate. Without explicit ticks, recharts
 * auto-picks evenly-spaced data points; with year-only labels and ~3,000
 * daily points that produces multiple "2018" labels per year because the
 * picks don't align to calendar boundaries.
 */
function buildDateStrTicks(
  firstDate: string,
  lastDate: string,
  rangeMs: number,
): string[] {
  const ticks: string[] = [];
  const firstMs = dateStrToMs(firstDate);
  const lastMs = dateStrToMs(lastDate);
  if (firstMs > lastMs) return ticks;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (rangeMs > 730 * DAY_MS) {
    // Year boundaries — stride 2 once we have more than 12 years to display.
    const startYear = new Date(firstMs).getUTCFullYear();
    const endYear = new Date(lastMs).getUTCFullYear();
    const span = endYear - startYear + 1;
    const step = span > 12 ? 2 : 1;
    for (let y = startYear; y <= endYear; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t >= firstMs && t <= lastMs) ticks.push(`${y}-01-01`);
    }
    return ticks;
  }

  if (rangeMs > 90 * DAY_MS) {
    // Month boundaries — stride 2 between 1y and 2y of range so we don't
    // crowd a horizontally narrow chart.
    const start = new Date(firstMs);
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    // Walk forward to the next month start so we don't double-tick the
    // first partial month.
    if (start.getUTCDate() > 1) {
      m += 1;
      while (m > 11) {
        m -= 12;
        y += 1;
      }
    }
    const step = rangeMs > 365 * DAY_MS ? 2 : 1;
    while (true) {
      const t = Date.UTC(y, m, 1);
      if (t > lastMs) break;
      if (t >= firstMs) ticks.push(`${y}-${pad(m + 1)}-01`);
      m += step;
      while (m > 11) {
        m -= 12;
        y += 1;
      }
    }
    return ticks;
  }

  // Weekly ticks for short ranges.
  let cursor = firstMs;
  while (cursor <= lastMs) {
    ticks.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 7 * DAY_MS;
  }
  return ticks;
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
  // ── Custom strategy state. Gated behind a disclosure so the section opens
  //    to the same height it always has; recruiters see the rule builder only
  //    if they choose to expand it.
  const [customOpen, setCustomOpen] = useState(false);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [customParams, setCustomParams] = useState<CustomStrategyParams>(
    DEFAULT_CUSTOM_PARAMS,
  );
  const activeCustom = customEnabled ? customParams : null;
  const customMeta: StrategyMeta = useMemo(() => {
    const { label, description } = describeCustomStrategy(customParams);
    return {
      id: "custom",
      label,
      description,
      color: CUSTOM_STRATEGY_COLOR,
    };
  }, [customParams]);

  // Run every strategy once per (ledger, prices, price, custom) change. Each
  // strategy returns its own daily series; we'll merge them by date below
  // for the chart.
  const results = useMemo(
    () =>
      simulateAllStrategies({
        txns,
        prices,
        currentPrice,
        asOf,
        custom: activeCustom,
      }),
    [txns, prices, currentPrice, asOf, activeCustom],
  );

  // The set of strategies to render (chart legend + scoreboard). The custom
  // strategy joins only when the user has enabled it. Putting it at the end
  // keeps the built-in order stable.
  const visibleStrategies: ReadonlyArray<StrategyMeta> = useMemo(() => {
    return customEnabled ? [...STRATEGIES, customMeta] : STRATEGIES;
  }, [customEnabled, customMeta]);

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

  // Compute explicit X-axis tick positions snapped to calendar boundaries so
  // no two ticks ever resolve to the same year/month label.
  const xTicks = useMemo(() => {
    if (filtered.length === 0) return [];
    return buildDateStrTicks(
      filtered[0].date as string,
      filtered[filtered.length - 1].date as string,
      visibleRangeMs,
    );
  }, [filtered, visibleRangeMs]);

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

  // ── Per-strategy info popover. Click the (i) icon to open; click outside
  //    or press Escape to close. Single-open at a time keeps the table calm.
  const [openInfo, setOpenInfo] = useState<StrategyId | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (openInfo === null) return;
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popoverRef.current && target && popoverRef.current.contains(target)) {
        return; // click inside the popover — keep it open
      }
      // Clicks on the toggle button itself are handled by the button's onClick
      // (which closes if it's the same id), so a global pointer-outside is
      // enough for everything else.
      const btn = (e.target as HTMLElement | null)?.closest?.(
        "[data-strategy-info-toggle]",
      );
      if (btn) return;
      setOpenInfo(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenInfo(null);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openInfo]);

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
          {visibleStrategies.map((s) => {
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
                ticks={xTicks.length > 0 ? xTicks : undefined}
                tickFormatter={xFormatter}
                interval={0}
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
              {visibleStrategies.map((s) => {
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
                <th className="py-1.5 text-left font-normal">
                  Strategy{" "}
                  <span className="text-faint">
                    (for a {formatUsd(totalInvested)} investment)
                  </span>
                </th>
                <th className="py-1.5 text-right font-normal">Final value</th>
                <th className="py-1.5 text-right font-normal">BTC</th>
                <th className="py-1.5 text-right font-normal">Avg buy</th>
                <th className="py-1.5 text-right font-normal">CAGR</th>
                <th className="py-1.5 text-right font-normal">vs. you</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.map((r, idx) => {
                const meta =
                  visibleStrategies.find((s) => s.id === r.strategyId) ??
                  STRATEGIES[0];
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
                      <span className="relative flex items-center gap-1.5">
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
                        <button
                          type="button"
                          data-strategy-info-toggle
                          onClick={() =>
                            setOpenInfo((cur) =>
                              cur === r.strategyId ? null : r.strategyId,
                            )
                          }
                          aria-expanded={openInfo === r.strategyId}
                          aria-label={`About ${meta.label}`}
                          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-faint hover:text-bitcoin focus:text-bitcoin focus:outline-none"
                        >
                          {/* Info icon — kept inline so we don't pull in a
                              dependency just for one glyph */}
                          <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.5a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm0 2.25a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9ZM7.25 7.5h1.5a.5.5 0 0 1 .5.5v3.5a.5.5 0 0 1-1 0V8.5h-.5a.5.5 0 0 1 0-1Z" />
                          </svg>
                        </button>
                        {openInfo === r.strategyId &&
                          (() => {
                            // Flip the popover to open ABOVE the row whenever
                            // the row sits in the bottom half of the table.
                            // The popover is ~110px tall + 24px offset; rows
                            // are ~32px. Below-mode needs ≥4 rows of space
                            // below, so above-mode is the right choice for
                            // the second half of the table. No overflow,
                            // no padding hack, works for any table length.
                            const openAbove =
                              idx >= Math.ceil(scoreboard.length / 2);
                            return (
                              <div
                                ref={popoverRef}
                                role="dialog"
                                aria-label={`${meta.label} explanation`}
                                className={`absolute left-0 z-20 w-72 rounded-md border border-edge bg-night px-3 py-2 text-[11px] leading-relaxed text-ink shadow-lg ${
                                  openAbove ? "bottom-6" : "top-6"
                                }`}
                              >
                                <div
                                  className="mb-1 flex items-center gap-1.5 font-medium"
                                  style={{ color: meta.color }}
                                >
                                  <span
                                    className="inline-block h-[3px] w-3.5"
                                    style={{ backgroundColor: meta.color }}
                                  />
                                  {meta.label}
                                </div>
                                <p className="text-muted">
                                  {meta.description}
                                </p>
                              </div>
                            );
                          })()}
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

      <CustomStrategyBuilder
        open={customOpen}
        onOpenChange={setCustomOpen}
        enabled={customEnabled}
        onEnabledChange={setCustomEnabled}
        params={customParams}
        onParamsChange={setCustomParams}
      />
    </div>
  );
}

// ─── Custom strategy disclosure ───────────────────────────────────────────────

/**
 * Compact rule builder. Closed by default so the section's resting height is
 * unchanged. When expanded it shows two legs (cadence + dip), each with a
 * tiny inline form. Toggling "Add to comparison" pipes the params into the
 * simulator; the resulting line shares the chart, scoreboard, and capital
 * constraint with every built-in strategy.
 */
function CustomStrategyBuilder({
  open,
  onOpenChange,
  enabled,
  onEnabledChange,
  params,
  onParamsChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  params: CustomStrategyParams;
  onParamsChange: (next: CustomStrategyParams) => void;
}) {
  const set = <K extends keyof CustomStrategyParams>(
    key: K,
    value: CustomStrategyParams[K],
  ) => onParamsChange({ ...params, [key]: value });
  const { label } = describeCustomStrategy(params);

  return (
    <Panel title="Build your own strategy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex items-center gap-2 text-[12px] text-muted hover:text-ink"
        >
          <span
            className="inline-block h-[3px] w-3.5"
            style={{ backgroundColor: CUSTOM_STRATEGY_COLOR }}
          />
          <span className="text-ink">{enabled ? label : "Custom strategy"}</span>
          <span aria-hidden="true" className="text-faint">
            {open ? "▾" : "▸"}
          </span>
          <span className="text-faint">
            {open
              ? "(hide)"
              : enabled
                ? "(active — click to edit)"
                : "(click to configure)"}
          </span>
        </button>
        <label className="flex items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-3 w-3 accent-bitcoin"
          />
          Add to comparison
        </label>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* ── Cadence leg ───────────────────────────────────────────────── */}
          <div className="rounded border border-edge bg-night/40 p-2.5">
            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={params.cadenceEnabled}
                onChange={(e) => set("cadenceEnabled", e.target.checked)}
                className="h-3 w-3 accent-bitcoin"
              />
              Base cadence
            </label>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <span>Buy every</span>
              <input
                type="number"
                min={1}
                max={365}
                value={params.cadenceDays}
                onChange={(e) =>
                  set(
                    "cadenceDays",
                    Math.max(1, Math.floor(Number(e.target.value) || 0)),
                  )
                }
                disabled={!params.cadenceEnabled}
                className="w-14 rounded border border-edge bg-night px-1.5 py-0.5 text-right font-mono text-ink disabled:opacity-50"
              />
              <span>days</span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              7 = weekly · 30 = monthly · 1 = daily. Cadence buys share the
              window's total budget by relative weight.
            </p>
          </div>

          {/* ── Dip leg ────────────────────────────────────────────────────── */}
          <div className="rounded border border-edge bg-night/40 p-2.5">
            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={params.dipEnabled}
                onChange={(e) => set("dipEnabled", e.target.checked)}
                className="h-3 w-3 accent-bitcoin"
              />
              Bonus on drawdowns
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span>Trigger at</span>
              <input
                type="number"
                min={1}
                max={99}
                value={Math.round(params.dipPctThreshold * 100)}
                onChange={(e) =>
                  set(
                    "dipPctThreshold",
                    Math.min(
                      0.99,
                      Math.max(0.01, (Number(e.target.value) || 0) / 100),
                    ),
                  )
                }
                disabled={!params.dipEnabled}
                className="w-12 rounded border border-edge bg-night px-1.5 py-0.5 text-right font-mono text-ink disabled:opacity-50"
              />
              <span>% drawdown · weight ×</span>
              <input
                type="number"
                min={1}
                max={20}
                step={0.5}
                value={params.dipWeight}
                onChange={(e) =>
                  set("dipWeight", Math.max(0.1, Number(e.target.value) || 0))
                }
                disabled={!params.dipEnabled}
                className="w-14 rounded border border-edge bg-night px-1.5 py-0.5 text-right font-mono text-ink disabled:opacity-50"
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Fires when price ≤ (1 − threshold) × trailing{" "}
              {params.dipLookbackDays}-day high. {params.dipCooldownDays}-day
              cooldown between triggers. Weight scales how much more capital
              a dip-day gets than a cadence-day.
            </p>
          </div>
        </div>
      )}

      {open && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Weights are relative — the simulator scales every buy so total
          spend matches your actual total, the same constraint every other
          strategy follows. Toggle <span className="text-ink">Add to
          comparison</span> to drop your strategy into the chart and
          scoreboard above.
        </p>
      )}
    </Panel>
  );
}

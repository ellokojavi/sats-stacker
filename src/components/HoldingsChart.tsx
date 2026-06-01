"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HoldingsPoint } from "@/lib/types";
import { formatUsd, formatUsdShort, formatDate, formatBtc } from "@/lib/format";
import { DateRangeControls } from "./charts/DateRangeControls";
import { useChartZoom } from "./charts/useChartZoom";
import {
  BACKWARD_PRESETS,
  backwardWindowMs,
  type BackwardPresetId,
} from "./charts/dateRangePresets";

/**
 * HODLings-chart-specific preset row: the shared backward presets plus a
 * "Stack" slice that bounds the visible range explicitly to the user's
 * stacking era — from the first transaction date to today. Today this
 * window coincides with "All" (the holdings series already starts at the
 * first buy), but the button is named so the user has a one-click way to
 * say "show me my stacking era" regardless of what other context the
 * series may grow to include later.
 */
const STACK_PRESET_ID = "STACK";
const HOLDINGS_PRESETS = [
  ...BACKWARD_PRESETS,
  { id: STACK_PRESET_ID, label: "Stack" },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-edge bg-night px-3 py-2 text-[11px]">
      <div className="mb-1 text-faint">{formatDate(label)}</div>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ color: entry.color }}>
          {entry.name}:{" "}
          {entry.dataKey === "btcStack"
            ? formatBtc(entry.value)
            : formatUsd(entry.value)}
        </div>
      ))}
    </div>
  );
}

/** Compact BTC formatter for axis ticks — keeps the right axis narrow. */
function formatBtcShort(n: number): string {
  return n.toFixed(n >= 10 ? 1 : n >= 1 ? 2 : 3) + " ₿";
}

const DAY_MS = 86400000;

/** Parse YYYY-MM-DD or ISO-with-time to a UTC ms timestamp. */
function dateStrToMs(s: string): number {
  return new Date(s.slice(0, 10) + "T00:00:00Z").getTime();
}

/**
 * Build an X-axis tick formatter that adapts to the visible range so zooming
 * into a year doesn't render as "2026, 2026, 2026…". Granularity ladder:
 *   • > 2 years  → year only ("2024")
 *   • > 3 months → month + 2-digit year ("May '26")
 *   • else       → month + day ("May 26")
 */
function buildDateStrFormatter(rangeMs: number): (d: string) => string {
  if (rangeMs > 730 * DAY_MS) {
    return (d) => d.slice(0, 4);
  }
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

export function HoldingsChart({ data }: { data: HoldingsPoint[] }) {
  // Full data range in ms — needed by the zoom hook to size the drag-threshold
  // and by the preset windows that count back from the latest date.
  const fullRangeMs = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    const first = dateStrToMs(data[0].date);
    const last = dateStrToMs(data[data.length - 1].date);
    return [first, last];
  }, [data]);

  // The series now spans the full BTC price history (with portfolio = 0
  // before the first buy), so "All" covers the entire Bitcoin era. The
  // "Stack" preset zooms to just the user's stacking era — first point
  // where the cumulative stack went above zero, through the latest data
  // point. If the user has no buys at all, fall back to the full range so
  // the preset still does something sensible.
  const stackRangeMs = useMemo<[number, number] | null>(() => {
    if (data.length === 0) return null;
    const firstStackIdx = data.findIndex((p) => p.btcStack > 0);
    if (firstStackIdx === -1) return null;
    return [dateStrToMs(data[firstStackIdx].date), fullRangeMs[1]];
  }, [data, fullRangeMs]);

  const zoom = useChartZoom({ fullRange: fullRangeMs });

  // Default the chart to the stacking-era window on first render. "All"
  // now spans the full BTC price history (~2011 → today), which is the
  // right thing to *offer* but a poor default — the portfolio line is
  // flat at zero for ~a decade before the user's first buy. Opening to
  // "Stack" preserves the prior default UX while making "All" a deliberate
  // expand action. We use a ref to guard against re-running this on
  // subsequent data changes (the user may have clicked into "All" by
  // then — we shouldn't snap them back).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (stackRangeMs) {
      zoom.setDomain(stackRangeMs, STACK_PRESET_ID);
      initializedRef.current = true;
    }
  }, [stackRangeMs, zoom]);

  // Translate a backward preset into a [lo, hi] ms window and hand it to the hook.
  const handlePreset = (id: string) => {
    if (id === STACK_PRESET_ID) {
      // Zoom to the user's stacking era: first buy → latest data point.
      // Falls back to the full range when there are no buys yet.
      zoom.setDomain(stackRangeMs ?? null, id);
      return;
    }
    if (id === "ALL") {
      // "All" extends back to the start of the bundled BTC history. The
      // portfolio + BTC-stack series are both zero before the user's first
      // buy, so without the BTC-price line the chart looks empty for the
      // pre-stack era. Auto-flip the right-axis series to BTC price (the
      // only one with full coverage) so "All" always renders something
      // across the whole range. The user can still toggle back manually.
      if (!showBtcPrice) {
        setShowBtcPrice(true);
        setShowBtcStack(false);
      }
      zoom.setDomain(null, id);
      return;
    }
    const window = backwardWindowMs(
      id as BackwardPresetId,
      fullRangeMs[1],
      fullRangeMs[0],
    );
    zoom.setDomain(window, id);
  };

  // Filter the data array to points inside the active domain. Recharts uses
  // `dataKey="date"` (string) so we can't simply pass a numeric domain — we
  // have to slice the input array instead.
  const filtered = useMemo(() => {
    if (!zoom.domain) return data;
    const [lo, hi] = zoom.domain;
    return data.filter((p) => {
      const t = dateStrToMs(p.date);
      return t >= lo && t <= hi;
    });
  }, [data, zoom.domain]);

  // Visible range in ms drives the tick formatter granularity. When no zoom
  // is applied, use the full data range.
  const visibleRangeMs = useMemo(() => {
    if (zoom.domain) return zoom.domain[1] - zoom.domain[0];
    return fullRangeMs[1] - fullRangeMs[0];
  }, [zoom.domain, fullRangeMs]);

  const xFormatter = useMemo(
    () => buildDateStrFormatter(visibleRangeMs),
    [visibleRangeMs],
  );

  // Recharts auto-picks ticks from the categorical X data, and with weekly
  // points multiple ticks can fall in the same year — so when the formatter
  // strips down to year-only ("2022"), the same label renders twice. Fix by
  // computing explicit per-bucket ticks (one per year on long ranges, one
  // per month on mid ranges) and handing them to <XAxis ticks=…>.
  // Sub-quarter ranges stay on auto: month+day labels rarely collide.
  const xTicks = useMemo<string[] | undefined>(() => {
    if (filtered.length === 0) return undefined;
    if (visibleRangeMs > 730 * DAY_MS) {
      const seen = new Set<string>();
      const ticks: string[] = [];
      for (const p of filtered) {
        const y = p.date.slice(0, 4);
        if (!seen.has(y)) {
          seen.add(y);
          ticks.push(p.date);
        }
      }
      return ticks;
    }
    if (visibleRangeMs > 90 * DAY_MS) {
      const seen = new Set<string>();
      const ticks: string[] = [];
      for (const p of filtered) {
        const ym = p.date.slice(0, 7);
        if (!seen.has(ym)) {
          seen.add(ym);
          ticks.push(p.date);
        }
      }
      return ticks;
    }
    return undefined;
  }, [filtered, visibleRangeMs]);

  // Clickable legend state — each curve and its corresponding Y axis can be
  // toggled. The axes only mount when their series is visible, so an empty
  // chart genuinely empties out instead of leaving orphan ticks behind.
  //
  // BTC price (USD) and BTC stack (BTC units) both want the right axis but
  // disagree on units, so they're mutually exclusive: turning one on turns
  // the other off. Portfolio value owns the left axis and is independent.
  const [showPortfolio, setShowPortfolio] = useState(true);
  // BTC stack is the headline "what did I actually accumulate" curve, so
  // it owns the right axis by default. BTC price is available as a swap.
  const [showBtcStack, setShowBtcStack] = useState(true);
  const [showBtcPrice, setShowBtcPrice] = useState(false);

  const toggleBtcPrice = () => {
    setShowBtcPrice((v) => {
      const next = !v;
      if (next) setShowBtcStack(false);
      return next;
    });
  };
  const toggleBtcStack = () => {
    setShowBtcStack((v) => {
      const next = !v;
      if (next) setShowBtcPrice(false);
      return next;
    });
  };

  const rightAxisOn = showBtcPrice || showBtcStack;

  // Y-axis scale toggle. Log mode is meaningful here because BTC price
  // spans ~5 orders of magnitude across the bundled history; the portfolio
  // value can span 3–4 once a stacker is a few cycles in.
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const isLog = scale === "log";

  // Compute tight log-scale domains from the visible (filtered) data so
  // short windows don't collapse into a flat line at the top of a 6-decade
  // axis. A fixed [1, "auto"] floor (which we used to use) made the curves
  // invisible whenever the data sat in a single decade. Pad ~15% above and
  // below the visible range so the curves have room to breathe; positive
  // values only — pre-stack zeros are excluded so they don't pin the floor.
  const LOG_PAD = 1.15;
  const yLeftDomain = useMemo<[number | string, number | string]>(() => {
    if (!isLog || !showPortfolio) return ["auto", "auto"];
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of filtered) {
      if (p.portfolioValue > 0) {
        if (p.portfolioValue < minV) minV = p.portfolioValue;
        if (p.portfolioValue > maxV) maxV = p.portfolioValue;
      }
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return [1, "auto"];
    return [minV / LOG_PAD, maxV * LOG_PAD];
  }, [filtered, isLog, showPortfolio]);

  const yRightDomain = useMemo<[number | string, number | string]>(() => {
    if (!isLog || !rightAxisOn) return ["auto", "auto"];
    let minV = Infinity;
    let maxV = -Infinity;
    if (showBtcStack) {
      for (const p of filtered) {
        if (p.btcStack > 0) {
          if (p.btcStack < minV) minV = p.btcStack;
          if (p.btcStack > maxV) maxV = p.btcStack;
        }
      }
      if (!Number.isFinite(minV) || !Number.isFinite(maxV))
        return [0.0001, "auto"];
      return [minV / LOG_PAD, maxV * LOG_PAD];
    }
    for (const p of filtered) {
      if (p.btcPrice > 0) {
        if (p.btcPrice < minV) minV = p.btcPrice;
        if (p.btcPrice > maxV) maxV = p.btcPrice;
      }
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return [1, "auto"];
    return [minV / LOG_PAD, maxV * LOG_PAD];
  }, [filtered, isLog, rightAxisOn, showBtcStack]);

  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[13px] font-medium text-ink">
          HODLings value over time
        </span>
        <button
          type="button"
          onClick={() => setShowPortfolio((v) => !v)}
          aria-pressed={showPortfolio}
          title={showPortfolio ? "Hide portfolio value" : "Show portfolio value"}
          className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
            showPortfolio ? "text-muted hover:text-ink" : "text-faint opacity-60 hover:opacity-100"
          }`}
        >
          <span className="inline-block h-[3px] w-3.5 bg-up" />
          portfolio value
        </button>
        <button
          type="button"
          onClick={toggleBtcStack}
          aria-pressed={showBtcStack}
          title={
            showBtcStack
              ? "Hide BTC stack"
              : showBtcPrice
                ? "Show BTC stack (hides BTC price)"
                : "Show BTC stack"
          }
          className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
            showBtcStack ? "text-muted hover:text-ink" : "text-faint opacity-60 hover:opacity-100"
          }`}
        >
          <span
            className="inline-block h-0 w-3.5 border-t-2 border-dotted"
            style={{ borderColor: "#60a5fa" }}
          />
          BTC stack
        </button>
        <button
          type="button"
          onClick={toggleBtcPrice}
          aria-pressed={showBtcPrice}
          title={
            showBtcPrice
              ? "Hide BTC price"
              : showBtcStack
                ? "Show BTC price (hides BTC stack)"
                : "Show BTC price"
          }
          className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
            showBtcPrice ? "text-muted hover:text-ink" : "text-faint opacity-60 hover:opacity-100"
          }`}
        >
          <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-bitcoin" />
          BTC price
        </button>
        <div
          className="ml-auto inline-flex items-center gap-0.5 rounded border border-edge p-0.5"
          role="group"
          aria-label="Y-axis scale"
        >
          {(["linear", "log"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              aria-pressed={scale === s}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                scale === s
                  ? "bg-bitcoin text-night"
                  : "text-muted hover:text-ink"
              }`}
            >
              {s === "linear" ? "Lin" : "Log"}
            </button>
          ))}
        </div>
      </div>
      <DateRangeControls
        presets={HOLDINGS_PRESETS}
        activePreset={zoom.activePreset}
        onPreset={handlePreset}
        onReset={zoom.reset}
      />
      <div className="h-[280px] w-full select-none" onDoubleClick={zoom.reset}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={filtered}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
            onMouseDown={zoom.onMouseDown}
            onMouseMove={zoom.onMouseMove}
            onMouseUp={zoom.onMouseUp}
            onMouseLeave={zoom.onMouseLeave}
          >
            <CartesianGrid
              stroke="#232830"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={xFormatter}
              ticks={xTicks}
              interval={xTicks ? 0 : undefined}
              minTickGap={xTicks ? undefined : visibleRangeMs > 730 * DAY_MS ? 44 : 28}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
            />
            {showPortfolio && (
              <YAxis
                yAxisId="left"
                tickFormatter={formatUsdShort}
                tick={{ fill: "#8a8f99", fontSize: 11 }}
                stroke="#232830"
                width={54}
                scale={isLog ? "log" : "linear"}
                domain={yLeftDomain}
                allowDataOverflow={isLog}
              />
            )}
            {rightAxisOn && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={showBtcStack ? formatBtcShort : formatUsdShort}
                tick={{
                  fill: showBtcStack ? "#60a5fa" : "#f7931a",
                  fontSize: 11,
                }}
                stroke="#232830"
                width={54}
                scale={isLog ? "log" : "linear"}
                domain={yRightDomain}
                allowDataOverflow={isLog}
              />
            )}
            <Tooltip content={<ChartTooltip />} />
            {showPortfolio && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="portfolioValue"
                name="Portfolio value"
                stroke="#16c784"
                strokeWidth={2}
                fill="#16c784"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
            )}
            {showBtcPrice && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="btcPrice"
                name="BTC price"
                stroke="#f7931a"
                strokeWidth={1.6}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showBtcStack && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="btcStack"
                name="BTC stack"
                stroke="#60a5fa"
                strokeWidth={1.6}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {/* Anchor the drag-zoom rectangle to whichever Y axis is mounted —
                referencing "left" when the portfolio area is hidden would
                produce an unresolved yAxisId warning from recharts. */}
            {zoom.dragStart != null &&
              zoom.dragEnd != null &&
              (showPortfolio || rightAxisOn) && (
                <ReferenceArea
                  yAxisId={showPortfolio ? "left" : "right"}
                  x1={zoom.dragStart as string}
                  x2={zoom.dragEnd as string}
                  stroke="#f7931a"
                  strokeOpacity={0.4}
                  fill="#f7931a"
                  fillOpacity={0.08}
                />
              )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

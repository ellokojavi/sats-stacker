"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceArea,
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
import { DateRangeControls } from "./charts/DateRangeControls";
import { useChartZoom } from "./charts/useChartZoom";
import {
  BACKWARD_PRESETS,
  backwardWindowMs,
  type BackwardPresetId,
} from "./charts/dateRangePresets";

const DAY_MS = 86400000;

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

/**
 * Build an X-tick array appropriate for the visible range — year boundaries
 * when zoomed out, month boundaries in the middle, day-ish ticks when zoomed
 * deep. Keeping ~6–10 ticks regardless of zoom level keeps the axis legible.
 */
function buildXTicks(lo: number, hi: number): number[] {
  const range = hi - lo;
  const ticks: number[] = [];
  if (range > 730 * DAY_MS) {
    const minYear = new Date(lo).getUTCFullYear();
    const maxYear = new Date(hi).getUTCFullYear();
    for (let y = minYear; y <= maxYear + 1; y++) {
      const t = Date.UTC(y, 0, 1);
      if (t >= lo && t <= hi) ticks.push(t);
    }
  } else if (range > 90 * DAY_MS) {
    const d = new Date(lo);
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    // Walk forward in 1-month steps, optionally stepping by 2 if too crowded.
    const step = range > 365 * DAY_MS ? 2 : 1;
    while (true) {
      const t = Date.UTC(y, m, 1);
      if (t > hi) break;
      if (t >= lo) ticks.push(t);
      m += step;
      while (m > 11) {
        m -= 12;
        y += 1;
      }
    }
  } else if (range > 21 * DAY_MS) {
    for (let t = lo; t <= hi; t += 7 * DAY_MS) ticks.push(t);
  } else {
    for (let t = lo; t <= hi; t += DAY_MS) ticks.push(t);
  }
  return ticks.length > 0 ? ticks : [lo, hi];
}

function buildXFormatter(lo: number, hi: number): (t: number) => string {
  const range = hi - lo;
  if (range > 730 * DAY_MS) {
    return (t) => String(new Date(t).getUTCFullYear());
  }
  if (range > 90 * DAY_MS) {
    return (t) => {
      const d = new Date(t);
      return d.toLocaleString("default", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    };
  }
  return (t) => {
    const d = new Date(t);
    return d.toLocaleString("default", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
}

export function SubmarineChart({
  lots,
  currentPrice,
}: {
  lots: Lot[];
  currentPrice: number;
}) {
  const points = useMemo(
    () =>
      lots.map((l) => ({
        x: new Date(l.date.replace(" ", "T") + "Z").getTime(),
        y: l.buyPrice,
        z: l.usd,
        roi: l.roi,
        source: l.source,
        dateStr: l.date,
      })),
    [lots],
  );

  const fullRangeMs = useMemo<[number, number]>(() => {
    if (points.length === 0) return [0, 1];
    const times = points.map((p) => p.x);
    const min = Math.min(...times);
    const max = Math.max(...times);
    // Anchor the right edge of the "full" view to a year boundary so the
    // existing yearly tick layout still works for "All".
    const maxYear = new Date(max).getUTCFullYear();
    return [min, Date.UTC(maxYear + 1, 0, 1)];
  }, [points]);

  const zoom = useChartZoom({ fullRange: fullRangeMs });

  const handlePreset = (id: string) => {
    // Backward presets count from the latest lot's date, not the year-boundary
    // anchor — otherwise "7D" would silently end in the future.
    const latestLot = points.length > 0 ? Math.max(...points.map((p) => p.x)) : fullRangeMs[1];
    const earliest = fullRangeMs[0];
    const window = backwardWindowMs(id as BackwardPresetId, latestLot, earliest);
    zoom.setDomain(window, id);
  };

  // Active domain in ms — either user-selected or the full year-aligned range.
  const [xLo, xHi] = zoom.domain ?? fullRangeMs;

  // Filter points to the visible window so off-screen dots don't draw on top of
  // the axis or overflow the plot area.
  const visiblePoints = useMemo(
    () => points.filter((p) => p.x >= xLo && p.x <= xHi),
    [points, xLo, xHi],
  );
  const inProfit = visiblePoints.filter((p) => p.y <= currentPrice);
  const underwater = visiblePoints.filter((p) => p.y > currentPrice);

  // Y-axis bounds: derived from visible points so zooming actually zooms the
  // y-range too (e.g. zooming into 2023 shouldn't keep the 2025 high-water mark
  // on the axis).
  const yPrices = visiblePoints.length > 0 ? visiblePoints.map((p) => p.y) : [currentPrice];
  const yMin = Math.max(1, Math.min(...yPrices) * 0.7);
  const yMax = Math.max(...yPrices, currentPrice) * 1.3;

  const xTicks = useMemo(() => buildXTicks(xLo, xHi), [xLo, xHi]);
  const xFormatter = useMemo(() => buildXFormatter(xLo, xHi), [xLo, xHi]);

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
      <DateRangeControls
        presets={BACKWARD_PRESETS}
        activePreset={zoom.activePreset}
        onPreset={handlePreset}
        onReset={zoom.reset}
      />
      <div className="h-[300px] w-full select-none" onDoubleClick={zoom.reset}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
            onMouseDown={zoom.onMouseDown}
            onMouseMove={zoom.onMouseMove}
            onMouseUp={zoom.onMouseUp}
            onMouseLeave={zoom.onMouseLeave}
          >
            <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[xLo, xHi]}
              ticks={xTicks}
              tickFormatter={xFormatter}
              tick={{ fill: "#8a8f99", fontSize: 11 }}
              stroke="#232830"
              allowDataOverflow
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
              isAnimationActive={false}
            />
            <Scatter
              name="underwater"
              data={underwater}
              fill="#ea3943"
              fillOpacity={0.7}
              isAnimationActive={false}
            />
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
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

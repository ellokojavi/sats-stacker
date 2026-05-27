"use client";

import { useMemo } from "react";
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
import { formatUsd, formatUsdShort, formatDate } from "@/lib/format";
import { DateRangeControls } from "./charts/DateRangeControls";
import { useChartZoom } from "./charts/useChartZoom";
import {
  BACKWARD_PRESETS,
  backwardWindowMs,
  type BackwardPresetId,
} from "./charts/dateRangePresets";

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

  const zoom = useChartZoom({ fullRange: fullRangeMs });

  // Translate a backward preset into a [lo, hi] ms window and hand it to the hook.
  const handlePreset = (id: string) => {
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
      <DateRangeControls
        presets={BACKWARD_PRESETS}
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
              minTickGap={visibleRangeMs > 730 * DAY_MS ? 44 : 28}
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
              isAnimationActive={false}
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
              isAnimationActive={false}
            />
            {zoom.dragStart != null && zoom.dragEnd != null && (
              <ReferenceArea
                yAxisId="left"
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

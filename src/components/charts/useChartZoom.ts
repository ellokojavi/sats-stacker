"use client";

import { useCallback, useState } from "react";

/**
 * Generic zoom-state hook shared by every chart that supports date-range
 * presets + drag-to-zoom.
 *
 * The hook is intentionally dumb about axis semantics — it stores:
 *   • `domain`: a numeric [lo, hi] window in the chart's native X units
 *     (ms timestamps, days-since-genesis, etc.) or `null` for "full range".
 *   • `activePreset`: the preset id currently selected, for button highlighting.
 *     `null` means the user picked a custom range by dragging.
 *   • `dragStart` / `dragEnd`: the raw X-axis label values during a drag, kept
 *     in the chart's native form (string for categorical date axes, number for
 *     numeric axes) so they can be fed directly to <ReferenceArea x1=… x2=…>.
 *
 * Each chart owns the preset → domain translation (because the axis units
 * differ) and calls `setDomain(d, presetId)` to apply it.
 *
 * Drag detection uses a 1%-of-full-range minimum width so a stray click doesn't
 * zoom the chart to a single pixel.
 */

export type AxisValue = number | string;

/**
 * Recharts surfaces the cursor's X-axis value under two different keys
 * depending on the chart family:
 *   • LineChart / BarChart / ComposedChart (axis-tooltip charts) populate
 *     `activeLabel` — the dataKey value of the nearest category.
 *   • ScatterChart (item-tooltip with continuous axes) populates `xValue`,
 *     the inverted x-scale value at the cursor, and leaves `activeLabel`
 *     undefined. Using only `activeLabel` here silently disables drag-zoom
 *     on every ScatterChart, which was the original bug.
 */
export type ChartMouseEvent = {
  activeLabel?: AxisValue;
  xValue?: AxisValue;
  activeCoordinate?: { x: number; y: number };
} | null;

/** Pull the cursor's X-axis value from a recharts mouse event, regardless
 *  of which chart family fired it. Returns `undefined` if the event is
 *  outside the plot area or recharts couldn't resolve a scale. */
const getEventX = (e: ChartMouseEvent): AxisValue | undefined => {
  if (!e) return undefined;
  if (e.activeLabel != null) return e.activeLabel;
  if (e.xValue != null) return e.xValue;
  return undefined;
};

export interface UseChartZoomOptions {
  /** Full X range of the data in numeric units. Used to compute the minimum
   *  drag-width threshold so clicks aren't interpreted as zooms. */
  fullRange: [number, number];
  /** Converts an axis label (which may be a string date or a number) into the
   *  numeric form used for the `domain`. Defaults to: numbers passed through,
   *  strings parsed as ISO dates → ms. */
  toNumber?: (v: AxisValue | undefined) => number | null;
}

const defaultToNumber = (v: AxisValue | undefined): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

export function useChartZoom({
  fullRange,
  toNumber = defaultToNumber,
}: UseChartZoomOptions) {
  const [domain, setDomainState] = useState<[number, number] | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>("ALL");
  const [dragStart, setDragStart] = useState<AxisValue | null>(null);
  const [dragEnd, setDragEnd] = useState<AxisValue | null>(null);

  /** Apply a domain (or null for full range) and optionally tag it with the
   *  preset id that produced it. Pass `presetId = null` to mark the domain as
   *  a custom drag-selected range. */
  const setDomain = useCallback(
    (d: [number, number] | null, presetId: string | null = null) => {
      setDomainState(d);
      setActivePreset(d === null ? "ALL" : presetId);
      setDragStart(null);
      setDragEnd(null);
    },
    [],
  );

  const reset = useCallback(() => setDomain(null, "ALL"), [setDomain]);

  const onMouseDown = useCallback((e: ChartMouseEvent) => {
    const x = getEventX(e);
    if (x == null) return;
    setDragStart(x);
    setDragEnd(x);
  }, []);

  const onMouseMove = useCallback(
    (e: ChartMouseEvent) => {
      const x = getEventX(e);
      if (x == null) return;
      // Only update if we're currently dragging.
      setDragEnd((prevEnd) => {
        // If there's no drag in progress (dragStart was cleared), don't capture
        // hover-only moves.
        return prevEnd === null ? null : x;
      });
    },
    [],
  );

  const onMouseUp = useCallback(() => {
    if (dragStart === null || dragEnd === null) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const a = toNumber(dragStart);
    const b = toNumber(dragEnd);
    setDragStart(null);
    setDragEnd(null);
    if (a === null || b === null) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const minWidth = (fullRange[1] - fullRange[0]) * 0.01;
    if (hi - lo < minWidth) return; // treat as click, don't zoom
    setDomainState([lo, hi]);
    setActivePreset(null);
  }, [dragStart, dragEnd, fullRange, toNumber]);

  /** Cancel an in-progress drag if the cursor leaves the chart. */
  const onMouseLeave = useCallback(() => {
    setDragStart(null);
    setDragEnd(null);
  }, []);

  return {
    domain,
    activePreset,
    dragStart,
    dragEnd,
    isDragging: dragStart !== null && dragEnd !== null && dragStart !== dragEnd,
    setDomain,
    reset,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
  };
}

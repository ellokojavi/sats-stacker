"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "@/lib/types";
import { formatUsd, formatBtc, formatDate } from "@/lib/format";
import { Panel } from "./Panel";

const DAY_MS = 86400000;
const CELL_PX = 12;
const GAP_PX = 2;
const STRIDE_PX = CELL_PX + GAP_PX; // px per week column
const ROWS = 7;

interface DayCell {
  date: string;
  weekday: number; // 0 = Sun … 6 = Sat (matches GitHub: first row = Sun)
  week: number; // 0-based column index into the FULL timeline (not per-year)
  year: number;
  usd: number;
  btc: number;
  buyCount: number;
  sources: string[]; // unique exchange names, in insertion order
  avgPrice: number; // capital-weighted average buy price (USD / BTC)
}

interface YearRange {
  /** Inclusive start column index into the full timeline. */
  startWeek: number;
  /** Inclusive end column index. */
  endWeek: number;
  /** Pixel position of the year's first column (for scrollTo). */
  startPx: number;
  /** Pixel position one past the year's last column. */
  endPx: number;
}

/** Compact USD formatter for the legend ladder — "$1.2K" instead of "$1,234".
 *  Keeps the legend strip readable even when the brightest day is in the
 *  six-figure range. */
function formatUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/** Map a USD amount → cell color. sqrt scale keeps small buys visible without
 *  letting one giant buy wash out the rest of the timeline. */
function cellColor(usd: number, max: number): string {
  if (usd <= 0 || max <= 0) return "#1c2128";
  const intensity = Math.min(1, Math.sqrt(usd / max));
  const opacity = 0.22 + intensity * 0.78;
  return `rgba(247, 147, 26, ${opacity})`;
}

/**
 * GitHub-style buy heatmap, but rendered as one continuous horizontally-
 * scrollable timeline spanning every year from first buy → today. Year chips
 * above act as quick-jump navigation: click one to scroll the grid to that
 * year, and the chip whose year currently dominates the viewport lights up
 * as the user scrolls.
 */
export function BuyHeatmap({ txns }: { txns: Transaction[] }) {
  // ── Aggregate per-day USD / BTC / count / sources for every buy. Cached
  //    once so the tooltip has everything it needs in one lookup.
  const byDate = useMemo(() => {
    const m = new Map<
      string,
      { usd: number; btc: number; count: number; sources: string[] }
    >();
    for (const t of txns) {
      if (t.usd <= 0) continue;
      const d = t.date.slice(0, 10);
      const entry = m.get(d) ?? { usd: 0, btc: 0, count: 0, sources: [] };
      entry.usd += t.usd;
      entry.btc += t.btc;
      entry.count += 1;
      if (!entry.sources.includes(t.source)) entry.sources.push(t.source);
      m.set(d, entry);
    }
    return m;
  }, [txns]);

  // First-buy year and "today" (latest known date) bound the timeline.
  // We anchor the start at January 1 of the first-buy year so the timeline
  // includes the calendar context before the first buy, and stop at the
  // current real-world date.
  const { firstYear, lastYear, lastDateMs } = useMemo(() => {
    let firstMs = Infinity;
    for (const t of txns) {
      if (t.usd <= 0) continue;
      const ms = new Date(t.date.slice(0, 10) + "T00:00:00Z").getTime();
      if (ms < firstMs) firstMs = ms;
    }
    const todayMs = Date.now();
    if (!Number.isFinite(firstMs)) {
      return {
        firstYear: new Date(todayMs).getUTCFullYear(),
        lastYear: new Date(todayMs).getUTCFullYear(),
        lastDateMs: todayMs,
      };
    }
    return {
      firstYear: new Date(firstMs).getUTCFullYear(),
      lastYear: new Date(todayMs).getUTCFullYear(),
      lastDateMs: todayMs,
    };
  }, [txns]);

  // Walk every day from Jan 1 of the first-buy year through today and lay it
  // out on the 7-row × N-week grid. GitHub anchors weeks to Sunday: a new
  // column starts whenever we hit a Sunday. `yearRanges` records each year's
  // column span so we can drive the navigation chips and scroll-to-year.
  const { cells, weekCount, yearRanges, globalMax, globalStats } = useMemo(() => {
    const cells: DayCell[] = [];
    const yearRanges = new Map<number, YearRange>();
    const startMs = Date.UTC(firstYear, 0, 1);
    // Walk day-by-day; convert to ISO and compute weekday + week.
    let week = 0;
    let max = 0;
    let totalBuys = 0;
    let totalUsd = 0;
    let totalActiveDays = 0;
    for (let t = startMs; t <= lastDateMs; t += DAY_MS) {
      const dt = new Date(t);
      const weekday = dt.getUTCDay();
      const year = dt.getUTCFullYear();
      // Advance the week counter every Sunday after day 0.
      if (weekday === 0 && t > startMs) week += 1;
      const dateStr = dt.toISOString().slice(0, 10);
      const day = byDate.get(dateStr);
      const usd = day?.usd ?? 0;
      const btc = day?.btc ?? 0;
      cells.push({
        date: dateStr,
        weekday,
        week,
        year,
        usd,
        btc,
        buyCount: day?.count ?? 0,
        sources: day?.sources ?? [],
        avgPrice: day && day.btc > 0 ? day.usd / day.btc : 0,
      });
      if (usd > 0) {
        totalActiveDays += 1;
        totalBuys += day?.count ?? 0;
        totalUsd += usd;
        if (usd > max) max = usd;
      }
      // Track each year's column span. The first cell of a year defines its
      // start; the last cell of a year defines its end.
      const existing = yearRanges.get(year);
      if (!existing) {
        yearRanges.set(year, {
          startWeek: week,
          endWeek: week,
          startPx: week * STRIDE_PX,
          endPx: (week + 1) * STRIDE_PX,
        });
      } else {
        existing.endWeek = week;
        existing.endPx = (week + 1) * STRIDE_PX;
      }
    }
    return {
      cells,
      weekCount: week + 1,
      yearRanges,
      globalMax: max,
      globalStats: {
        buys: totalBuys,
        usd: totalUsd,
        activeDays: totalActiveDays,
      },
    };
  }, [byDate, firstYear, lastDateMs]);

  const allYears = useMemo(() => {
    const out: number[] = [];
    for (let y = firstYear; y <= lastYear; y += 1) out.push(y);
    return out;
  }, [firstYear, lastYear]);

  // Per-year aggregate stats — looked up for the active year's caption.
  const yearStats = useMemo(() => {
    const m = new Map<
      number,
      { buys: number; usd: number; activeDays: number; max: number }
    >();
    for (const c of cells) {
      const e = m.get(c.year) ?? { buys: 0, usd: 0, activeDays: 0, max: 0 };
      if (c.usd > 0) {
        e.buys += c.buyCount;
        e.usd += c.usd;
        e.activeDays += 1;
        if (c.usd > e.max) e.max = c.usd;
      }
      m.set(c.year, e);
    }
    return m;
  }, [cells]);

  // Active year follows the scroll position. Starts on the latest year so the
  // user lands on recent activity.
  const [activeYear, setActiveYear] = useState<number>(lastYear);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Programmatic scrolls fired by clicking a year chip should still trigger
  // the onScroll handler — we use a frame-throttled tick to keep activeYear
  // in sync without re-rendering on every scroll event.
  const rafRef = useRef<number | null>(null);

  const recomputeActiveYear = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    let bestYear = activeYear;
    let bestOverlap = -1;
    for (const y of allYears) {
      const range = yearRanges.get(y);
      if (!range) continue;
      const overlap = Math.max(
        0,
        Math.min(right, range.endPx) - Math.max(left, range.startPx),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestYear = y;
      }
    }
    if (bestYear !== activeYear) setActiveYear(bestYear);
  }, [activeYear, allYears, yearRanges]);

  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recomputeActiveYear();
    });
  }, [recomputeActiveYear]);

  // On mount, jump to the latest year so the user lands on recent activity
  // instead of staring at empty cells at the start of the timeline.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const range = yearRanges.get(lastYear);
    if (range) el.scrollLeft = range.startPx;
    // No deps — runs once on mount. `yearRanges` is stable as long as the
    // ledger doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToYear = useCallback(
    (y: number) => {
      const el = scrollRef.current;
      const range = yearRanges.get(y);
      if (!el || !range) return;
      el.scrollTo({ left: range.startPx, behavior: "smooth" });
      // Smooth scrolling fires onScroll repeatedly — the rAF tick will catch
      // up. Set immediately too so the chip lights up without a delay.
      setActiveYear(y);
    },
    [yearRanges],
  );

  // Hovered-cell state for the rich tooltip. We track the viewport coords of
  // the cursor (not the cell) so the tooltip can follow the mouse and never
  // sit underneath it.
  const [hover, setHover] = useState<{
    cell: DayCell;
    x: number;
    y: number;
  } | null>(null);

  /**
   * Five legend bands. The color scale is `sqrt(usd / globalMax)` so each
   * band's upper bound in USD comes from inverting that: usd = max × intensity².
   * Anchored to the global max (across every year) so a band's color reads
   * as the same dollar amount regardless of which year is in view.
   */
  const legendBands = useMemo(() => {
    if (globalMax <= 0) return [];
    return [
      { intensity: 0, label: "0" },
      { intensity: 0.25, label: `≤ ${formatUsdCompact(globalMax * 0.0625)}` },
      { intensity: 0.5, label: `≤ ${formatUsdCompact(globalMax * 0.25)}` },
      { intensity: 0.75, label: `≤ ${formatUsdCompact(globalMax * 0.5625)}` },
      { intensity: 1, label: `≤ ${formatUsdCompact(globalMax)}` },
    ];
  }, [globalMax]);

  if (cells.length === 0) {
    return (
      <Panel title="Buy heatmap">
        <p className="text-[12px] text-muted">
          Import a ledger with at least one buy to see the heatmap.
        </p>
      </Panel>
    );
  }

  const gridWidth = weekCount * STRIDE_PX - GAP_PX;
  const activeStats = yearStats.get(activeYear);

  return (
    <Panel title="Buy heatmap">
      {/* Year navigation chips — click to scroll to that year; the chip whose
          year currently dominates the viewport lights up. */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {allYears.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => scrollToYear(y)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeYear === y
                ? "bg-bitcoin text-night"
                : "bg-night text-muted hover:text-ink"
            }`}
            aria-pressed={activeYear === y}
            aria-label={`Scroll to ${y}`}
          >
            {y}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-faint">
          {activeStats && activeStats.activeDays > 0
            ? `${activeStats.buys.toLocaleString()} buys · ${formatUsd(activeStats.usd)} invested · ${activeStats.activeDays} active day${activeStats.activeDays === 1 ? "" : "s"} in ${activeYear}`
            : `No buys in ${activeYear}`}
        </span>
      </div>

      {/* The grid scrolls horizontally across the whole timeline. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-x-auto pb-1"
      >
        <div style={{ width: gridWidth }} className="inline-block">
          {/* Year labels inside the scroll container so they move with the
              grid. Positioned absolutely at each year's first column. */}
          <div
            className="relative mb-1 h-3 text-[10px] text-faint"
            style={{ width: gridWidth }}
          >
            {allYears.map((y) => {
              const range = yearRanges.get(y);
              if (!range) return null;
              return (
                <span
                  key={y}
                  className={`absolute font-mono ${
                    activeYear === y ? "text-ink" : ""
                  }`}
                  style={{ left: range.startPx }}
                >
                  {y}
                </span>
              );
            })}
          </div>

          {/* The 7-row × N-week grid. CSS grid handles positioning via row /
              column indexes set on each cell. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${weekCount}, ${CELL_PX}px)`,
              gridTemplateRows: `repeat(${ROWS}, ${CELL_PX}px)`,
              gap: `${GAP_PX}px`,
            }}
          >
            {cells.map((c) => {
              // Only active (buy) cells get hover handlers. Empty days don't
              // need a tooltip and would otherwise flicker "no buys" past the
              // cursor for the ~95% of cells that have nothing in them.
              const isActive = c.usd > 0;
              return (
                <div
                  key={c.date}
                  style={{
                    gridColumn: c.week + 1,
                    gridRow: c.weekday + 1,
                    backgroundColor: cellColor(c.usd, globalMax),
                    borderRadius: 2,
                    cursor: isActive ? "pointer" : "default",
                  }}
                  onMouseEnter={
                    isActive
                      ? (e) =>
                          setHover({ cell: c, x: e.clientX, y: e.clientY })
                      : undefined
                  }
                  onMouseMove={
                    isActive
                      ? (e) =>
                          setHover((h) =>
                            h && h.cell.date === c.date
                              ? { ...h, x: e.clientX, y: e.clientY }
                              : h,
                          )
                      : undefined
                  }
                  onMouseLeave={
                    isActive
                      ? () =>
                          setHover((h) =>
                            h && h.cell.date === c.date ? null : h,
                          )
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend — color bands with their actual USD upper bounds so the user
          can read intensity off the chart directly. The first swatch is the
          "no buy" empty cell; the rest cover the sqrt-mapped quartile slices
          of the global max. */}
      <div className="mt-3 text-[11px] text-muted">
        {legendBands.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-end gap-1">
              {legendBands.map((b) => (
                <div
                  key={b.intensity}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="font-mono text-[10px] text-faint">
                    {b.label}
                  </span>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      backgroundColor:
                        b.intensity === 0
                          ? "#1c2128"
                          : `rgba(247, 147, 26, ${0.22 + b.intensity * 0.78})`,
                      borderRadius: 2,
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="ml-auto text-faint">
              {activeStats && activeStats.max > 0
                ? `Brightest day in ${activeYear}: ${formatUsd(activeStats.max)}`
                : `All-time peak: ${formatUsd(globalMax)} (${globalStats.buys.toLocaleString()} buys total)`}
            </span>
          </div>
        ) : (
          <span className="text-faint">No buys recorded yet</span>
        )}
      </div>

      {/* Floating tooltip — follows the cursor so the user can scan along a
          row without losing context. position: fixed lets it escape the
          overflow-x-auto container, and pointer-events-none keeps it from
          intercepting mouse events meant for the cells underneath. */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-edge bg-night px-3 py-2 text-[11px] leading-relaxed shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="mb-1 font-medium text-ink">
            {formatDate(hover.cell.date)}
          </div>
          <div className="space-y-0.5 text-muted">
            <div className="flex items-center justify-between gap-4">
              <span>Invested</span>
              <span className="font-mono tabular-nums text-ink">
                {formatUsd(hover.cell.usd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Acquired</span>
              <span className="font-mono tabular-nums text-bitcoin">
                {formatBtc(hover.cell.btc)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Avg buy price</span>
              <span className="font-mono tabular-nums text-ink">
                {formatUsd(hover.cell.avgPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Buys</span>
              <span className="font-mono tabular-nums text-ink">
                {hover.cell.buyCount}
              </span>
            </div>
            {hover.cell.sources.length > 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-edge pt-1">
                <span>Source{hover.cell.sources.length > 1 ? "s" : ""}</span>
                <span className="text-right text-ink">
                  {hover.cell.sources.join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

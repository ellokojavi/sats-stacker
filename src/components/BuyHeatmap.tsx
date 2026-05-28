"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { formatUsd, formatBtc, formatDate } from "@/lib/format";
import { Panel } from "./Panel";

const DAY_MS = 86400000;
const CELL_PX = 12;
const GAP_PX = 2;
const ROWS = 7;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface DayCell {
  date: string;
  weekday: number; // 0 = Sun … 6 = Sat (so first row = Sun, matches GH)
  week: number; // 0-based column index
  month: number; // 0-based
  usd: number;
  btc: number;
  buyCount: number;
  sources: string[]; // unique exchange names, in insertion order
  avgPrice: number; // capital-weighted average buy price (USD / BTC)
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
 *  letting one giant buy wash out the rest of the year. */
function cellColor(usd: number, yearMax: number): string {
  if (usd <= 0 || yearMax <= 0) return "#1c2128";
  const intensity = Math.min(1, Math.sqrt(usd / yearMax));
  const opacity = 0.22 + intensity * 0.78;
  return `rgba(247, 147, 26, ${opacity})`;
}

/** GitHub-style buy heatmap. One square per day, intensity = USD invested that
 *  day, year-picker chips above. Reads "screenshot-y" at a glance. */
export function BuyHeatmap({ txns }: { txns: Transaction[] }) {
  // ── Aggregate per-day USD / BTC / count / sources for every buy. Cached
  //    once so flipping years doesn't re-walk the txn list, and the tooltip
  //    has everything it needs in one lookup.
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

  // Years with at least one buy, ascending.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const t of txns) {
      if (t.usd <= 0) continue;
      set.add(parseInt(t.date.slice(0, 4)));
    }
    return [...set].sort();
  }, [txns]);

  const [year, setYear] = useState<number>(
    () => years[years.length - 1] ?? new Date().getUTCFullYear(),
  );

  // Build the calendar grid for the selected year. Each cell knows its
  // weekday (row), week index (column), and dollar amount.
  const { cells, weekCount, monthSpans } = useMemo(() => {
    const cells: DayCell[] = [];
    const monthSpans: { month: number; startWeek: number; weeks: number }[] =
      [];
    const yearStartMs = Date.UTC(year, 0, 1);
    const yearEndMs = Date.UTC(year + 1, 0, 1);
    // Anchor the first column so that the first cell sits in the right
    // weekday row (Sun = 0). GitHub anchors weeks to Sunday; we do too.
    const startWeekday = new Date(yearStartMs).getUTCDay();
    let week = 0;
    let monthStartWeek = 0;
    let lastMonth = -1;

    for (let t = yearStartMs; t < yearEndMs; t += DAY_MS) {
      const dt = new Date(t);
      const weekday = dt.getUTCDay();
      const dateStr = dt.toISOString().slice(0, 10);
      // Advance the week index every Sunday (except the first day of the
      // year if it's a Sunday).
      if (weekday === 0 && t > yearStartMs) week += 1;
      // First day of year sits in the right row offset by startWeekday;
      // every subsequent week starts in row 0 (Sun).
      const month = dt.getUTCMonth();
      if (month !== lastMonth) {
        if (lastMonth >= 0) {
          monthSpans.push({
            month: lastMonth,
            startWeek: monthStartWeek,
            weeks: week - monthStartWeek + (weekday === 0 ? 0 : 1),
          });
        }
        monthStartWeek = week;
        lastMonth = month;
      }
      const day = byDate.get(dateStr);
      cells.push({
        date: dateStr,
        weekday,
        week,
        month,
        usd: day?.usd ?? 0,
        btc: day?.btc ?? 0,
        buyCount: day?.count ?? 0,
        sources: day?.sources ?? [],
        avgPrice: day && day.btc > 0 ? day.usd / day.btc : 0,
      });
    }
    // Push the final month's span.
    if (lastMonth >= 0) {
      monthSpans.push({
        month: lastMonth,
        startWeek: monthStartWeek,
        weeks: week - monthStartWeek + 1,
      });
    }
    return { cells, weekCount: week + 1, monthSpans, startWeekday };
  }, [year, byDate]);

  // Per-year totals used for the legend and the color scale's upper bound.
  const yearStats = useMemo(() => {
    let total = 0;
    let max = 0;
    let buys = 0;
    let activeDays = 0;
    for (const c of cells) {
      total += c.usd;
      if (c.usd > 0) {
        activeDays += 1;
        buys += c.buyCount;
        if (c.usd > max) max = c.usd;
      }
    }
    return { total, max, buys, activeDays };
  }, [cells]);

  const gridWidth = weekCount * CELL_PX + (weekCount - 1) * GAP_PX;

  // Hovered-cell state for the rich tooltip. We track the viewport coords of
  // the cursor (not the cell) so the tooltip can follow the mouse and never
  // sit underneath it.
  const [hover, setHover] = useState<{
    cell: DayCell;
    x: number;
    y: number;
  } | null>(null);

  /**
   * Five legend bands. The color scale is `sqrt(usd / yearMax)` so each band's
   * upper bound in USD comes from inverting that: usd = max × intensity².
   * The labels read as "less than X" so they describe the cells the band
   * covers, not a single sample.
   */
  const legendBands = useMemo(() => {
    const max = yearStats.max;
    if (max <= 0) return [];
    return [
      { intensity: 0, label: "0" },
      { intensity: 0.25, label: `≤ ${formatUsdCompact(max * 0.0625)}` },
      { intensity: 0.5, label: `≤ ${formatUsdCompact(max * 0.25)}` },
      { intensity: 0.75, label: `≤ ${formatUsdCompact(max * 0.5625)}` },
      { intensity: 1, label: `≤ ${formatUsdCompact(max)}` },
    ];
  }, [yearStats.max]);

  if (years.length === 0) {
    return (
      <Panel title="Buy heatmap">
        <p className="text-[12px] text-muted">
          Import a ledger with at least one buy to see the heatmap.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Buy heatmap">
      {/* Year selector chips — same visual language as the date-range presets */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              year === y
                ? "bg-bitcoin text-night"
                : "bg-night text-muted hover:text-ink"
            }`}
            aria-pressed={year === y}
          >
            {y}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-faint">
          {yearStats.buys.toLocaleString()} buys ·{" "}
          {formatUsd(yearStats.total)} invested · {yearStats.activeDays} active
          day{yearStats.activeDays === 1 ? "" : "s"}
        </span>
      </div>

      {/* The grid itself scrolls horizontally when the viewport's too narrow.
          On desktop the 53-week × 12px grid is ~750px and fits fine. */}
      <div className="overflow-x-auto pb-1">
        <div style={{ width: gridWidth }} className="inline-block">
          {/* Month labels row — each label sits above the first week of its month */}
          <div
            className="relative mb-1 h-3 text-[10px] text-faint"
            style={{ width: gridWidth }}
          >
            {monthSpans.map((s) => (
              <span
                key={`${year}-${s.month}`}
                className="absolute"
                style={{
                  left: s.startWeek * (CELL_PX + GAP_PX),
                }}
              >
                {MONTH_LABELS[s.month]}
              </span>
            ))}
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
              // need a tooltip and would otherwise flicker "No buys" for the
              // ~95% of cells that have nothing in them.
              const isActive = c.usd > 0;
              return (
                <div
                  key={c.date}
                  style={{
                    gridColumn: c.week + 1,
                    gridRow: c.weekday + 1,
                    backgroundColor: cellColor(c.usd, yearStats.max),
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
          of the year's max. */}
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
              Brightest day in {year}: {formatUsd(yearStats.max)}
            </span>
          </div>
        ) : (
          <span className="text-faint">No buys in {year}</span>
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

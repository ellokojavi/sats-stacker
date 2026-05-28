"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { formatUsd, formatDate } from "@/lib/format";
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
  buyCount: number;
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
  // ── Aggregate USD invested per ISO date string. Pre-computing once means
  //    flipping years doesn't re-walk the txn list.
  const { byDate, byDateCount } = useMemo(() => {
    const sumByDate = new Map<string, number>();
    const countByDate = new Map<string, number>();
    for (const t of txns) {
      if (t.usd <= 0) continue;
      const d = t.date.slice(0, 10);
      sumByDate.set(d, (sumByDate.get(d) ?? 0) + t.usd);
      countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
    }
    return { byDate: sumByDate, byDateCount: countByDate };
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
      cells.push({
        date: dateStr,
        weekday,
        week,
        month,
        usd: byDate.get(dateStr) ?? 0,
        buyCount: byDateCount.get(dateStr) ?? 0,
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
  }, [year, byDate, byDateCount]);

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
            {cells.map((c) => (
              <div
                key={c.date}
                style={{
                  gridColumn: c.week + 1,
                  gridRow: c.weekday + 1,
                  backgroundColor: cellColor(c.usd, yearStats.max),
                  borderRadius: 2,
                }}
                title={
                  c.usd > 0
                    ? `${formatDate(c.date)} · ${formatUsd(c.usd)} across ${c.buyCount} buy${c.buyCount === 1 ? "" : "s"}`
                    : `${formatDate(c.date)} · no buys`
                }
              />
            ))}
          </div>
        </div>
      </div>

      {/* Legend — bands of increasing intensity */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              backgroundColor:
                i === 0 ? "#1c2128" : `rgba(247, 147, 26, ${0.22 + i * 0.78})`,
              borderRadius: 2,
            }}
          />
        ))}
        <span>More</span>
        <span className="ml-auto text-faint">
          {yearStats.max > 0
            ? `Brightest day in ${year}: ${formatUsd(yearStats.max)}`
            : `No buys in ${year}`}
        </span>
      </div>
    </Panel>
  );
}

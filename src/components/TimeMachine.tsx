"use client";

import { useMemo } from "react";
import type { PricePoint } from "@/lib/types";
import { formatDate, formatUsd } from "@/lib/format";
import { Panel } from "./Panel";

/**
 * Draggable date cursor that recomputes every snapshot KPI, lot table,
 * and chart annotation **as if today were that date**.
 *
 * The point is to prove the analytics pipeline is composable, not
 * wired-up: every metric on the dashboard is a pure function of
 * `(txns, price, asOf)`, and dragging the cursor swaps the latter two.
 * Snap-to-today button restores the live view in one click.
 *
 * Implementation notes:
 *   - The slider is bounded by the price-history window we have; we
 *     can't time-travel before the earliest BTC price we know about.
 *   - The displayed date and historical price come from a nearest-day
 *     bisect into `prices`. Gap days (the bundled series is weekly)
 *     snap back to the most recent known close.
 */
export function TimeMachine({
  prices,
  cursorIso,
  todayIso,
  onCursorChange,
}: {
  /** Bundled BTC price history — sets the slider's date domain + price lookup. */
  prices: PricePoint[];
  /** Current cursor date, ISO yyyy-mm-dd. */
  cursorIso: string;
  /** "Today" — the latest known date (bundled.date). */
  todayIso: string;
  /** Called with the new cursor date. */
  onCursorChange: (iso: string) => void;
}) {
  // Pre-compute the date domain. Prices come sorted; we just clip dates to
  // the yyyy-mm-dd portion so the slider's index math doesn't care about
  // timezones.
  const days = useMemo(
    () => prices.map((p) => p.date.slice(0, 10)),
    [prices],
  );
  const cursorIdx = useMemo(() => {
    if (days.length === 0) return 0;
    // Bisect for the largest day <= cursorIso.
    let lo = 0;
    let hi = days.length - 1;
    if (cursorIso < days[0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (days[mid] <= cursorIso) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, [days, cursorIso]);

  if (prices.length === 0) return null;

  const cursorPoint = prices[cursorIdx];
  const isToday = cursorPoint.date.slice(0, 10) >= todayIso.slice(0, 10);
  const maxIdx = prices.length - 1;

  function handleSlide(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value);
    onCursorChange(prices[next].date.slice(0, 10));
  }

  function jumpToToday() {
    onCursorChange(todayIso.slice(0, 10));
  }

  return (
    <Panel
      title="🕰️ Time machine"
      legend={
        <span
          className="text-[11px] text-faint"
          title="Drag to recompute every metric on the dashboard as if today were the selected date. Demonstrates that the analytics pipeline is a pure function of (transactions, price, asOf)."
        >
          recompute the entire dashboard as of a past date
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              As of
            </span>
            <span className="font-mono text-[14px] text-ink">
              {formatDate(cursorPoint.date)}
            </span>
            {isToday && (
              <span className="rounded-full border border-up/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-up">
                Live
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3 text-[11px]">
            <span className="text-muted">BTC on this day</span>
            <span className="font-mono text-ink">
              {formatUsd(cursorPoint.price)}
            </span>
            {!isToday && (
              <button
                type="button"
                onClick={jumpToToday}
                className="rounded border border-bitcoin/60 px-2 py-0.5 text-[11px] text-bitcoin hover:bg-bitcoin/10"
              >
                Back to today
              </button>
            )}
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={maxIdx}
          step={1}
          value={cursorIdx}
          onChange={handleSlide}
          aria-label="Date cursor"
          // Tailwind doesn't ship range-thumb utilities; the brand orange
          // thumb is set in globals.css.
          className="time-machine-range w-full"
        />

        <div className="flex justify-between text-[10px] uppercase tracking-wider text-faint">
          <span>{formatDate(prices[0].date)}</span>
          <span>{formatDate(prices[maxIdx].date)}</span>
        </div>
      </div>
    </Panel>
  );
}

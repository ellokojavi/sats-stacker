"use client";

import type { Snapshot } from "@/lib/types";
import { formatPct, formatBtcValue, formatValue } from "@/lib/format";
import { useUnit } from "@/lib/unit";
import { MetricCard } from "./MetricCard";

/**
 * Headline KPI strip. Layout ladder:
 *   • mobile  → 2 cards / row (cards stay thumb-tappable; 4 rows of 7 cards)
 *   • sm+     → 3 cards / row
 *   • lg+     → 4 cards / row (two rows of clean readable cards)
 *
 * An earlier version tried 7-per-row at lg to make the strip a single line,
 * but at max-w-5xl that leaves each card under 145px wide — long values like
 * "$1,386,959" and labels like "Break-even distance" wrap unflatteringly.
 * Two rows of comfortably-sized cards reads better than one cramped row.
 *
 * Every dollar-denominated card runs through `formatValue` so the
 * USD/sats toggle in the header flips the entire strip at once. The
 * BTC quantity card also respects the toggle (sats stack vs BTC stack).
 */
export function SnapshotGrid({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot;
  const { unit, price } = useUnit();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <MetricCard label="Total stack" value={formatBtcValue(s.totalBtc, unit)} />
      <MetricCard
        label="Net invested"
        value={formatValue(s.totalInvested, unit, price)}
      />
      <MetricCard
        label="Current value"
        value={formatValue(s.currentValue, unit, price)}
      />
      <MetricCard
        label="Net profit / loss"
        value={formatValue(s.netPL, unit, price)}
        accent={s.netPL >= 0 ? "up" : "down"}
      />
      <MetricCard
        label="Total ROI"
        value={formatPct(s.totalRoi)}
        accent={s.totalRoi >= 0 ? "up" : "down"}
      />
      <MetricCard
        label="Avg cost basis"
        value={formatValue(s.avgCostBasis, unit, price)}
      />
      <MetricCard
        label="Break-even distance"
        value={formatPct(s.breakEvenDist)}
        accent={s.breakEvenDist >= 0 ? "up" : "down"}
      />
    </div>
  );
}

import type { Snapshot } from "@/lib/types";
import { formatUsd, formatPct, formatBtc } from "@/lib/format";
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
 */
export function SnapshotGrid({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <MetricCard label="Total stack" value={formatBtc(s.totalBtc)} />
      <MetricCard label="Net invested" value={formatUsd(s.totalInvested)} />
      <MetricCard label="Current value" value={formatUsd(s.currentValue)} />
      <MetricCard
        label="Net profit / loss"
        value={formatUsd(s.netPL)}
        accent={s.netPL >= 0 ? "up" : "down"}
      />
      <MetricCard
        label="Total ROI"
        value={formatPct(s.totalRoi)}
        accent={s.totalRoi >= 0 ? "up" : "down"}
      />
      <MetricCard label="Avg cost basis" value={formatUsd(s.avgCostBasis)} />
      <MetricCard
        label="Break-even distance"
        value={formatPct(s.breakEvenDist)}
        accent={s.breakEvenDist >= 0 ? "up" : "down"}
      />
    </div>
  );
}

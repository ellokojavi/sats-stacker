import type { Snapshot } from "@/lib/types";
import { formatUsd, formatPct, formatBtc } from "@/lib/format";
import { MetricCard } from "./MetricCard";

/**
 * Headline KPI strip. On mobile the cards stack 2-wide so each one stays
 * thumb-tappable instead of squeezing 7 cards into one line; the breakpoint
 * ladder lifts that to 4-wide on tablet (sm) and 7-wide on desktop (lg) so
 * the strip becomes a single row when there's room.
 */
export function SnapshotGrid({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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

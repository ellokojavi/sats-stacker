import type { CagrResult } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Panel } from "./Panel";

function asPct(fraction: number): string {
  return (fraction * 100).toFixed(1) + "%";
}

export function CapitalEfficiency({ cagr }: { cagr: CagrResult }) {
  const bars = [
    { label: "Your strategy", value: cagr.weightedCagr, color: "#f7931a" },
    { label: "Mag 7", value: cagr.mag7, color: "#5f5e5a" },
    { label: "S&P 500", value: cagr.sp500, color: "#5f5e5a" },
  ];
  const max = Math.max(...bars.map((b) => b.value), 0.01);

  return (
    <Panel title="Capital efficiency — capital-weighted CAGR vs. benchmarks">
      <div className="space-y-2">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-ink">
              {b.label}
            </span>
            <div className="h-3.5 flex-1 overflow-hidden rounded bg-night">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(2, (b.value / max) * 100)}%`,
                  backgroundColor: b.color,
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink">
              {asPct(b.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-edge pt-3 text-[11px] text-muted">
        {cagr.tiers.map((t) => (
          <span key={t.label}>
            {t.label}:{" "}
            <span className="font-mono text-ink">{formatUsd(t.invested)}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

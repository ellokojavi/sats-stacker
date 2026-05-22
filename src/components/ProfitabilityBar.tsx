import type { TierRow } from "@/lib/types";
import { Panel } from "./Panel";

const TIER_COLORS: Record<string, string> = {
  "Heavy loss": "#791f1f",
  Loss: "#ea3943",
  Profit: "#1d9e75",
  "Multi-bagger": "#16c784",
  Moonbag: "#f7931a",
};

export function ProfitabilityBar({ tiers }: { tiers: TierRow[] }) {
  const segments = tiers.filter((t) => t.pctOfCapital > 0);

  return (
    <Panel title="Profitability distribution — share of invested capital by ROI tier">
      <div className="flex h-6 w-full overflow-hidden rounded">
        {segments.map((t) => (
          <div
            key={t.label}
            style={{
              width: `${t.pctOfCapital}%`,
              backgroundColor: TIER_COLORS[t.label] ?? "#5f5e5a",
            }}
            title={`${t.label}: ${t.pctOfCapital.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiers.map((t) => (
          <div key={t.label} className="text-[11px]">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: TIER_COLORS[t.label] ?? "#5f5e5a" }}
              />
              <span className="text-ink">{t.label}</span>
            </div>
            <div className="mt-0.5 pl-4 font-mono text-muted">
              {t.count} lots · {t.pctOfCapital.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

import type { Lot } from "@/lib/types";
import { formatUsd, formatPct, formatDateShort } from "@/lib/format";
import { Panel } from "./Panel";

function LotList({
  lots,
  label,
  accent,
}: {
  lots: Lot[];
  label: string;
  accent: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px]" style={{ color: accent }}>
        {label}
      </div>
      {lots.map((l, i) => (
        <div
          key={l.id || i}
          className="flex items-center justify-between border-t border-edge py-1.5 text-[11px] first:border-t-0"
        >
          <span className="text-ink">
            {formatDateShort(l.date)} · {l.source}
          </span>
          <span className="flex gap-3 font-mono">
            <span className={l.profit >= 0 ? "text-up" : "text-down"}>
              {formatUsd(l.profit)}
            </span>
            <span
              className={`w-16 text-right ${l.roi >= 0 ? "text-up" : "text-down"}`}
            >
              {formatPct(l.roi * 100)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function HallOfFame({ lots }: { lots: Lot[] }) {
  const sorted = [...lots].sort((a, b) => b.profit - a.profit);
  const top = sorted.slice(0, 5);
  const bottom = sorted.slice(-5).reverse();

  return (
    <Panel title="Hall of fame & wall of shame">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <LotList lots={top} label="Top 5 lots by net profit" accent="#16c784" />
        <LotList
          lots={bottom}
          label="Bottom 5 lots by net profit"
          accent="#f7931a"
        />
      </div>
    </Panel>
  );
}

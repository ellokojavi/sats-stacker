import type { Snapshot } from "@/lib/types";
import { formatUsd, formatDate } from "@/lib/format";

export function TopBar({ snapshot }: { snapshot: Snapshot }) {
  return (
    <header className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bitcoin text-[15px] font-medium text-night">
        &#8383;
      </div>
      <span className="text-[15px] font-medium text-ink">sats-stacker</span>
      <span className="rounded-md border border-bitcoin/30 bg-bitcoin/10 px-2 py-0.5 text-[11px] text-bitcoin">
        demo data
      </span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-ink">
          BTC{" "}
          <span className="font-mono font-medium">
            {formatUsd(snapshot.currentPrice)}
          </span>
        </span>
        <span className="text-[11px] text-faint">
          as of {formatDate(snapshot.lastUpdated)}
        </span>
      </div>
    </header>
  );
}

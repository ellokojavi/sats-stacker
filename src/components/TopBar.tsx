import type { ViewMode } from "@/lib/types";
import { formatUsd, formatDate } from "@/lib/format";

export function TopBar({
  mode,
  onModeChange,
  price,
  live,
  asOf,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  price: number;
  live: boolean;
  asOf: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-bitcoin text-[15px] font-medium text-night">
        &#8383;
      </div>
      <span className="text-[15px] font-medium text-ink">sats-stacker</span>

      <div
        className="flex items-center rounded-full border border-edge p-0.5"
        role="group"
        aria-label="Data mode"
      >
        <button
          type="button"
          onClick={() => onModeChange("demo")}
          aria-pressed={mode === "demo"}
          className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
            mode === "demo"
              ? "bg-bitcoin/20 text-bitcoin"
              : "text-muted hover:text-ink"
          }`}
        >
          Demo
        </button>
        <button
          type="button"
          onClick={() => onModeChange("real")}
          aria-pressed={mode === "real"}
          className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
            mode === "real" ? "bg-up/20 text-up" : "text-muted hover:text-ink"
          }`}
        >
          Real
        </button>
      </div>

      <a
        href="https://www.coingecko.com/en/coins/bitcoin"
        target="_blank"
        rel="noopener noreferrer"
        title="Open Bitcoin on CoinGecko"
        className="ml-auto flex items-center gap-3 hover:opacity-80"
      >
        <span className="text-[13px] text-ink">
          BTC{" "}
          <span className="font-mono font-medium">{formatUsd(price)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-faint">
          <span className="relative flex h-2 w-2">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                live ? "bg-up" : "bg-faint"
              }`}
            />
          </span>
          {live ? "live price" : `as of ${formatDate(asOf)}`}
        </span>
      </a>
    </header>
  );
}

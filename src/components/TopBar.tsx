"use client";

import type { ViewMode } from "@/lib/types";
import { formatUsd, formatDate } from "@/lib/format";
import { useUnit } from "@/lib/unit";
import { BlockchainStatus } from "./BlockchainStatus";

export function TopBar({
  mode,
  onModeChange,
  price,
  live,
  asOf,
  onLogoClick,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  price: number;
  live: boolean;
  asOf: string;
  onLogoClick?: () => void;
}) {
  const { unit, setUnit } = useUnit();
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={onLogoClick}
        title="Go to Overview"
        aria-label="Go to Overview"
        className="flex items-center gap-3 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/60"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bitcoin text-[15px] font-medium text-night">
          &#8383;
        </span>
        <span className="text-[15px] font-medium text-ink">sats-stacker</span>
      </button>

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

      {/* Right-justified cluster — price chip + denomination toggle share
          the right edge. `ml-auto` lives on the cluster (not the chip or
          toggle individually) so the two stay shoulder-to-shoulder on
          desktop. On narrow viewports `flex-wrap` lets them stack while
          keeping the right alignment. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <BlockchainStatus />

        <a
          href="https://www.coingecko.com/en/coins/bitcoin"
          target="_blank"
          rel="noopener noreferrer"
          title="Open Bitcoin on CoinGecko"
          className="flex items-center gap-3 hover:opacity-80"
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

        <div
          className="flex items-center rounded-full border border-edge p-0.5"
          role="group"
          aria-label="Denomination"
          title="Flip every dollar figure on the dashboard between USD and satoshis (sats). BTC quantities convert at the live price."
        >
          <button
            type="button"
            onClick={() => setUnit("usd")}
            aria-pressed={unit === "usd"}
            className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
              unit === "usd"
                ? "bg-ink/10 text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            USD
          </button>
          <button
            type="button"
            onClick={() => setUnit("sats")}
            aria-pressed={unit === "sats"}
            className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
              unit === "sats"
                ? "bg-bitcoin/20 text-bitcoin"
                : "text-muted hover:text-ink"
            }`}
          >
            sats
          </button>
        </div>
      </div>
    </header>
  );
}

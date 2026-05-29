"use client";

import type { ViewMode } from "@/lib/types";
import { formatUsd, formatDate } from "@/lib/format";
import { useUnit } from "@/lib/unit";

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
  const { unit, setUnit } = useUnit();
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

      {/* Denomination toggle. Sits on its own line under the header strip so
          it doesn't fight the live-price chip for the right edge on mobile,
          but visually anchors next to the price chip on desktop via the
          `basis-full` + `md:ml-auto` pairing. */}
      <div
        className="ml-auto flex items-center rounded-full border border-edge p-0.5"
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
    </header>
  );
}

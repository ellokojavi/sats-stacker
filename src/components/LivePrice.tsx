"use client";

import { useEffect, useState } from "react";

const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

type Status = "loading" | "ok" | "error";

export function LivePrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch(PRICE_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        const p = data?.bitcoin?.usd;
        if (!active) return;
        if (typeof p === "number" && p > 0) {
          setPrice(p);
          setChange(
            typeof data.bitcoin.usd_24h_change === "number"
              ? data.bitcoin.usd_24h_change
              : null,
          );
          setUpdatedAt(new Date());
          setStatus("ok");
        } else {
          setStatus("error");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const usd =
    price !== null ? "$" + Math.round(price).toLocaleString("en-US") : "—";
  const changeText =
    change !== null
      ? (change >= 0 ? "+" : "") + change.toFixed(2) + "% · 24h"
      : "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-bitcoin text-[18px] font-medium text-night">
          &#8383;
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-muted">
          <span className="relative flex h-2 w-2">
            {status === "ok" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                status === "ok" ? "bg-up" : "bg-faint"
              }`}
            />
          </span>
          Bitcoin price · live
        </div>
        <div className="mt-3 font-mono text-[40px] font-medium leading-tight text-ink">
          {usd}
        </div>
        {changeText && (
          <div
            className={`mt-1 font-mono text-[13px] ${
              change !== null && change >= 0 ? "text-up" : "text-down"
            }`}
          >
            {changeText}
          </div>
        )}
        <div className="mt-5 text-[11px] text-faint">
          {status === "loading" && "Fetching live price…"}
          {status === "error" && "Couldn't reach the price feed — retrying…"}
          {status === "ok" &&
            updatedAt &&
            `Updated ${updatedAt.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })} · source: CoinGecko`}
        </div>
        <a
          href="/"
          className="mt-6 inline-block text-[12px] text-bitcoin hover:underline"
        >
          ← back to sats-stacker
        </a>
      </div>
    </main>
  );
}

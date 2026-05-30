"use client";

import { useEffect, useState } from "react";
import {
  fetchBlockchainStatus,
  type BlockchainStatus as Status,
} from "@/lib/blockchain";

/**
 * Compact header chip showing the live Bitcoin chain tip and a projected
 * date for the next halving. Sits next to the BTC price chip in the TopBar.
 *
 * Data comes from mempool.space (with blockstream.info fallback). Polls
 * every 60 s — block times are ~10 min so anything faster is wasted.
 */
export function BlockchainStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const next = await fetchBlockchainStatus(controller.signal);
        if (!cancelled) {
          setStatus(next);
          setLive(true);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const heightLabel = status
    ? "Block " + status.height.toLocaleString("en-US")
    : "Block —";

  const halvingLabel = status
    ? "halving · " +
      status.etaDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "halving · —";

  return (
    <a
      href="https://mempool.space"
      target="_blank"
      rel="noopener noreferrer"
      title={
        status
          ? `Block #${status.height.toLocaleString("en-US")} · next halving at block ${status.nextHalvingBlock.toLocaleString("en-US")} (${status.blocksRemaining.toLocaleString("en-US")} blocks away). Source: mempool.space.`
          : "Loading live blockchain status from mempool.space"
      }
      className="flex items-center gap-2 hover:opacity-80"
    >
      <span className="flex items-center gap-1.5 text-[13px] text-ink">
        <span className="relative flex h-2 w-2">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bitcoin opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              live ? "bg-bitcoin" : "bg-faint"
            }`}
          />
        </span>
        <span className="font-mono font-medium">{heightLabel}</span>
      </span>
      <span className="text-[11px] text-faint">{halvingLabel}</span>
    </a>
  );
}

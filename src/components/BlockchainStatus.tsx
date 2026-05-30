"use client";

import { useEffect, useState } from "react";
import {
  fetchBlockchainStatus,
  type BlockchainStatus as Status,
} from "@/lib/blockchain";

/**
 * Tiny isometric "block" cube — three shaded faces of bitcoin orange.
 * When the feed is live, the cube breathes via a slow opacity pulse
 * (3 s, opacity 1 → 0.7 → 1) so it reads as alive without competing
 * with the rest of the header. No aura ping, no drop-shadow — that
 * intensity belongs on the BTC-price dot, not a 14 px icon. Stale
 * feeds render a desaturated static cube.
 */
function CubeIcon({ live }: { live: boolean }) {
  return (
    <span className="relative inline-flex h-[14px] w-[14px] items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`relative h-[14px] w-[14px] ${
          live
            ? "animate-[pulse_3s_ease-in-out_infinite]"
            : "opacity-50"
        }`}
      >
        {/* Isometric cube: top face (light), left face (mid), right face (dark). */}
        <polygon
          points="12,2 22,7 12,12 2,7"
          fill={live ? "#fbb04a" : "#9aa0aa"}
        />
        <polygon
          points="2,7 12,12 12,22 2,17"
          fill={live ? "#f7931a" : "#6b7280"}
        />
        <polygon
          points="22,7 12,12 12,22 22,17"
          fill={live ? "#c47210" : "#4b5159"}
        />
        {/* Subtle inner edges so the three faces read crisply against
            dark backgrounds even at 14px. */}
        <polyline
          points="12,2 12,12 12,22"
          fill="none"
          stroke="rgba(0,0,0,0.22)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
        <polyline
          points="2,7 12,12 22,7"
          fill="none"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

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
        <CubeIcon live={live} />
        <span className="font-mono font-medium">{heightLabel}</span>
      </span>
      <span className="text-[11px] text-faint">{halvingLabel}</span>
    </a>
  );
}

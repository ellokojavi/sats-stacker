import type { Unit } from "./types";

export function formatUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export function formatUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (abs >= 1000) return "$" + Math.round(n / 1000) + "K";
  return "$" + Math.round(n);
}

export function formatPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export function formatBtc(n: number): string {
  return n.toFixed(4) + " BTC";
}

const SATS_PER_BTC = 100_000_000;

/** Format a satoshi count with thousands separators and a "sats" suffix. */
export function formatSats(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(Math.round(n)).toLocaleString("en-US") + " sats";
}

/** Compact satoshi formatter (Ksats / Msats / Bsats). */
export function formatSatsShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(1) + "B sats";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M sats";
  if (abs >= 1_000) return sign + Math.round(abs / 1_000).toLocaleString("en-US") + "K sats";
  return sign + Math.round(abs).toLocaleString("en-US") + " sats";
}

/**
 * Format a BTC quantity in sats (no "BTC" suffix). Pure BTC quantities like
 * stack size become very large sat counts; reuses the compact variant for
 * readability.
 */
export function formatBtcAsSats(btc: number): string {
  return formatSats(btc * SATS_PER_BTC);
}

/** Convert a USD amount into sats at the given BTC price ($/BTC). */
export function usdToSats(usd: number, btcPriceUsd: number): number {
  if (!btcPriceUsd || btcPriceUsd <= 0) return 0;
  return (usd / btcPriceUsd) * SATS_PER_BTC;
}

/**
 * Unit-aware dollar formatter. When `unit === "sats"`, converts the USD
 * value through `btcPriceUsd` and renders as a satoshi count. Falls back
 * to USD when no price is available.
 *
 * Use this anywhere a value is denominated in **dollars** and should
 * respect the denomination toggle (KPIs, snapshot, totals). Use plain
 * `formatUsd` only where the dollar sign is part of the meaning itself
 * — e.g. "$/BTC" axis labels on the Power Law chart.
 */
export function formatValue(
  usd: number,
  unit: Unit,
  btcPriceUsd: number,
): string {
  if (unit === "sats" && btcPriceUsd > 0) {
    return formatSats(usdToSats(usd, btcPriceUsd));
  }
  return formatUsd(usd);
}

/** Compact unit-aware variant — mirrors `formatUsdShort`. */
export function formatValueShort(
  usd: number,
  unit: Unit,
  btcPriceUsd: number,
): string {
  if (unit === "sats" && btcPriceUsd > 0) {
    return formatSatsShort(usdToSats(usd, btcPriceUsd));
  }
  return formatUsdShort(usd);
}

/**
 * Unit-aware BTC-quantity formatter. In USD mode, returns "0.1234 BTC". In
 * sats mode, returns the same quantity as a sats count. Use this for pure
 * BTC quantities (stack size, per-buy BTC) — these are unit-aware via the
 * BTC↔sats relationship, not via the live price.
 */
export function formatBtcValue(btc: number, unit: Unit): string {
  return unit === "sats" ? formatBtcAsSats(btc) : formatBtc(btc);
}

export function formatDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateShort(iso: string): string {
  return iso.slice(0, 10);
}

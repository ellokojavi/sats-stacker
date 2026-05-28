/**
 * "What if?" — counterfactual DCA strategy simulator.
 *
 * Given the user's actual buy ledger and the daily BTC price history, each
 * strategy deploys the SAME total USD across the SAME calendar window —
 * just with different timing rules. That apples-to-apples capital constraint
 * is the whole point: it answers "would another strategy have served me
 * better with the same money?" rather than "would more money have been better?"
 *
 * Strategies:
 *   • actual        — your real buys, unchanged baseline
 *   • lumpSum       — invest everything on the date of your first buy
 *   • weekly        — equal-USD buys every 7 days across your buy window
 *   • monthly       — equal-USD buys every ~30 days across your buy window
 *   • dipBuy        — deploy 1/N of total each time BTC drawn down ≥30% from
 *                     trailing 1-year high (30-day cooldown between buys)
 *   • halving       — split total evenly across BTC halvings inside your window
 *   • oracle        — buy at every monthly low — the unbeatable upper bound
 */

import type { PricePoint, Transaction } from "./types";

const DAY_MS = 86400000;

/** Approximate BTC halving dates (UTC). New halvings will need to be appended. */
const HALVING_DATES_ISO = [
  "2012-11-28",
  "2016-07-09",
  "2020-05-11",
  "2024-04-19",
] as const;

export type StrategyId =
  | "actual"
  | "lumpSum"
  | "weekly"
  | "monthly"
  | "dipBuy"
  | "halving"
  | "oracle";

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  color: string;
  /** Short explanation shown in tooltips and the scoreboard description. */
  description: string;
}

export const STRATEGIES: ReadonlyArray<StrategyMeta> = [
  {
    id: "actual",
    label: "Your actual",
    color: "#f7931a",
    description: "Your real buy ledger, untouched. The baseline.",
  },
  {
    id: "lumpSum",
    label: "Lump sum (day 1)",
    color: "#ffffff",
    description: "Invest your total USD on the date of your first actual buy.",
  },
  {
    id: "weekly",
    label: "Weekly DCA",
    color: "#16c784",
    description: "Equal-USD buy every 7 days across your buy window.",
  },
  {
    id: "monthly",
    label: "Monthly DCA",
    color: "#22c55e",
    description: "Equal-USD buy every ~30 days across your buy window.",
  },
  {
    id: "dipBuy",
    label: "Buy the dip (-30%)",
    color: "#38bdf8",
    description:
      "Deploy 1/N of total each time BTC has drawn down ≥30% from its trailing 1-year high (30-day cooldown).",
  },
  {
    id: "halving",
    label: "Buy each halving",
    color: "#a78bfa",
    description:
      "Split total evenly across BTC halvings (Nov 2012 / Jul 2016 / May 2020 / Apr 2024) that fall in your window.",
  },
  {
    id: "oracle",
    label: "Hindsight oracle",
    color: "#facc15",
    description:
      "Lump sum on the single lowest-price day in your window — the unbeatable ceiling.",
  },
];

export interface StrategyBuy {
  /** ISO date (YYYY-MM-DD) of the synthetic buy. */
  date: string;
  /** USD deployed on this date. */
  usd: number;
  /** BTC acquired (usd / price). */
  btc: number;
  /** BTC price used. */
  price: number;
}

export interface StrategyPoint {
  /** ISO date. */
  date: string;
  /** Cumulative BTC held at end of this day. */
  cumBtc: number;
  /** Cumulative USD invested at end of this day. */
  cumUsd: number;
  /** Portfolio mark-to-market value at this date's price. */
  value: number;
}

export interface StrategyResult {
  strategyId: StrategyId;
  buys: StrategyBuy[];
  series: StrategyPoint[];
  totalBtc: number;
  totalInvested: number;
  finalValue: number;
  /** Capital-weighted average buy price. */
  avgBuyPrice: number;
  /** Compound annual growth rate over the [firstBuy, today] window, or null if span < 30 days. */
  cagr: number | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD-ish string into UTC ms. Tolerates ISO with time component. */
function dateMs(s: string): number {
  return new Date(s.slice(0, 10) + "T00:00:00Z").getTime();
}

/** Add `days` days to a YYYY-MM-DD string and return YYYY-MM-DD. */
function shiftDays(date: string, days: number): string {
  const t = dateMs(date) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Build a {dateStr → price} lookup with linear-in-log-price interpolation for
 * dates that fall between known points. Daily price data has no gaps in our
 * dataset, but the buy-the-dip and oracle strategies generate dates that may
 * land between samples (e.g. shifted-days arithmetic). Interpolation keeps
 * results stable.
 */
function buildPriceLookup(prices: PricePoint[]): (date: string) => number {
  if (prices.length === 0) return () => 0;
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  for (const p of sorted) byDate.set(p.date.slice(0, 10), p.price);

  return (date: string) => {
    const d = date.slice(0, 10);
    const exact = byDate.get(d);
    if (exact !== undefined) return exact;
    // Clamp to range edges if outside.
    if (d <= sorted[0].date) return sorted[0].price;
    if (d >= sorted[sorted.length - 1].date) return sorted[sorted.length - 1].price;
    // Binary search would be faster, but the only callers hit this rarely.
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].date <= d) lo = sorted[i];
      if (sorted[i].date >= d) {
        hi = sorted[i];
        break;
      }
    }
    if (lo.price <= 0 || hi.price <= 0) return lo.price || hi.price;
    const t0 = dateMs(lo.date);
    const t1 = dateMs(hi.date);
    const t = dateMs(d);
    const span = t1 - t0;
    if (span <= 0) return lo.price;
    const frac = (t - t0) / span;
    return Math.exp(Math.log(lo.price) + frac * (Math.log(hi.price) - Math.log(lo.price)));
  };
}

/**
 * Compute the daily portfolio-value series for a strategy's buy schedule.
 * Walks the price history once, accumulating cumulative BTC + USD as we cross
 * each buy date. Trims the head so the series starts at the first buy.
 */
function buildSeries(
  buys: StrategyBuy[],
  prices: PricePoint[],
  currentPrice: number,
): StrategyPoint[] {
  if (buys.length === 0 || prices.length === 0) return [];
  const sortedBuys = [...buys].sort((a, b) => a.date.localeCompare(b.date));
  const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const firstBuyDay = sortedBuys[0].date.slice(0, 10);

  let buyIdx = 0;
  let cumBtc = 0;
  let cumUsd = 0;
  const out: StrategyPoint[] = [];
  for (const p of sortedPrices) {
    while (buyIdx < sortedBuys.length && sortedBuys[buyIdx].date.slice(0, 10) <= p.date) {
      cumBtc += sortedBuys[buyIdx].btc;
      cumUsd += sortedBuys[buyIdx].usd;
      buyIdx += 1;
    }
    if (p.date >= firstBuyDay) {
      out.push({ date: p.date, cumBtc, cumUsd, value: cumBtc * p.price });
    }
  }

  // Restate the last point at the live price so the chart's right edge agrees
  // with the snapshot KPIs (same trick as computeHoldingsSeries does today).
  if (currentPrice > 0 && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, value: last.cumBtc * currentPrice };
  }
  return out;
}

/** CAGR over the window from `startDate` to the latest data point. */
function computeCagr(
  startDate: string,
  finalValue: number,
  totalInvested: number,
  asOf: string,
): number | null {
  const startMs = dateMs(startDate);
  const endMs = dateMs(asOf);
  const days = (endMs - startMs) / DAY_MS;
  if (days < 30 || totalInvested <= 0 || finalValue <= 0) return null;
  const years = days / 365.25;
  return (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;
}

// ─── strategy generators ─────────────────────────────────────────────────────

/** Your actual buys, just stamped into the StrategyBuy shape. */
function generateActual(txns: Transaction[]): StrategyBuy[] {
  return txns
    .filter((t) => t.usd > 0 && t.btc > 0)
    .map((t) => ({
      date: t.date.slice(0, 10),
      usd: t.usd,
      btc: t.btc,
      price: t.usd / t.btc,
    }));
}

function generateLumpSum(
  totalUsd: number,
  firstDate: string,
  priceAt: (d: string) => number,
): StrategyBuy[] {
  const price = priceAt(firstDate);
  if (price <= 0) return [];
  return [{ date: firstDate, usd: totalUsd, btc: totalUsd / price, price }];
}

function generateCadenceDCA(
  totalUsd: number,
  firstDate: string,
  lastDate: string,
  stepDays: number,
  priceAt: (d: string) => number,
): StrategyBuy[] {
  if (totalUsd <= 0) return [];
  const dates: string[] = [];
  let cursor = firstDate;
  while (cursor <= lastDate) {
    dates.push(cursor);
    cursor = shiftDays(cursor, stepDays);
  }
  if (dates.length === 0) dates.push(firstDate);
  const perBuy = totalUsd / dates.length;
  return dates.map((d) => {
    const price = priceAt(d);
    return { date: d, usd: perBuy, btc: price > 0 ? perBuy / price : 0, price };
  });
}

/**
 * Buy-the-dip: pre-scan the window for days where price ≤ 0.7 × trailing
 * 1-year max, enforce a 30-day cooldown so a single drawdown doesn't trigger
 * 50 consecutive buys. Then deploy `total / N` at each event.
 *
 * Falls back to a lump-sum on day 1 if no dip events fire — without that,
 * "buy the dip" would land at $0 invested for buy windows that never saw a
 * 30% drawdown, which is misleading.
 */
function generateDipBuy(
  totalUsd: number,
  firstDate: string,
  lastDate: string,
  prices: PricePoint[],
  priceAt: (d: string) => number,
): StrategyBuy[] {
  const COOLDOWN_DAYS = 30;
  const DIP_THRESHOLD = 0.7; // ≥30% drawdown
  const window = prices.filter(
    (p) => p.date >= firstDate && p.date <= lastDate && p.price > 0,
  );
  if (window.length === 0) return generateLumpSum(totalUsd, firstDate, priceAt);

  const events: string[] = [];
  let lastEventMs = -Infinity;
  for (let i = 0; i < window.length; i++) {
    const p = window[i];
    // Trailing 1-year high (or as much as we have up to this point).
    const startIdx = Math.max(0, i - 365);
    let high = 0;
    for (let j = startIdx; j <= i; j++) if (window[j].price > high) high = window[j].price;
    if (high <= 0) continue;
    if (p.price <= high * DIP_THRESHOLD) {
      const ms = dateMs(p.date);
      if (ms - lastEventMs >= COOLDOWN_DAYS * DAY_MS) {
        events.push(p.date);
        lastEventMs = ms;
      }
    }
  }

  if (events.length === 0) return generateLumpSum(totalUsd, firstDate, priceAt);

  const perBuy = totalUsd / events.length;
  return events.map((d) => {
    const price = priceAt(d);
    return { date: d, usd: perBuy, btc: price > 0 ? perBuy / price : 0, price };
  });
}

function generateHalving(
  totalUsd: number,
  firstDate: string,
  lastDate: string,
  priceAt: (d: string) => number,
): StrategyBuy[] {
  const inWindow = HALVING_DATES_ISO.filter(
    (d) => d >= firstDate && d <= lastDate,
  );
  if (inWindow.length === 0) return generateLumpSum(totalUsd, firstDate, priceAt);
  const perBuy = totalUsd / inWindow.length;
  return inWindow.map((d) => {
    const price = priceAt(d);
    return { date: d, usd: perBuy, btc: price > 0 ? perBuy / price : 0, price };
  });
}

/**
 * Hindsight oracle: lump-sum on the single lowest-price day inside the user's
 * window. Genuinely the unbeatable upper bound — no combination of buys can
 * yield more BTC for the same dollars than putting them all at the absolute
 * bottom. Useful as the "ceiling" against which every realistic strategy is
 * graded.
 */
function generateOracle(
  totalUsd: number,
  firstDate: string,
  lastDate: string,
  prices: PricePoint[],
): StrategyBuy[] {
  let best: { date: string; price: number } | null = null;
  for (const p of prices) {
    if (p.date < firstDate || p.date > lastDate || p.price <= 0) continue;
    if (best === null || p.price < best.price) {
      best = { date: p.date, price: p.price };
    }
  }
  if (best === null) return [];
  return [
    {
      date: best.date,
      usd: totalUsd,
      btc: totalUsd / best.price,
      price: best.price,
    },
  ];
}

// ─── public API ──────────────────────────────────────────────────────────────

export interface SimulateOptions {
  txns: Transaction[];
  prices: PricePoint[];
  currentPrice: number;
  asOf: string;
}

/**
 * Run every strategy against the same capital + window and return a result
 * per strategy. The `actual` baseline is derived from `txns` directly; the
 * others use the actual total USD as their budget.
 */
export function simulateAllStrategies(
  opts: SimulateOptions,
): StrategyResult[] {
  const { txns, prices, currentPrice, asOf } = opts;
  const validTxns = txns.filter((t) => t.usd > 0 && t.btc > 0);
  if (validTxns.length === 0 || prices.length === 0) return [];

  const sortedTxns = [...validTxns].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sortedTxns[0].date.slice(0, 10);
  const lastDate = sortedTxns[sortedTxns.length - 1].date.slice(0, 10);
  const totalUsd = sortedTxns.reduce((s, t) => s + t.usd, 0);
  const priceAt = buildPriceLookup(prices);

  const buysByStrategy: Record<StrategyId, StrategyBuy[]> = {
    actual: generateActual(validTxns),
    lumpSum: generateLumpSum(totalUsd, firstDate, priceAt),
    weekly: generateCadenceDCA(totalUsd, firstDate, lastDate, 7, priceAt),
    monthly: generateCadenceDCA(totalUsd, firstDate, lastDate, 30, priceAt),
    dipBuy: generateDipBuy(totalUsd, firstDate, lastDate, prices, priceAt),
    halving: generateHalving(totalUsd, firstDate, lastDate, priceAt),
    oracle: generateOracle(totalUsd, firstDate, lastDate, prices),
  };

  return STRATEGIES.map((meta) => {
    const buys = buysByStrategy[meta.id];
    const series = buildSeries(buys, prices, currentPrice);
    const totalBtc = buys.reduce((s, b) => s + b.btc, 0);
    const totalInvested = buys.reduce((s, b) => s + b.usd, 0);
    const finalValue = totalBtc * currentPrice;
    const avgBuyPrice = totalBtc > 0 ? totalInvested / totalBtc : 0;
    const cagr = computeCagr(firstDate, finalValue, totalInvested, asOf);
    return {
      strategyId: meta.id,
      buys,
      series,
      totalBtc,
      totalInvested,
      finalValue,
      avgBuyPrice,
      cagr,
    };
  });
}

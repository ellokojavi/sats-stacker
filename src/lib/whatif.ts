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
 *   • custom        — user-defined cadence + optional drawdown-triggered bonus.
 *                     Same capital-constraint rules as every other strategy.
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
  | "oracle"
  | "custom";

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  color: string;
  /** Short explanation shown in tooltips and the scoreboard description. */
  description: string;
}

/** The reserved color for the user-defined custom strategy. */
export const CUSTOM_STRATEGY_COLOR = "#fb7185";

/**
 * Parameters for the user-defined custom strategy.
 *
 *   • Base cadence (optional) — deploy a weighted buy every `cadenceDays`
 *     days from the user's Day 1.
 *   • Drawdown trigger (optional) — additionally deploy a weighted buy each
 *     time BTC has drawn down ≥ `dipPctThreshold` from its trailing
 *     `dipLookbackDays`-day high, with a cooldown between triggers.
 *
 * Weights are relative — the simulator scales every event's USD so the
 * sum matches the user's actual total invested. That preserves the
 * apples-to-apples constraint that every other strategy honors.
 */
export interface CustomStrategyParams {
  /** Whether the user has enabled the base cadence leg. */
  cadenceEnabled: boolean;
  /** Days between cadence buys (≥ 1). 7 = weekly, 30 = monthly, 1 = daily. */
  cadenceDays: number;
  /** Relative weight per cadence buy. Scales against the dip weight. */
  cadenceWeight: number;
  /** Whether the user has enabled the drawdown-triggered bonus leg. */
  dipEnabled: boolean;
  /**
   * Drawdown threshold (e.g. 0.30 for "fires when price ≤ 70 % of trailing
   * high"). Stored as a fraction in [0, 1).
   */
  dipPctThreshold: number;
  /** Lookback for the trailing high, in days (e.g. 365 for trailing 1-year). */
  dipLookbackDays: number;
  /** Cooldown between consecutive dip triggers, in days. */
  dipCooldownDays: number;
  /** Relative weight per dip-triggered buy. */
  dipWeight: number;
}

/** Sensible defaults — weekly cadence + buy-the-dip bonus at 30 % drawdown. */
export const DEFAULT_CUSTOM_PARAMS: CustomStrategyParams = {
  cadenceEnabled: true,
  cadenceDays: 7,
  cadenceWeight: 1,
  dipEnabled: true,
  dipPctThreshold: 0.3,
  dipLookbackDays: 365,
  dipCooldownDays: 30,
  dipWeight: 3,
};

/**
 * Build a human-readable label + description for the user's current custom
 * config. Surfaced in the chart legend, the scoreboard, and the info popover
 * so the line is self-explanatory without a separate cheat sheet.
 */
export function describeCustomStrategy(p: CustomStrategyParams): {
  label: string;
  description: string;
} {
  const parts: string[] = [];
  if (p.cadenceEnabled && p.cadenceDays > 0) {
    if (p.cadenceDays === 1) parts.push("Daily");
    else if (p.cadenceDays === 7) parts.push("Weekly");
    else if (p.cadenceDays === 30) parts.push("Monthly");
    else parts.push(`Every ${p.cadenceDays}d`);
  }
  if (p.dipEnabled && p.dipPctThreshold > 0) {
    const pct = Math.round(p.dipPctThreshold * 100);
    parts.push(`+${pct}% dip`);
  }
  const label =
    parts.length === 0 ? "Custom strategy" : `Custom · ${parts.join(" ")}`;

  const desc: string[] = [];
  if (p.cadenceEnabled && p.cadenceDays > 0) {
    desc.push(
      `weighted buy every ${p.cadenceDays} ${p.cadenceDays === 1 ? "day" : "days"}`,
    );
  }
  if (p.dipEnabled && p.dipPctThreshold > 0) {
    desc.push(
      `bonus buy (weight ×${p.dipWeight}) on drawdowns ≥ ${Math.round(p.dipPctThreshold * 100)}% from the trailing ${p.dipLookbackDays}-day high (${p.dipCooldownDays}-day cooldown)`,
    );
  }
  const description =
    desc.length === 0
      ? "Configure cadence and/or a drawdown trigger to define your own strategy."
      : `Your own rule — ${desc.join("; ")}. Total spend matches your actual total.`;

  return { label, description };
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
  /** Days since the user's Day 1 (= first actual buy). Day 1 itself = 0. */
  day: number;
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
 *
 * `windowStart` is the user's Day 1 — the date of their first actual buy.
 * All strategies share this anchor so their lines start on the same X point;
 * "lazy" strategies (halving, dipBuy) that don't fire until later sit at
 * cumBtc=0 / value=0 from windowStart until their first synthetic buy lands.
 * Without this shared anchor, halving and dipBuy would appear to start later
 * than the others and make the chart hard to read.
 *
 * Each point also carries `day` = days since windowStart so the chart can
 * optionally render with a "Day N" X-axis instead of absolute dates.
 */
function buildSeries(
  buys: StrategyBuy[],
  prices: PricePoint[],
  currentPrice: number,
  windowStart: string,
): StrategyPoint[] {
  if (prices.length === 0) return [];
  const sortedBuys = [...buys].sort((a, b) => a.date.localeCompare(b.date));
  const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const startMs = dateMs(windowStart);

  let buyIdx = 0;
  let cumBtc = 0;
  let cumUsd = 0;
  const out: StrategyPoint[] = [];
  for (const p of sortedPrices) {
    while (
      buyIdx < sortedBuys.length &&
      sortedBuys[buyIdx].date.slice(0, 10) <= p.date
    ) {
      cumBtc += sortedBuys[buyIdx].btc;
      cumUsd += sortedBuys[buyIdx].usd;
      buyIdx += 1;
    }
    if (p.date >= windowStart) {
      const day = Math.max(0, Math.round((dateMs(p.date) - startMs) / DAY_MS));
      out.push({ date: p.date, day, cumBtc, cumUsd, value: cumBtc * p.price });
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

/**
 * User-defined custom strategy.
 *
 * The user contributes two ingredient rules and a relative weight for each:
 *
 *   • Base cadence  — a weighted event every `cadenceDays` from Day 1.
 *   • Dip trigger   — a weighted event each time price ≤ (1 − threshold) ×
 *     trailing `dipLookbackDays` high, with a cooldown between triggers.
 *
 * We compose the two streams, merge events that land on the same day (weights
 * add), then scale every event's USD so the sum equals `totalUsd`. That
 * scaling step is what keeps the strategy apples-to-apples with every other
 * one in the simulator. Without it, the user could effectively cheat by
 * increasing weights and "investing more."
 *
 * Falls back to a lump-sum on day 1 when both legs would generate zero
 * events — without that fallback the strategy would silently invest $0 and
 * read like a chart bug.
 */
function generateCustom(
  totalUsd: number,
  firstDate: string,
  lastDate: string,
  prices: PricePoint[],
  priceAt: (d: string) => number,
  params: CustomStrategyParams,
): StrategyBuy[] {
  const events: Array<{ date: string; weight: number }> = [];

  // ── Cadence leg ────────────────────────────────────────────────────────
  if (params.cadenceEnabled && params.cadenceDays > 0 && params.cadenceWeight > 0) {
    let cursor = firstDate;
    while (cursor <= lastDate) {
      events.push({ date: cursor, weight: params.cadenceWeight });
      cursor = shiftDays(cursor, params.cadenceDays);
    }
  }

  // ── Dip leg ────────────────────────────────────────────────────────────
  if (
    params.dipEnabled &&
    params.dipPctThreshold > 0 &&
    params.dipPctThreshold < 1 &&
    params.dipWeight > 0
  ) {
    const window = prices.filter(
      (p) => p.date >= firstDate && p.date <= lastDate && p.price > 0,
    );
    const threshold = 1 - params.dipPctThreshold;
    const lookback = Math.max(1, Math.floor(params.dipLookbackDays));
    const cooldownMs = Math.max(0, params.dipCooldownDays) * DAY_MS;
    let lastEventMs = -Infinity;
    for (let i = 0; i < window.length; i++) {
      const p = window[i];
      const startIdx = Math.max(0, i - lookback);
      let high = 0;
      for (let j = startIdx; j <= i; j++) {
        if (window[j].price > high) high = window[j].price;
      }
      if (high <= 0) continue;
      if (p.price <= high * threshold) {
        const ms = dateMs(p.date);
        if (ms - lastEventMs >= cooldownMs) {
          events.push({ date: p.date.slice(0, 10), weight: params.dipWeight });
          lastEventMs = ms;
        }
      }
    }
  }

  if (events.length === 0) {
    return generateLumpSum(totalUsd, firstDate, priceAt);
  }

  // Merge events that fall on the same date so we don't emit two buys per day
  // (which is messy in the buy list and double-counts in tooltips).
  const merged = new Map<string, number>();
  for (const e of events) {
    merged.set(e.date, (merged.get(e.date) ?? 0) + e.weight);
  }
  const sumWeights = [...merged.values()].reduce((s, w) => s + w, 0);
  if (sumWeights <= 0) return generateLumpSum(totalUsd, firstDate, priceAt);

  const out: StrategyBuy[] = [];
  for (const [date, weight] of merged) {
    const usd = (totalUsd * weight) / sumWeights;
    const price = priceAt(date);
    out.push({
      date,
      usd,
      btc: price > 0 ? usd / price : 0,
      price,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ─── public API ──────────────────────────────────────────────────────────────

export interface SimulateOptions {
  txns: Transaction[];
  prices: PricePoint[];
  currentPrice: number;
  asOf: string;
  /**
   * Optional user-defined strategy. When omitted, the simulator returns the
   * seven built-in strategies only. When present, an eighth result with
   * `strategyId === "custom"` is appended.
   */
  custom?: CustomStrategyParams | null;
}

/**
 * Run every strategy against the same capital + window and return a result
 * per strategy. The `actual` baseline is derived from `txns` directly; the
 * others use the actual total USD as their budget. If `custom` is provided,
 * the user-defined strategy is appended to the result list using the same
 * scaling rules so it stays apples-to-apples.
 */
export function simulateAllStrategies(
  opts: SimulateOptions,
): StrategyResult[] {
  const { txns, prices, currentPrice, asOf, custom } = opts;
  const validTxns = txns.filter((t) => t.usd > 0 && t.btc > 0);
  if (validTxns.length === 0 || prices.length === 0) return [];

  const sortedTxns = [...validTxns].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sortedTxns[0].date.slice(0, 10);
  const lastDate = sortedTxns[sortedTxns.length - 1].date.slice(0, 10);
  const totalUsd = sortedTxns.reduce((s, t) => s + t.usd, 0);
  const priceAt = buildPriceLookup(prices);

  const buysByStrategy: Partial<Record<StrategyId, StrategyBuy[]>> = {
    actual: generateActual(validTxns),
    lumpSum: generateLumpSum(totalUsd, firstDate, priceAt),
    weekly: generateCadenceDCA(totalUsd, firstDate, lastDate, 7, priceAt),
    monthly: generateCadenceDCA(totalUsd, firstDate, lastDate, 30, priceAt),
    dipBuy: generateDipBuy(totalUsd, firstDate, lastDate, prices, priceAt),
    halving: generateHalving(totalUsd, firstDate, lastDate, priceAt),
    oracle: generateOracle(totalUsd, firstDate, lastDate, prices),
  };
  if (custom) {
    buysByStrategy.custom = generateCustom(
      totalUsd,
      firstDate,
      lastDate,
      prices,
      priceAt,
      custom,
    );
  }

  const finalize = (meta: StrategyMeta): StrategyResult => {
    const buys = buysByStrategy[meta.id] ?? [];
    const series = buildSeries(buys, prices, currentPrice, firstDate);
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
  };

  const results: StrategyResult[] = STRATEGIES.map(finalize);
  if (custom) {
    const { label, description } = describeCustomStrategy(custom);
    results.push(
      finalize({
        id: "custom",
        label,
        description,
        color: CUSTOM_STRATEGY_COLOR,
      }),
    );
  }
  return results;
}

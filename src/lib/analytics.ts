import type {
  Transaction,
  Lot,
  YearRow,
  CycleRow,
  TierRow,
  CagrResult,
  ExchangeRow,
  PricePoint,
  DataQualitySummary,
  AnomalyRow,
} from "./types";

const DAY_MS = 86400000;

function toTime(date: string): number {
  return new Date(date.replace(" ", "T") + "Z").getTime();
}

/** Value every buy as an individual lot against the current price. */
export function computeLots(
  txns: Transaction[],
  currentPrice: number,
  asOf: string,
): Lot[] {
  const asOfMs = new Date(asOf.slice(0, 10) + "T00:00:00Z").getTime();
  return txns.map((t) => {
    const buyPrice = t.btc > 0 ? t.usd / t.btc : 0;
    const currentValue = t.btc * currentPrice;
    const profit = currentValue - t.usd;
    const roi = t.usd > 0 ? profit / t.usd : 0;
    const daysHeld = Math.max(0, (asOfMs - toTime(t.date)) / DAY_MS);
    const yearsHeld = daysHeld / 365.25;
    const annualizedRoi =
      daysHeld > 30 && t.usd > 0 && yearsHeld > 0
        ? Math.pow(currentValue / t.usd, 1 / yearsHeld) - 1
        : null;
    return {
      id: t.id,
      date: t.date,
      source: t.source,
      btc: t.btc,
      usd: t.usd,
      buyPrice,
      currentValue,
      profit,
      roi,
      daysHeld,
      annualizedRoi,
    };
  });
}

/**
 * Compute an annualized return (CAGR) given total invested, current value, and
 * a dollar-weighted average days held. Returns null for windows too short to
 * annualize meaningfully — within the first 30 days the (1/yearsHeld) exponent
 * blows up small differences into nonsense like "+12,000% / yr".
 */
function annualize(
  invested: number,
  currentValue: number,
  avgDaysHeld: number,
): number | null {
  if (avgDaysHeld < 30 || invested <= 0 || currentValue <= 0) return null;
  const years = avgDaysHeld / 365.25;
  if (years <= 0) return null;
  return (Math.pow(currentValue / invested, 1 / years) - 1) * 100;
}

/** Aggregate buys by calendar year, with a trailing "Total" row. */
export function computeYearly(
  txns: Transaction[],
  currentPrice: number,
  asOf: string,
): YearRow[] {
  const asOfMs = new Date(asOf.slice(0, 10) + "T00:00:00Z").getTime();

  // `weightedDays` accumulates Σ(usd_i · daysHeld_i) per year so we can derive
  // a capital-weighted average holding period — the right denominator for a
  // CAGR over a bucket of buys spread across the year.
  const byYear = new Map<
    string,
    { btc: number; usd: number; weightedDays: number }
  >();
  for (const t of txns) {
    const year = t.date.slice(0, 4);
    const entry = byYear.get(year) ?? { btc: 0, usd: 0, weightedDays: 0 };
    entry.btc += t.btc;
    entry.usd += t.usd;
    const days = Math.max(0, (asOfMs - toTime(t.date)) / DAY_MS);
    entry.weightedDays += t.usd * days;
    byYear.set(year, entry);
  }

  const rows: YearRow[] = [...byYear.keys()].sort().map((year) => {
    const { btc, usd, weightedDays } = byYear.get(year)!;
    const currentValue = btc * currentPrice;
    const avgDays = usd > 0 ? weightedDays / usd : 0;
    return {
      year,
      btc,
      usd,
      avgBuyPrice: btc > 0 ? usd / btc : 0,
      currentValue,
      profit: currentValue - usd,
      roi: usd > 0 ? ((currentValue - usd) / usd) * 100 : 0,
      annualizedRoi: annualize(usd, currentValue, avgDays),
    };
  });

  const totalBtc = rows.reduce((s, r) => s + r.btc, 0);
  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
  const totalWeightedDays = [...byYear.values()].reduce(
    (s, e) => s + e.weightedDays,
    0,
  );
  const totalValue = totalBtc * currentPrice;
  const totalAvgDays = totalUsd > 0 ? totalWeightedDays / totalUsd : 0;
  rows.push({
    year: "Total",
    btc: totalBtc,
    usd: totalUsd,
    avgBuyPrice: totalBtc > 0 ? totalUsd / totalBtc : 0,
    currentValue: totalValue,
    profit: totalValue - totalUsd,
    roi: totalUsd > 0 ? ((totalValue - totalUsd) / totalUsd) * 100 : 0,
    annualizedRoi: annualize(totalUsd, totalValue, totalAvgDays),
  });
  return rows;
}

/**
 * Bitcoin halving epochs — the cycle-defining events of the network.
 * Each epoch starts at a halving block and ends at the next.
 *
 *   • Epoch 1 — genesis through halving #1 (block 210,000, 2012-11-28)
 *   • Epoch 2 — halving #1 through halving #2 (block 420,000, 2016-07-09)
 *   • Epoch 3 — halving #2 through halving #3 (block 630,000, 2020-05-11)
 *   • Epoch 4 — halving #3 through halving #4 (block 840,000, 2024-04-19)
 *   • Epoch 5 — halving #4 onward (next halving projected ~2028-04)
 *
 * Endpoints are taken from on-chain block timestamps (truncated to the
 * UTC date) so the bucketing is reproducible without an external feed.
 *
 * `endDate` is exclusive — a buy on a halving day belongs to the new
 * epoch that begins that day.
 */
const HALVING_EPOCHS: { label: string; startDate: string; endDate: string }[] =
  [
    { label: "Epoch 1 (2009–2012)", startDate: "2009-01-03", endDate: "2012-11-28" },
    { label: "Epoch 2 (2012–2016)", startDate: "2012-11-28", endDate: "2016-07-09" },
    { label: "Epoch 3 (2016–2020)", startDate: "2016-07-09", endDate: "2020-05-11" },
    { label: "Epoch 4 (2020–2024)", startDate: "2020-05-11", endDate: "2024-04-19" },
    { label: "Epoch 5 (2024–2028)", startDate: "2024-04-19", endDate: "2028-04-01" },
  ];

/**
 * Aggregate buys by halving epoch. Returns one row per epoch that has any
 * buys, in chronological order, with a trailing "Total" row.
 *
 * Epochs with zero buys are dropped so the table doesn't pad with empty
 * rows for cycles the user wasn't around for. Carries the same
 * dollar-weighted CAGR as `computeYearly`.
 */
export function computeHalvingCohorts(
  txns: Transaction[],
  currentPrice: number,
  asOf: string,
): CycleRow[] {
  const asOfMs = new Date(asOf.slice(0, 10) + "T00:00:00Z").getTime();

  const buckets = HALVING_EPOCHS.map((e) => ({
    ...e,
    btc: 0,
    usd: 0,
    weightedDays: 0,
  }));

  for (const t of txns) {
    const day = t.date.slice(0, 10);
    const bucket = buckets.find(
      (b) => day >= b.startDate && day < b.endDate,
    );
    if (!bucket) continue; // Falls outside the known epochs (shouldn't happen).
    bucket.btc += t.btc;
    bucket.usd += t.usd;
    const days = Math.max(0, (asOfMs - toTime(t.date)) / DAY_MS);
    bucket.weightedDays += t.usd * days;
  }

  const rows: CycleRow[] = buckets
    .filter((b) => b.usd > 0 || b.btc > 0)
    .map((b) => {
      const currentValue = b.btc * currentPrice;
      const avgDays = b.usd > 0 ? b.weightedDays / b.usd : 0;
      return {
        label: b.label,
        startDate: b.startDate,
        endDate: b.endDate,
        btc: b.btc,
        usd: b.usd,
        avgBuyPrice: b.btc > 0 ? b.usd / b.btc : 0,
        currentValue,
        profit: currentValue - b.usd,
        roi: b.usd > 0 ? ((currentValue - b.usd) / b.usd) * 100 : 0,
        annualizedRoi: annualize(b.usd, currentValue, avgDays),
      };
    });

  const totalBtc = rows.reduce((s, r) => s + r.btc, 0);
  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
  const totalWeightedDays = buckets.reduce((s, b) => s + b.weightedDays, 0);
  const totalValue = totalBtc * currentPrice;
  const totalAvgDays = totalUsd > 0 ? totalWeightedDays / totalUsd : 0;
  rows.push({
    label: "Total",
    startDate: null,
    endDate: null,
    btc: totalBtc,
    usd: totalUsd,
    avgBuyPrice: totalBtc > 0 ? totalUsd / totalBtc : 0,
    currentValue: totalValue,
    profit: totalValue - totalUsd,
    roi: totalUsd > 0 ? ((totalValue - totalUsd) / totalUsd) * 100 : 0,
    annualizedRoi: annualize(totalUsd, totalValue, totalAvgDays),
  });
  return rows;
}

const ROI_TIERS = [
  { label: "Heavy loss", min: -Infinity, max: -0.5 },
  { label: "Loss", min: -0.5, max: 0 },
  { label: "Profit", min: 0, max: 1.0 },
  { label: "Multi-bagger", min: 1.0, max: 3.0 },
  { label: "Moonbag", min: 3.0, max: Infinity },
];

/** Bucket lots by total ROI and report the share of capital in each tier. */
export function computeProfitability(lots: Lot[]): TierRow[] {
  const totalCapital = lots.reduce((s, l) => s + l.usd, 0);
  return ROI_TIERS.map((tier) => {
    const inTier = lots.filter((l) => l.roi >= tier.min && l.roi < tier.max);
    const invested = inTier.reduce((s, l) => s + l.usd, 0);
    return {
      label: tier.label,
      count: inTier.length,
      invested,
      pctOfCapital: totalCapital > 0 ? (invested / totalCapital) * 100 : 0,
    };
  });
}

const CAGR_TIERS = [
  { label: "Negative", min: -Infinity, max: 0 },
  { label: "Slow (0-20%)", min: 0, max: 0.2 },
  { label: "Healthy (20-50%)", min: 0.2, max: 0.5 },
  { label: "Fast (50-100%)", min: 0.5, max: 1.0 },
  { label: "Rocket (>100%)", min: 1.0, max: Infinity },
];

/** Annualized-ROI (CAGR) tiers plus a capital-weighted CAGR vs. benchmarks. */
export function computeCagr(lots: Lot[]): CagrResult {
  const valid = lots.filter((l) => l.annualizedRoi != null);
  const totalCapital = valid.reduce((s, l) => s + l.usd, 0);

  const tiers: TierRow[] = CAGR_TIERS.map((tier) => {
    const inTier = valid.filter((l) => {
      const cagr = l.annualizedRoi as number;
      return cagr >= tier.min && cagr < tier.max;
    });
    const invested = inTier.reduce((s, l) => s + l.usd, 0);
    return {
      label: tier.label,
      count: inTier.length,
      invested,
      pctOfCapital: totalCapital > 0 ? (invested / totalCapital) * 100 : 0,
    };
  });

  const weightedCagr =
    totalCapital > 0
      ? valid.reduce((s, l) => s + (l.annualizedRoi as number) * l.usd, 0) /
        totalCapital
      : 0;

  return { tiers, weightedCagr, sp500: 0.105, mag7: 0.3 };
}

/**
 * Cross-check every transaction's implied $/BTC against the bundled price
 * history for that day. Flags anything whose buy-price diverges from the
 * market by more than `pctThreshold` (default 5%).
 *
 * The point isn't to police the user's trades — exchanges legitimately
 * charge premiums or vary intraday — but to *prove the ETL is doing work
 * beyond shape-shifting CSVs.* A row that diverges 20% almost always
 * means a fee got rolled into the principal column or a normalizer
 * mis-mapped a field.
 *
 * Tolerates a missing price point (gap days in the weekly bundled series)
 * by skipping that row — counted as `uncheckedCount` rather than flagged.
 */
export function computeDataQuality(
  txns: Transaction[],
  prices: PricePoint[],
  pctThreshold = 0.05,
  topN = 5,
): DataQualitySummary {
  // Build a date→price index once. The bundled series is weekly, so we
  // index on yyyy-mm-dd and look up the nearest point at or before each
  // transaction's date (closing-price behavior — what the buy could have
  // executed at).
  const sortedPrices = [...prices].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const priceDays = sortedPrices.map((p) => p.date.slice(0, 10));

  function priceForDate(iso: string): number | null {
    if (sortedPrices.length === 0) return null;
    const day = iso.slice(0, 10);
    // Bisect: find the largest price-day <= day.
    let lo = 0;
    let hi = priceDays.length - 1;
    if (day < priceDays[0]) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (priceDays[mid] <= day) lo = mid;
      else hi = mid - 1;
    }
    return sortedPrices[lo].price;
  }

  const anomalies: AnomalyRow[] = [];
  let checkedCount = 0;
  let uncheckedCount = 0;

  for (const t of txns) {
    // Skip rows we can't price-check.
    if (t.btc <= 0 || t.usd <= 0) {
      uncheckedCount += 1;
      continue;
    }
    const marketPrice = priceForDate(t.date);
    if (marketPrice == null || marketPrice <= 0) {
      uncheckedCount += 1;
      continue;
    }
    const impliedPrice = t.usd / t.btc;
    const divergence = (impliedPrice - marketPrice) / marketPrice;
    checkedCount += 1;
    if (Math.abs(divergence) > pctThreshold) {
      anomalies.push({
        id: t.id,
        date: t.date,
        source: t.source,
        btc: t.btc,
        usd: t.usd,
        impliedPrice,
        marketPrice,
        divergence,
      });
    }
  }

  anomalies.sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence));

  return {
    anomalyCount: anomalies.length,
    anomalyPctThreshold: pctThreshold,
    checkedCount,
    uncheckedCount,
    anomalies: anomalies.slice(0, topN),
  };
}

/** Aggregate the ledger by exchange. */
export function computeExchangeBreakdown(
  txns: Transaction[],
  currentPrice: number,
): ExchangeRow[] {
  const byExchange = new Map<string, { count: number; btc: number; usd: number }>();
  for (const t of txns) {
    const entry = byExchange.get(t.source) ?? { count: 0, btc: 0, usd: 0 };
    entry.count += 1;
    entry.btc += t.btc;
    entry.usd += t.usd;
    byExchange.set(t.source, entry);
  }

  const rows: ExchangeRow[] = [...byExchange.entries()].map(([exchange, e]) => {
    const currentValue = e.btc * currentPrice;
    return {
      exchange,
      count: e.count,
      btc: e.btc,
      invested: e.usd,
      currentValue,
      profit: currentValue - e.usd,
      roi: e.usd > 0 ? ((currentValue - e.usd) / e.usd) * 100 : 0,
      avgCost: e.btc > 0 ? e.usd / e.btc : 0,
    };
  });
  rows.sort((a, b) => b.invested - a.invested);
  return rows;
}

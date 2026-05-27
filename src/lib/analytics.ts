import type {
  Transaction,
  Lot,
  YearRow,
  TierRow,
  CagrResult,
  ExchangeRow,
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

import type { Lot } from "./types";

/**
 * Cost-basis tax engine. Given the portfolio's buy lots, this matches a
 * hypothetical sale against those lots under FIFO, LIFO or HIFO accounting
 * and reports the proceeds, cost basis, capital gain, and the split between
 * short-term and long-term gains.
 *
 * Holding periods assume US-style rules: a lot held more than one year is
 * long-term. This is informational only — not tax advice.
 */

export type CostBasisMethod = "FIFO" | "LIFO" | "HIFO";

const LONG_TERM_DAYS = 365;

export interface HoldingSummary {
  totalBtc: number;
  longTermBtc: number;
  shortTermBtc: number;
  longTermValue: number;
  shortTermValue: number;
  longTermUnrealized: number;
  shortTermUnrealized: number;
}

export interface DisposalMatch {
  lotId: string;
  lotDate: string;
  source: string;
  btc: number;
  costBasis: number;
  proceeds: number;
  gain: number;
  longTerm: boolean;
}

export interface SaleResult {
  method: CostBasisMethod;
  btcRequested: number;
  btcSold: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  shortTermGain: number;
  longTermGain: number;
  matches: DisposalMatch[];
}

/** Split the lot inventory into long-term and short-term holdings. */
export function summarizeHoldings(lots: Lot[]): HoldingSummary {
  let longTermBtc = 0;
  let shortTermBtc = 0;
  let longTermValue = 0;
  let shortTermValue = 0;
  let longTermCost = 0;
  let shortTermCost = 0;

  for (const lot of lots) {
    if (lot.daysHeld > LONG_TERM_DAYS) {
      longTermBtc += lot.btc;
      longTermValue += lot.currentValue;
      longTermCost += lot.usd;
    } else {
      shortTermBtc += lot.btc;
      shortTermValue += lot.currentValue;
      shortTermCost += lot.usd;
    }
  }

  return {
    totalBtc: longTermBtc + shortTermBtc,
    longTermBtc,
    shortTermBtc,
    longTermValue,
    shortTermValue,
    longTermUnrealized: longTermValue - longTermCost,
    shortTermUnrealized: shortTermValue - shortTermCost,
  };
}

/** Order lots for disposal according to the chosen cost-basis method. */
function orderLots(lots: Lot[], method: CostBasisMethod): Lot[] {
  const ordered = [...lots];
  if (method === "FIFO") {
    ordered.sort((a, b) => a.date.localeCompare(b.date));
  } else if (method === "LIFO") {
    ordered.sort((a, b) => b.date.localeCompare(a.date));
  } else {
    ordered.sort((a, b) => b.buyPrice - a.buyPrice);
  }
  return ordered;
}

/**
 * Match a hypothetical sale of `btcToSell` BTC at `salePrice` against the
 * lot inventory using the given method. The sale is capped at the balance
 * actually available.
 */
export function simulateSale(
  lots: Lot[],
  btcToSell: number,
  salePrice: number,
  method: CostBasisMethod,
): SaleResult {
  const ordered = orderLots(lots, method);
  let remaining = Math.max(0, btcToSell);
  const matches: DisposalMatch[] = [];

  for (const lot of ordered) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, lot.btc);
    if (take <= 0) continue;
    const costBasis = lot.buyPrice * take;
    const proceeds = salePrice * take;
    matches.push({
      lotId: lot.id,
      lotDate: lot.date,
      source: lot.source,
      btc: take,
      costBasis,
      proceeds,
      gain: proceeds - costBasis,
      longTerm: lot.daysHeld > LONG_TERM_DAYS,
    });
    remaining -= take;
  }

  const proceeds = matches.reduce((sum, m) => sum + m.proceeds, 0);
  const costBasis = matches.reduce((sum, m) => sum + m.costBasis, 0);
  const shortTermGain = matches
    .filter((m) => !m.longTerm)
    .reduce((sum, m) => sum + m.gain, 0);
  const longTermGain = matches
    .filter((m) => m.longTerm)
    .reduce((sum, m) => sum + m.gain, 0);

  return {
    method,
    btcRequested: btcToSell,
    btcSold: Math.max(0, btcToSell) - remaining,
    proceeds,
    costBasis,
    gain: proceeds - costBasis,
    shortTermGain,
    longTermGain,
    matches,
  };
}

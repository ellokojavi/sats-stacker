import { describe, expect, it } from "vitest";
import type { Lot } from "./types";
import { simulateSale, summarizeHoldings } from "./tax";

function makeLot(over: Partial<Lot>): Lot {
  const base: Lot = {
    id: "lot",
    date: "2020-01-01 00:00:00",
    source: "Strike",
    btc: 1,
    usd: 1000,
    buyPrice: 1000,
    currentValue: 1000,
    profit: 0,
    roi: 0,
    daysHeld: 1000,
    annualizedRoi: null,
  };
  return { ...base, ...over };
}

// Four 1-BTC lots with distinct dates and prices, so FIFO, LIFO and HIFO
// each pick a different lot.
const LOTS: Lot[] = [
  makeLot({ id: "L1", date: "2018-01-01 00:00:00", buyPrice: 4000, usd: 4000, daysHeld: 3000 }),
  makeLot({ id: "L2", date: "2021-01-01 00:00:00", buyPrice: 60000, usd: 60000, daysHeld: 1900 }),
  makeLot({ id: "L3", date: "2024-01-01 00:00:00", buyPrice: 45000, usd: 45000, daysHeld: 800 }),
  makeLot({ id: "L4", date: "2026-03-01 00:00:00", buyPrice: 30000, usd: 30000, daysHeld: 60 }),
];

const SALE_PRICE = 100000;

describe("simulateSale — lot selection", () => {
  it("FIFO sells the oldest lot first", () => {
    const r = simulateSale(LOTS, 1, SALE_PRICE, "FIFO");
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].lotId).toBe("L1");
    expect(r.costBasis).toBeCloseTo(4000, 2);
    expect(r.proceeds).toBeCloseTo(100000, 2);
    expect(r.gain).toBeCloseTo(96000, 2);
    expect(r.longTermGain).toBeCloseTo(96000, 2);
    expect(r.shortTermGain).toBeCloseTo(0, 2);
  });

  it("LIFO sells the newest lot first", () => {
    const r = simulateSale(LOTS, 1, SALE_PRICE, "LIFO");
    expect(r.matches[0].lotId).toBe("L4");
    expect(r.costBasis).toBeCloseTo(30000, 2);
    expect(r.gain).toBeCloseTo(70000, 2);
    expect(r.shortTermGain).toBeCloseTo(70000, 2);
    expect(r.longTermGain).toBeCloseTo(0, 2);
  });

  it("HIFO sells the highest-cost lot first", () => {
    const r = simulateSale(LOTS, 1, SALE_PRICE, "HIFO");
    expect(r.matches[0].lotId).toBe("L2");
    expect(r.costBasis).toBeCloseTo(60000, 2);
    expect(r.gain).toBeCloseTo(40000, 2);
  });
});

describe("simulateSale — sale amounts", () => {
  it("consumes part of a lot for a fractional sale", () => {
    const r = simulateSale(LOTS, 0.5, SALE_PRICE, "FIFO");
    expect(r.btcSold).toBeCloseTo(0.5, 6);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].btc).toBeCloseTo(0.5, 6);
    expect(r.costBasis).toBeCloseTo(2000, 2);
  });

  it("spans multiple lots for a larger sale", () => {
    const r = simulateSale(LOTS, 1.5, SALE_PRICE, "FIFO");
    expect(r.matches).toHaveLength(2);
    expect(r.costBasis).toBeCloseTo(4000 + 30000, 2);
  });

  it("caps the sale at the available balance", () => {
    const r = simulateSale(LOTS, 10, SALE_PRICE, "FIFO");
    expect(r.btcSold).toBeCloseTo(4, 6);
    expect(r.matches).toHaveLength(4);
  });

  it("splits the gain by holding period", () => {
    const r = simulateSale(LOTS, 3.5, SALE_PRICE, "FIFO");
    expect(r.longTermGain).toBeCloseTo(96000 + 40000 + 55000, 2);
    expect(r.shortTermGain).toBeCloseTo(50000 - 15000, 2);
  });
});

describe("HIFO minimizes the taxable gain", () => {
  it("yields the lowest gain of the three methods", () => {
    const fifo = simulateSale(LOTS, 1, SALE_PRICE, "FIFO").gain;
    const lifo = simulateSale(LOTS, 1, SALE_PRICE, "LIFO").gain;
    const hifo = simulateSale(LOTS, 1, SALE_PRICE, "HIFO").gain;
    expect(hifo).toBeLessThanOrEqual(fifo);
    expect(hifo).toBeLessThanOrEqual(lifo);
  });
});

describe("summarizeHoldings", () => {
  it("splits the inventory by holding period", () => {
    const s = summarizeHoldings(LOTS);
    expect(s.totalBtc).toBeCloseTo(4, 6);
    expect(s.longTermBtc).toBeCloseTo(3, 6);
    expect(s.shortTermBtc).toBeCloseTo(1, 6);
  });
});

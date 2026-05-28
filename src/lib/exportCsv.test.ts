import { describe, it, expect } from "vitest";
import { buildLedgerCsv, ledgerFilename } from "./exportCsv";
import type { Transaction } from "./types";

const TXNS: Transaction[] = [
  {
    id: "ref-1",
    date: "2024-01-02 10:00:00",
    source: "Strike",
    action: "Purchase",
    btc: 0.001,
    usd: 50,
    fees: 0.25,
  },
  {
    // Tricky values: commas, quotes, and newlines should round-trip safely.
    id: 'ref,"weird"\nid',
    date: "2024-03-15 11:00:00",
    source: "Coinbase",
    action: "Buy",
    btc: 0.0025,
    usd: 100.55,
    fees: 0,
  },
];

describe("buildLedgerCsv", () => {
  it("emits header + one row per transaction with CSV escaping", () => {
    const csv = buildLedgerCsv(TXNS);
    // We assert against the full string because the tricky row contains an
    // embedded newline inside a quoted field — splitting on "\n" would tear
    // the row in two and make line-by-line assertions misleading.
    expect(csv).toBe(
      "id,date,exchange,action,btc,usd,fees\n" +
        "ref-1,2024-01-02 10:00:00,Strike,Purchase,0.001,50.00,0.25\n" +
        '"ref,""weird""\nid",2024-03-15 11:00:00,Coinbase,Buy,0.0025,100.55,0.00\n',
    );
  });

  it("handles an empty ledger as just the header row", () => {
    const csv = buildLedgerCsv([]);
    expect(csv).toBe("id,date,exchange,action,btc,usd,fees\n");
  });

  it("guards against non-finite numerics", () => {
    const csv = buildLedgerCsv([
      {
        id: "x",
        date: "2024-06-01",
        source: "Swan",
        action: "Buy",
        btc: NaN,
        usd: Infinity,
        fees: -Infinity,
      },
    ]);
    expect(csv).toBe(
      "id,date,exchange,action,btc,usd,fees\nx,2024-06-01,Swan,Buy,,,\n",
    );
  });
});

describe("ledgerFilename", () => {
  it("includes the source and today's date", () => {
    const name = ledgerFilename("imported");
    expect(name).toMatch(
      /^sats-stacker_ledger_imported_\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});

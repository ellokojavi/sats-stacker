import { describe, it, expect } from "vitest";
import { normalizeFiles, mergeEtlResults, type NamedFile } from "./pipeline";

const STRIKE = `Strike Transaction History
Reference,Date & Time (UTC),Transaction Type,Currency 1,Amount 1,Currency 2,Amount BTC,Amount USD
ref-a,Jan 02 2024 10:00:00,Purchase,USD,-50,BTC,0.001,50
ref-b,Mar 15 2024 11:00:00,Purchase,USD,-100,BTC,0.002,100
ref-a,Jan 02 2024 10:00:00,Purchase,USD,-50,BTC,0.001,50
`;

const UNKNOWN = `Some other header,foo,bar
1,2,3
`;

describe("ImportSummary pipeline output", () => {
  it("captures per-file stats and date ranges", () => {
    const files: NamedFile[] = [
      { name: "strike-2024.csv", content: STRIKE },
      { name: "junk.csv", content: UNKNOWN },
    ];
    const r = normalizeFiles(files, "imported");
    expect(r.stats.filesIngested).toBe(1);
    expect(r.stats.filesSkipped).toBe(1);
    expect(r.stats.duplicatesRemoved).toBe(1);
    expect(r.stats.total).toBe(2);
    expect(r.stats.firstDate?.slice(0, 10)).toBe("2024-01-02");
    expect(r.stats.lastDate?.slice(0, 10)).toBe("2024-03-15");
    expect(r.stats.files).toHaveLength(2);
    expect(r.stats.files[0]).toMatchObject({
      fileName: "strike-2024.csv",
      exchange: "Strike",
      recognized: true,
      transactions: 2,
      duplicatesRemoved: 1,
    });
    expect(r.stats.files[0].firstDate?.slice(0, 10)).toBe("2024-01-02");
    expect(r.stats.files[0].lastDate?.slice(0, 10)).toBe("2024-03-15");
    expect(r.stats.files[1]).toMatchObject({
      fileName: "junk.csv",
      exchange: null,
      recognized: false,
      transactions: 0,
    });
    expect(r.stats.byExchange).toHaveLength(1);
    expect(r.stats.byExchange[0]).toMatchObject({
      exchange: "Strike",
      transactions: 2,
      files: 1,
    });
    expect(typeof r.stats.importedAt).toBe("string");
  });
});

const STRIKE_NEW = `Strike Transaction History
Reference,Date & Time (UTC),Transaction Type,Currency 1,Amount 1,Currency 2,Amount BTC,Amount USD
ref-c,Jun 02 2025 10:00:00,Purchase,USD,-200,BTC,0.004,200
`;

const COINBASE_NEW = `Account info
Header line that gets stripped
Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2025-07-15T10:00:00Z,Buy,BTC,0.005,USD,40000,200,200,0,
`;

describe("mergeEtlResults — legacy-path append fallback", () => {
  it("preserves the existing ledger when adding non-overlapping transactions", () => {
    // Simulate the pre-upgrade case: existing imported ledger came from an
    // earlier session; we now have fresh files to append but no raw bytes
    // for the prior import.
    const existing = normalizeFiles(
      [{ name: "strike-2024.csv", content: STRIKE }],
      "imported",
    );
    const incoming = normalizeFiles(
      [{ name: "strike-2025.csv", content: STRIKE_NEW }],
      "imported",
    );
    const merged = mergeEtlResults(existing, incoming);
    // Original two (ref-a, ref-b — ref-a dup was stripped at ETL time) plus
    // the new ref-c = three transactions.
    expect(merged.transactions.map((t) => t.id).sort()).toEqual([
      "ref-a",
      "ref-b",
      "ref-c",
    ]);
    expect(merged.stats.total).toBe(3);
    expect(merged.stats.filesIngested).toBe(2);
    // Date range expands to cover both halves.
    expect(merged.stats.firstDate?.slice(0, 10)).toBe("2024-01-02");
    expect(merged.stats.lastDate?.slice(0, 10)).toBe("2025-06-02");
  });

  it("dedupes transactions that appear in both pools (the user re-imported the same data)", () => {
    const existing = normalizeFiles(
      [{ name: "strike-2024.csv", content: STRIKE }],
      "imported",
    );
    // Re-importing the same file later — should not double-count.
    const incoming = normalizeFiles(
      [{ name: "strike-2024-again.csv", content: STRIKE }],
      "imported",
    );
    const merged = mergeEtlResults(existing, incoming);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual([
      "ref-a",
      "ref-b",
    ]);
    expect(merged.stats.total).toBe(2);
    // Cross-pool dedupes get counted on top of in-pool dedupes.
    expect(merged.stats.duplicatesRemoved).toBeGreaterThan(0);
  });

  it("rebuilds byExchange when the two pools come from different exchanges", () => {
    const existing = normalizeFiles(
      [{ name: "strike-2024.csv", content: STRIKE }],
      "imported",
    );
    const incoming = normalizeFiles(
      [{ name: "coinbase-2025.csv", content: COINBASE_NEW }],
      "imported",
    );
    const merged = mergeEtlResults(existing, incoming);
    const exchanges = merged.stats.byExchange
      .map((r) => r.exchange)
      .sort();
    expect(exchanges).toEqual(["Coinbase", "Strike"]);
    expect(merged.stats.filesIngested).toBe(2);
  });
});

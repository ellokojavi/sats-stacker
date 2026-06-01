import { describe, it, expect, beforeEach } from "vitest";

// Vitest runs in the node env by default; importStore.ts touches
// localStorage. Stub it before importing the module so the module's
// try/catch fallbacks aren't the only thing being exercised.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};

import { saveRawFiles, loadRawFiles, clearImportedLedger } from "./importStore";
import { normalizeFiles, type NamedFile } from "./etl/pipeline";

/**
 * The append-vs-replace contract is implemented inside the Dashboard
 * (`handleAppendFiles`), but its two load-bearing pieces live in this module:
 *
 *  1. The raw-file pool persists across reloads via saveRawFiles / loadRawFiles.
 *  2. Re-running the ETL over a deduped union (by file name) produces the
 *     same ledger as importing all files at once — i.e., append + replace
 *     are compatible.
 *
 * Both are pure-data — no DOM — so we can verify them directly here.
 */

const STRIKE_1 = `Strike Transaction History
Reference,Date & Time (UTC),Transaction Type,Currency 1,Amount 1,Currency 2,Amount BTC,Amount USD
ref-a,Jan 02 2024 10:00:00,Purchase,USD,-50,BTC,0.001,50
`;

const STRIKE_1_UPDATED = `Strike Transaction History
Reference,Date & Time (UTC),Transaction Type,Currency 1,Amount 1,Currency 2,Amount BTC,Amount USD
ref-a,Jan 02 2024 10:00:00,Purchase,USD,-50,BTC,0.001,50
ref-b,Feb 10 2024 11:00:00,Purchase,USD,-75,BTC,0.0015,75
`;

const STRIKE_2 = `Strike Transaction History
Reference,Date & Time (UTC),Transaction Type,Currency 1,Amount 1,Currency 2,Amount BTC,Amount USD
ref-c,Apr 02 2025 10:00:00,Purchase,USD,-100,BTC,0.002,100
`;

/**
 * Helper that mirrors the Dashboard's append logic: union-by-name (new wins)
 * then re-run the ETL. Kept here so the test verifies the contract, not the
 * implementation path.
 */
function appendByName(
  existing: NamedFile[],
  incoming: NamedFile[],
): NamedFile[] {
  const map = new Map(existing.map((f) => [f.name, f]));
  for (const f of incoming) map.set(f.name, f);
  return Array.from(map.values());
}

describe("raw-file persistence", () => {
  beforeEach(() => {
    store.clear();
    clearImportedLedger();
  });

  it("round-trips a NamedFile[] through localStorage", () => {
    const files: NamedFile[] = [
      { name: "strike-2024.csv", content: STRIKE_1 },
      { name: "strike-2025.csv", content: STRIKE_2 },
    ];
    saveRawFiles(files);
    expect(loadRawFiles()).toEqual(files);
  });

  it("returns [] when nothing has been saved", () => {
    expect(loadRawFiles()).toEqual([]);
  });

  it("ignores malformed entries instead of crashing", () => {
    // Smuggle a junk payload past the type-checker.
    localStorage.setItem(
      "sats-stacker.files.v1",
      JSON.stringify([
        { name: "ok.csv", content: STRIKE_1 },
        { name: 123 },
        "not-an-object",
        null,
      ]),
    );
    const loaded = loadRawFiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: "ok.csv" });
  });

  it("clearImportedLedger wipes the raw files too", () => {
    saveRawFiles([{ name: "a.csv", content: STRIKE_1 }]);
    clearImportedLedger();
    expect(loadRawFiles()).toEqual([]);
  });
});

describe("append-by-name semantics", () => {
  it("extends the pool when the new file name is unique", () => {
    const pool = appendByName(
      [{ name: "strike-2024.csv", content: STRIKE_1 }],
      [{ name: "strike-2025.csv", content: STRIKE_2 }],
    );
    expect(pool.map((f) => f.name)).toEqual([
      "strike-2024.csv",
      "strike-2025.csv",
    ]);
    const result = normalizeFiles(pool, "imported");
    // Both buys make it through the ETL — append preserved the prior file.
    expect(result.stats.total).toBe(2);
  });

  it("replaces just that file when the new file name already exists", () => {
    const pool = appendByName(
      [{ name: "strike-2024.csv", content: STRIKE_1 }],
      [{ name: "strike-2024.csv", content: STRIKE_1_UPDATED }],
    );
    expect(pool).toHaveLength(1);
    const result = normalizeFiles(pool, "imported");
    // The updated file's two rows survive; the first file's single row is
    // gone because the file itself was replaced.
    expect(result.stats.total).toBe(2);
    expect(result.transactions.map((t) => t.id).sort()).toEqual([
      "ref-a",
      "ref-b",
    ]);
  });

  it("produces the same ledger as a single batched import", () => {
    const batched = normalizeFiles(
      [
        { name: "strike-2024.csv", content: STRIKE_1 },
        { name: "strike-2025.csv", content: STRIKE_2 },
      ],
      "imported",
    );
    const incremental = normalizeFiles(
      appendByName(
        [{ name: "strike-2024.csv", content: STRIKE_1 }],
        [{ name: "strike-2025.csv", content: STRIKE_2 }],
      ),
      "imported",
    );
    // Append + re-ETL must yield the same transactions as importing both
    // files at once. Anything else is a silent divergence between the two
    // entry paths.
    expect(incremental.transactions.map((t) => t.id).sort()).toEqual(
      batched.transactions.map((t) => t.id).sort(),
    );
    expect(incremental.stats.total).toBe(batched.stats.total);
  });
});

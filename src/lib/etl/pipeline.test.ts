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

// Strike's real account-statement export uses a different header schema than
// the older synthetic sample above: "Transaction ID"/"Time (UTC)"/"Status"
// instead of "Reference"/"Date & Time (UTC)". The ETL must ingest both.
const STRIKE_REAL = `Transaction ID,Time (UTC),Status,Transaction Type,Amount USD,Fee USD,Amount BTC,Fee BTC,Description,Exchange Rate,Transaction Hash
5dd78818-a845-47c2-acc7-48cceda7a932,Jun 01 2026 13:00:08,Completed,Deposit,500.00,,,,,,
ce45bdbc-292b-410d-87b8-a012e94158ae,Jun 01 2026 13:00:35,Completed,Purchase,-500.00,,0.00693437,,,72104.60,
3099b576-3b5b-45b0-8699-ebc99583a421,Jun 02 2026 13:00:15,Completed,Purchase,-250.00,,0.00362747,,,68918.46,
`;

describe("Strike real account-statement schema", () => {
  it("ingests the real export (Transaction ID / Time (UTC) / Status columns)", () => {
    const r = normalizeFiles(
      [{ name: "2026-06 Account Statement.csv", content: STRIKE_REAL }],
      "imported",
    );
    // Two Purchases ingested; the Deposit row is filtered out.
    expect(r.stats.total).toBe(2);
    expect(r.stats.byExchange[0]).toMatchObject({
      exchange: "Strike",
      transactions: 2,
    });
    // Dates and ids must be populated (the bug left them blank).
    expect(r.transactions.every((t) => /^\d{4}-\d{2}-\d{2}/.test(t.date))).toBe(
      true,
    );
    expect(r.transactions.every((t) => t.id.length > 0)).toBe(true);
    expect(r.stats.firstDate?.slice(0, 10)).toBe("2026-06-01");
    expect(r.stats.lastDate?.slice(0, 10)).toBe("2026-06-02");
    expect(r.transactions[0]).toMatchObject({
      id: "ce45bdbc-292b-410d-87b8-a012e94158ae",
      source: "Strike",
      action: "BUY",
      usd: 500,
    });
  });
});

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

// ---------------------------------------------------------------------------
// Parent-folder recursive scan (the webkitdirectory / folder-pick flow).
//
// When a user points <input webkitdirectory> at ONE parent folder (e.g.
// "all CSVs/" holding a subfolder per exchange), the browser enumerates the
// ENTIRE tree and stamps each file with a `webkitRelativePath` like
// "all CSVs/Strike/strike.csv". ImportDropzone.ingestList
// (src/components/ImportDropzone.tsx) maps every file to
// `{ path: file.webkitRelativePath || file.name }`, and toNamedFiles filters
// to `.csv` and reads each into a NamedFile whose `name` IS that relative
// path. So the NamedFile[] that reaches normalizeFiles carries nested paths,
// at whatever depth they sat under the picked parent.
//
// These tests reproduce that seam faithfully (path derivation + .csv filter)
// with the SAME raw, source-native CSV formats the generator emits — Coinbase
// and Swan preamble junk, Cash App quoted/$-prefixed fields, Strike deposit
// rows that get filtered — and assert that all four exchanges are recognized
// and merged in a single pick, regardless of nesting depth.
// ---------------------------------------------------------------------------

// Strike synthetic account statement — Deposit rows are filtered; 2 Purchases.
const NESTED_STRIKE = `Reference,Date & Time (UTC),Transaction Type,Amount USD,Fee USD,Amount BTC,Fee BTC,BTC Price,Cost Basis (USD),Destination,Description,Transaction Hash,Note
75377817-cb55-7ab0-b46f-95f121770f0a,Jan 01 2024 13:02:22,Deposit,50.00,,,,,,,,,
64a5a104-43b2-bc3a-9a45-dfa5b75c9945,Jan 01 2024 13:03:00,Purchase,-50.00,,0.00113128,,44197.61,50.00,,,,
0c15a73f-4a27-ba52-ae08-672b8301ced5,Jan 02 2024 13:04:22,Deposit,100.00,,,,,,,,,
dfcbc3f7-5e21-90a8-32a5-c522af0d5d51,Jan 02 2024 13:05:00,Purchase,-100.00,,0.00222369,,44970.34,100.00,,,,
`;

// Coinbase — leading "Transactions"/User preamble + blank line before header; 2 Buys.
const NESTED_COINBASE = `Transactions
User,Demo User (synthetic data),47c631d5-08de-d617-2c28-cf1ecd88823b

ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
f5889c72-4841-5e97-1224-4152a34b26c8,2017-12-08 19:07:00 UTC,Buy,BTC,0.12277218,USD,"$16,047.61","$1,970.20","$2,000.00",$29.80,Bought 0.12277218 BTC for 2000.00 USD
1a93ca57-f00e-ffb2-1165-5d0f79e975de,2017-12-12 09:47:00 UTC,Buy,BTC,0.05766248,USD,"$17,083.90",$985.10,"$1,000.00",$14.90,Bought 0.05766248 BTC for 1000.00 USD
`;

// Cash App — fully quoted fields, $-prefixed money, PST timestamps; the
// Bitcoin Withdrawal row is filtered, leaving 2 Bitcoin Buys.
const NESTED_CASHAPP = `"Transaction ID","Date","Transaction Type","Currency","Amount","Fee","Net Amount","Asset Type","Asset Price","Asset Amount","Status","Notes","Name of sender/receiver","Account"
"dug4yv","2023-08-08 09:57:00 PST","Bitcoin Buy","USD","-$2,455.00","-$45.00","-$2,500.00","BTC","$29,770.51","0.08246416","COMPLETED","purchase of BTC 0.08246416","","Your Cash"
"3dbbk3","2023-08-08 09:59:00 PST","Bitcoin Withdrawal","USD","-$2,500.00","$0","-$2,500.00","BTC","$29,770.51","0.08246416","COMPLETED","Withdrawing BTC 0.08246416","","Your Cash"
"yegyrw","2023-08-08 11:04:00 PST","Bitcoin Buy","USD","-$491.00","-$9.00","-$500.00","BTC","$29,770.51","0.01649283","COMPLETED","purchase of BTC 0.01649283","","Your Cash"
`;

// Swan — two-line preamble, +00 tz offset on dates; deposit filtered, 1 Purchase.
const NESTED_SWAN = `Swan Bitcoin - synthetic sample export - not real data
Phone: 000-000-0000
Event,Date,Timezone,Status,Transaction ID,Total USD,Transaction USD,Fee USD,Unit Count,Asset Type,BTC Price,Address Label,USD Cost Basis,Acquisition Date
deposit,2023-11-17 15:29:30+00,UTC,settled,,504.95,,4.95,,USD,,,,
purchase,2023-11-17 15:30:00+00,UTC,settled,c36fd56e-c24a-60ff-0252-525c6a3bdf21,500.00,500.00,,0.01365139,BTC,36626.32,,,
`;

/** A file as the folder picker hands it over: a relative path + its bytes. */
interface PickedFile {
  webkitRelativePath: string;
  name: string;
  content: string;
}

/**
 * Reproduce ImportDropzone.ingestList's seam exactly: derive each NamedFile's
 * name from `webkitRelativePath || name`, keep only `.csv` files, and carry
 * the content through. This is the flow onFiles → handleReplaceFiles →
 * commitFiles → normalizeFiles receives after a folder pick.
 */
function asFolderPick(files: PickedFile[]): NamedFile[] {
  const isCsv = (n: string) => /\.csv$/i.test(n);
  return files
    .map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))
    .filter((p) => isCsv(p.path))
    .map((p) => ({ name: p.path, content: p.file.content }));
}

describe("parent-folder recursive scan (webkitdirectory folder pick)", () => {
  it("recognizes all four exchanges from one parent-folder pick, at any nesting depth", () => {
    // One parent "all CSVs/" with a subfolder per exchange; Swan sits an extra
    // level deep to prove depth is irrelevant to detection.
    const picked: PickedFile[] = [
      {
        webkitRelativePath: "all CSVs/Strike/strike.csv",
        name: "strike.csv",
        content: NESTED_STRIKE,
      },
      {
        webkitRelativePath: "all CSVs/Coinbase/coinbase_report.csv",
        name: "coinbase_report.csv",
        content: NESTED_COINBASE,
      },
      {
        webkitRelativePath: "all CSVs/Cash App/cash_app.csv",
        name: "cash_app.csv",
        content: NESTED_CASHAPP,
      },
      {
        webkitRelativePath: "all CSVs/Swan/2023/swan.csv", // deeper on purpose
        name: "swan.csv",
        content: NESTED_SWAN,
      },
    ];

    const files = asFolderPick(picked);
    const r = normalizeFiles(files, "imported");

    // All four exchanges detected — the merged ledger spans every subfolder.
    expect(r.stats.byExchange.map((e) => e.exchange).sort()).toEqual([
      "CashApp",
      "Coinbase",
      "Strike",
      "Swan",
    ]);
    expect(r.stats.filesIngested).toBe(4);
    expect(r.stats.filesSkipped).toBe(0);
    expect(r.stats.files.every((f) => f.recognized)).toBe(true);

    // 2 Strike + 2 Coinbase + 2 Cash App + 1 Swan = 7 transactions.
    expect(r.stats.total).toBe(7);

    // NamedFile names preserve the full nested relative path (so same-named
    // exports in different subfolders never collide), including the deep one.
    expect(r.stats.files.map((f) => f.fileName)).toContain(
      "all CSVs/Swan/2023/swan.csv",
    );

    // Sanity: each exchange contributes its expected transaction count.
    const byName = Object.fromEntries(
      r.stats.byExchange.map((e) => [e.exchange, e.transactions]),
    );
    expect(byName).toMatchObject({
      Strike: 2,
      Coinbase: 2,
      CashApp: 2,
      Swan: 1,
    });
  });

  it("keeps unrecognized nested CSVs loud and drops non-CSV files from the pick", () => {
    const picked: PickedFile[] = [
      {
        webkitRelativePath: "all CSVs/Strike/strike.csv",
        name: "strike.csv",
        content: NESTED_STRIKE,
      },
      // A non-CSV should never reach the ETL — filtered at the dropzone seam.
      {
        webkitRelativePath: "all CSVs/README.txt",
        name: "README.txt",
        content: "just some notes",
      },
      // A nested CSV we can't identify must be surfaced, not silently swallowed.
      {
        webkitRelativePath: "all CSVs/Misc/mystery-export.csv",
        name: "mystery-export.csv",
        content: UNKNOWN,
      },
    ];

    const files = asFolderPick(picked);
    expect(files.map((f) => f.name)).not.toContain("all CSVs/README.txt");

    const r = normalizeFiles(files, "imported");
    expect(r.stats.filesIngested).toBe(1);
    expect(r.stats.filesSkipped).toBe(1);
    const unknown = r.stats.files.find((f) => !f.recognized);
    expect(unknown?.fileName).toBe("all CSVs/Misc/mystery-export.csv");
  });
});

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

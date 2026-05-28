import { describe, it, expect } from "vitest";
import { normalizeFiles, type NamedFile } from "./pipeline";

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

import type {
  Transaction,
  EtlResult,
  EtlStats,
  ExchangeStat,
  FileImport,
  DataSource,
} from "../types";
import { parseCsv } from "./csv";
import {
  normalizeStrike,
  normalizeCoinbase,
  normalizeCashApp,
  normalizeSwan,
} from "./normalize";

/**
 * The ETL core. Everything here is pure (no filesystem access), so it runs
 * the same way at build time over the bundled exports and in the browser
 * over files the user imports. The filesystem loaders live in lib/data.ts.
 */

export interface NamedFile {
  name: string;
  content: string;
}

interface ExchangeConfig {
  name: string;
  /** Tokens that uniquely identify this exchange's header row. */
  headerTokens: string[];
  normalize: (rows: Record<string, string>[]) => Transaction[];
}

const EXCHANGES: ExchangeConfig[] = [
  {
    name: "Strike",
    headerTokens: ["Transaction Type", "Amount BTC"],
    normalize: normalizeStrike,
  },
  {
    name: "Coinbase",
    headerTokens: ["Timestamp", "Transaction Type"],
    normalize: normalizeCoinbase,
  },
  {
    name: "CashApp",
    headerTokens: ["Transaction ID", "Asset Amount"],
    normalize: normalizeCashApp,
  },
  {
    name: "Swan",
    headerTokens: ["Event", "Transaction ID"],
    normalize: normalizeSwan,
  },
];

function findHeaderIndex(grid: string[][], tokens: string[]): number {
  for (let i = 0; i < grid.length; i++) {
    if (tokens.every((token) => grid[i].includes(token))) return i;
  }
  return -1;
}

/** Identify which exchange a parsed CSV came from, by its header row. */
function detectExchange(
  grid: string[][],
): { config: ExchangeConfig; headerIndex: number } | null {
  for (const config of EXCHANGES) {
    const headerIndex = findHeaderIndex(grid, config.headerTokens);
    if (headerIndex !== -1) return { config, headerIndex };
  }
  return null;
}

/** Turn a parsed grid into header-keyed row objects. */
function gridToRecords(
  grid: string[][],
  headerIndex: number,
): Record<string, string>[] {
  const header = grid[headerIndex];
  const records: Record<string, string>[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (cells.length === 1 && cells[0] === "") continue;
    const record: Record<string, string> = {};
    header.forEach((key, j) => {
      record[key] = cells[j] ?? "";
    });
    records.push(record);
  }
  return records;
}

/** Min/max ISO-date helpers — works because our dates are ISO-formatted strings. */
function minDate(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a < b ? a : b;
}
function maxDate(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a > b ? a : b;
}

/**
 * Run the ETL over a set of in-memory CSV files: auto-detect each file's
 * exchange, normalize every schema onto the standard ledger, drop duplicate
 * rows per exchange, and return one date-sorted ledger plus statistics.
 */
export function normalizeFiles(
  files: NamedFile[],
  source: DataSource,
): EtlResult {
  // Per-file working set — keyed by index so we can update each FileImport in place.
  const fileImports: FileImport[] = [];
  // Map exchange -> [{ fileIndex, txn }] so we can attribute kept/dropped
  // counts back to the file that contributed each row.
  const perExchange = new Map<
    string,
    { fileIndex: number; txn: Transaction }[]
  >();
  const fileCounts = new Map<string, number>();
  let filesIngested = 0;
  let filesSkipped = 0;

  files.forEach((file, idx) => {
    const grid = parseCsv(file.content);
    const detected = detectExchange(grid);
    if (!detected) {
      filesSkipped += 1;
      fileImports.push({
        fileName: file.name,
        exchange: null,
        recognized: false,
        transactions: 0,
        duplicatesRemoved: 0,
        firstDate: null,
        lastDate: null,
      });
      return;
    }
    filesIngested += 1;
    const records = gridToRecords(grid, detected.headerIndex);
    const txns = detected.config.normalize(records);
    const existing = perExchange.get(detected.config.name) ?? [];
    perExchange.set(
      detected.config.name,
      existing.concat(txns.map((txn) => ({ fileIndex: idx, txn }))),
    );
    fileCounts.set(
      detected.config.name,
      (fileCounts.get(detected.config.name) ?? 0) + 1,
    );
    fileImports.push({
      fileName: file.name,
      exchange: detected.config.name,
      recognized: true,
      transactions: 0, // filled in after dedupe below
      duplicatesRemoved: 0,
      firstDate: null,
      lastDate: null,
    });
  });

  const transactions: Transaction[] = [];
  const byExchange: ExchangeStat[] = [];
  let duplicatesRemoved = 0;

  for (const config of EXCHANGES) {
    const entries = perExchange.get(config.name);
    if (!entries) continue;
    const seen = new Set<string>();
    let kept = 0;
    let exchangeFirst: string | null = null;
    let exchangeLast: string | null = null;
    for (const { fileIndex, txn } of entries) {
      const key = txn.id || `${txn.date}|${txn.btc}|${txn.usd}`;
      const fileImport = fileImports[fileIndex];
      if (seen.has(key)) {
        duplicatesRemoved += 1;
        fileImport.duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      transactions.push(txn);
      kept += 1;
      fileImport.transactions += 1;
      fileImport.firstDate = minDate(fileImport.firstDate, txn.date);
      fileImport.lastDate = maxDate(fileImport.lastDate, txn.date);
      exchangeFirst = minDate(exchangeFirst, txn.date);
      exchangeLast = maxDate(exchangeLast, txn.date);
    }
    byExchange.push({
      exchange: config.name,
      transactions: kept,
      files: fileCounts.get(config.name) ?? 0,
      firstDate: exchangeFirst,
      lastDate: exchangeLast,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const firstDate = transactions.length > 0 ? transactions[0].date : null;
  const lastDate =
    transactions.length > 0 ? transactions[transactions.length - 1].date : null;

  const stats: EtlStats = {
    filesIngested,
    filesSkipped,
    duplicatesRemoved,
    total: transactions.length,
    byExchange,
    files: fileImports,
    firstDate,
    lastDate,
    importedAt: new Date().toISOString(),
  };
  return { transactions, stats, source };
}

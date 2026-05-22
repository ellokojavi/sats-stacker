import type {
  Transaction,
  EtlResult,
  EtlStats,
  ExchangeStat,
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

/**
 * Run the ETL over a set of in-memory CSV files: auto-detect each file's
 * exchange, normalize every schema onto the standard ledger, drop duplicate
 * rows per exchange, and return one date-sorted ledger plus statistics.
 */
export function normalizeFiles(
  files: NamedFile[],
  source: DataSource,
): EtlResult {
  const perExchange = new Map<string, Transaction[]>();
  const fileCounts = new Map<string, number>();
  let filesIngested = 0;
  let filesSkipped = 0;

  for (const file of files) {
    const grid = parseCsv(file.content);
    const detected = detectExchange(grid);
    if (!detected) {
      filesSkipped += 1;
      continue;
    }
    filesIngested += 1;
    const records = gridToRecords(grid, detected.headerIndex);
    const txns = detected.config.normalize(records);
    const existing = perExchange.get(detected.config.name) ?? [];
    perExchange.set(detected.config.name, existing.concat(txns));
    fileCounts.set(
      detected.config.name,
      (fileCounts.get(detected.config.name) ?? 0) + 1,
    );
  }

  const transactions: Transaction[] = [];
  const byExchange: ExchangeStat[] = [];
  let duplicatesRemoved = 0;

  for (const config of EXCHANGES) {
    const txns = perExchange.get(config.name);
    if (!txns) continue;
    const seen = new Set<string>();
    let kept = 0;
    for (const txn of txns) {
      const key = txn.id || `${txn.date}|${txn.btc}|${txn.usd}`;
      if (seen.has(key)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      transactions.push(txn);
      kept += 1;
    }
    byExchange.push({
      exchange: config.name,
      transactions: kept,
      files: fileCounts.get(config.name) ?? 0,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const stats: EtlStats = {
    filesIngested,
    filesSkipped,
    duplicatesRemoved,
    total: transactions.length,
    byExchange,
  };
  return { transactions, stats, source };
}

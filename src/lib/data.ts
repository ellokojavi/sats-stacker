import fs from "fs";
import path from "path";
import type { PricePoint, EtlResult } from "./types";
import { normalizeFiles, type NamedFile } from "./etl/pipeline";

/** Recursively collect every .csv file under a directory as in-memory files. */
function collectCsvFiles(dir: string): NamedFile[] {
  const files: NamedFile[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCsvFiles(full));
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      files.push({ name: entry.name, content: fs.readFileSync(full, "utf-8") });
    }
  }
  return files;
}

/** The bundled synthetic demo ledger (data/raw). Always available. */
export function loadDemoLedger(): EtlResult {
  const files = collectCsvFiles(path.join(process.cwd(), "data", "raw"));
  return normalizeFiles(files, "demo");
}

/**
 * The real ledger from data/private, if the user has dropped CSVs there.
 * Returns null when the folder is empty so the app stays in demo mode.
 */
export function loadPrivateLedger(): EtlResult | null {
  const files = collectCsvFiles(path.join(process.cwd(), "data", "private"));
  if (files.length === 0) return null;
  return normalizeFiles(files, "private");
}

/** Load the weekly BTC price history used by the charts. */
export function loadPriceHistory(): PricePoint[] {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "btc_price_history.json"),
    "utf-8",
  );
  return JSON.parse(raw) as PricePoint[];
}

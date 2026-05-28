import type { EtlResult, ViewMode } from "./types";

/**
 * localStorage persistence for the browser-import feature. The user opted in
 * to remembering imported data on this device; this keeps both the imported
 * ledger and the chosen view mode between visits. Every function is a safe
 * no-op when storage is unavailable.
 */

const LEDGER_KEY = "sats-stacker.ledger.v1";
const MODE_KEY = "sats-stacker.mode.v1";

export function saveImportedLedger(result: EtlResult): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(result));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function loadImportedLedger(): EtlResult | null {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EtlResult;
    if (
      parsed &&
      Array.isArray(parsed.transactions) &&
      parsed.transactions.length > 0
    ) {
      // Defensive: ledgers saved before the import-summary fields existed
      // won't have files/firstDate/lastDate/importedAt. Backfill so the UI
      // doesn't crash on old data.
      const stats = parsed.stats ?? ({} as EtlResult["stats"]);
      const txns = parsed.transactions;
      const firstDate =
        stats.firstDate ?? (txns.length > 0 ? txns[0].date : null);
      const lastDate =
        stats.lastDate ?? (txns.length > 0 ? txns[txns.length - 1].date : null);
      parsed.stats = {
        ...stats,
        files: Array.isArray(stats.files) ? stats.files : [],
        firstDate,
        lastDate,
        importedAt: stats.importedAt ?? new Date().toISOString(),
        byExchange: (stats.byExchange ?? []).map((row) => ({
          ...row,
          firstDate: row.firstDate ?? null,
          lastDate: row.lastDate ?? null,
        })),
      };
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearImportedLedger(): void {
  try {
    localStorage.removeItem(LEDGER_KEY);
  } catch {
    /* non-fatal */
  }
}

export function saveMode(mode: ViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* non-fatal */
  }
}

export function loadMode(): ViewMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "demo" || value === "real" ? value : null;
  } catch {
    return null;
  }
}

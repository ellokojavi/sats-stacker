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

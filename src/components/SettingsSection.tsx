"use client";

import { useState } from "react";
import type {
  EtlResult,
  EtlStats,
  Transaction,
  ViewMode,
} from "@/lib/types";
import {
  buildLedgerCsv,
  downloadTextFile,
  ledgerFilename,
} from "@/lib/exportCsv";
import { ImportDropzone } from "./ImportDropzone";
import { ImportSummary } from "./ImportSummary";
import { Panel } from "./Panel";

/**
 * General settings tab. Hosts the data-loading controls (mode toggle, CSV
 * import, clear) and surfaces an ImportSummary so the user can see *what's
 * currently loaded* at any time — not just the moment they imported it.
 */
export function SettingsSection({
  mode,
  onModeChange,
  activeStats,
  activeTransactions,
  source,
  imported,
  privateLedger,
  lastImportStats,
  onImport,
  onClearImported,
  onRemoveImportedFile,
  onClearImportedUnrecognized,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  /** Stats for whatever ledger the dashboard is currently rendering. */
  activeStats: EtlStats;
  /** Transactions for the active ledger — used for the CSV export. */
  activeTransactions: Transaction[];
  /** Where the active ledger originated. */
  source: "demo" | "private" | "imported";
  /** Whether the user has imported a ledger in this browser. */
  imported: EtlResult | null;
  /** Whether a private filesystem ledger is available. */
  privateLedger: EtlResult | null;
  /** Stats from the most recent in-browser CSV import (sticky across reloads). */
  lastImportStats: EtlStats | null;
  onImport: (result: EtlResult) => void;
  onClearImported: () => void;
  /** Remove a single unrecognized file from the imported ledger's record. */
  onRemoveImportedFile: (index: number) => void;
  /** Remove all unrecognized files from the imported ledger's record. */
  onClearImportedUnrecognized: () => void;
}) {
  const [showImporter, setShowImporter] = useState(
    source === "demo" && !imported,
  );

  const sourceLabel =
    source === "demo"
      ? "Synthetic demo data"
      : source === "imported"
        ? "Your imported CSVs (stored in this browser)"
        : "Your private CSVs (data/private/)";

  function handleDownload() {
    const csv = buildLedgerCsv(activeTransactions);
    downloadTextFile(ledgerFilename(source), csv);
  }

  // Only the in-browser imported ledger can be mutated from this UI — demo
  // and private ledgers are read at build time and shouldn't be touched.
  const canEditImportedFiles = source === "imported";

  return (
    <div className="space-y-3">
      <Panel title="Data source">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
            <span className="text-muted">Currently loaded:</span>
            <span className="text-ink">{sourceLabel}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                mode === "real"
                  ? "border-up/40 text-up"
                  : "border-bitcoin/40 text-bitcoin"
              }`}
            >
              {mode === "real" ? "Real" : "Demo"}
            </span>
          </div>

          <div
            className="inline-flex items-center rounded-full border border-edge p-0.5"
            role="group"
            aria-label="Data mode"
          >
            <button
              type="button"
              onClick={() => onModeChange("demo")}
              aria-pressed={mode === "demo"}
              className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                mode === "demo"
                  ? "bg-bitcoin/20 text-bitcoin"
                  : "text-muted hover:text-ink"
              }`}
            >
              Demo data
            </button>
            <button
              type="button"
              onClick={() => onModeChange("real")}
              aria-pressed={mode === "real"}
              className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                mode === "real"
                  ? "bg-up/20 text-up"
                  : "text-muted hover:text-ink"
              }`}
            >
              Real data
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-faint">
            Demo data is the synthetic ledger bundled with the app. Real mode
            uses CSV exports you&apos;ve dropped here — they&apos;re parsed entirely in
            your browser, never uploaded, and remembered on this device.
          </p>
        </div>
      </Panel>

      <Panel title="Import exchange CSVs">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
            <span className="text-muted">
              Strike · Coinbase · Cash App · Swan are auto-detected.
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImporter((o) => !o)}
                className="rounded border border-edge px-2.5 py-1 text-[11px] text-ink hover:bg-edge"
              >
                {showImporter ? "Hide importer" : imported ? "Replace CSVs" : "Add CSVs"}
              </button>
              {imported && (
                <button
                  type="button"
                  onClick={() => {
                    onClearImported();
                    setShowImporter(false);
                  }}
                  className="rounded border border-edge px-2.5 py-1 text-[11px] text-muted hover:border-down/60 hover:text-down"
                >
                  Clear imported data
                </button>
              )}
            </div>
          </div>

          {showImporter && (
            <ImportDropzone
              onImport={(result) => {
                onImport(result);
                setShowImporter(false);
              }}
            />
          )}

          {!showImporter && !imported && privateLedger === null && (
            <p className="text-[11px] text-faint">
              No real ledger loaded yet. Click <span className="text-ink">Add CSVs</span>{" "}
              above to import your transaction history.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Export master report">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-md text-[12px] leading-relaxed text-muted">
            Download every transaction the ETL pipeline produced from the
            currently loaded data as a single CSV — useful for feeding the
            normalized ledger into your own bookkeeping, spreadsheet, or tax
            software.{" "}
            <span className="text-faint">
              Columns: id, date, exchange, action, btc, usd, fees.
            </span>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={activeTransactions.length === 0}
            className="rounded border border-bitcoin/60 px-3 py-1.5 text-[12px] text-bitcoin hover:bg-bitcoin/10 disabled:opacity-50"
          >
            Download CSV ({activeTransactions.length.toLocaleString()})
          </button>
        </div>
      </Panel>

      <ImportSummary
        stats={activeStats}
        title="Currently loaded data"
        intro={
          source === "demo"
            ? "What the demo ledger contains — exchanges, files, and the timeframe each one covers."
            : "What the dashboard is currently rendering from."
        }
        onRemoveFile={
          canEditImportedFiles ? onRemoveImportedFile : undefined
        }
        onClearUnrecognized={
          canEditImportedFiles ? onClearImportedUnrecognized : undefined
        }
      />

      {lastImportStats && source !== "imported" && (
        <ImportSummary
          stats={lastImportStats}
          title="Last CSV import (not currently active)"
          intro="You imported these CSVs earlier in this browser. Switch to Real mode to see them on the dashboard."
        />
      )}
    </div>
  );
}

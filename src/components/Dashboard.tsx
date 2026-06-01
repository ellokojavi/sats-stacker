"use client";

import { useEffect, useMemo, useState } from "react";
import type { EtlResult, PricePoint, ViewMode } from "@/lib/types";
import { computeSnapshot, computeHoldingsSeries } from "@/lib/portfolio";
import {
  computeLots,
  computeYearly,
  computeHalvingCohorts,
  computeProfitability,
  computeCagr,
  computeExchangeBreakdown,
} from "@/lib/analytics";
import { computePowerLaw } from "@/lib/powerlaw";
import { computeQuantileBands } from "@/lib/quantileBands";
import {
  loadImportedLedger,
  saveImportedLedger,
  clearImportedLedger,
  loadMode,
  saveMode,
  loadRawFiles,
  saveRawFiles,
} from "@/lib/importStore";
import {
  normalizeFiles,
  mergeEtlResults,
  type NamedFile,
} from "@/lib/etl/pipeline";
import { UnitProvider } from "@/lib/unit";
import { TopBar } from "./TopBar";
import { RealModeEmptyState } from "./RealModeEmptyState";
import { SnapshotGrid } from "./SnapshotGrid";
import { BuyHeatmap } from "./BuyHeatmap";
import { HoldingsChart } from "./HoldingsChart";
import { SubmarineChart } from "./SubmarineChart";
import { YearlyTable } from "./YearlyTable";
import { HalvingCohorts } from "./HalvingCohorts";
import { TimeMachine } from "./TimeMachine";
import { ExchangeBreakdown } from "./ExchangeBreakdown";
import { ProfitabilityBar } from "./ProfitabilityBar";
import { CapitalEfficiency } from "./CapitalEfficiency";
import { HallOfFame } from "./HallOfFame";
import { TransactionsTable } from "./TransactionsTable";
import { ProjectionSection } from "./ProjectionSection";
import { TaxSection } from "./TaxSection";
import { WhatIfSection } from "./WhatIfSection";
import { SettingsSection } from "./SettingsSection";

type TabId =
  | "overview"
  | "performance"
  | "whatif"
  | "projection"
  | "tax"
  | "ledger"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "whatif", label: "What if?" },
  // "Projection" replaced the old "Power Law" tab — it now hosts a
  // model toggle (Power Law vs Quantile Bands) so the same charts can be
  // viewed under either trajectory model.
  { id: "projection", label: "Projection" },
  { id: "tax", label: "Tax" },
  { id: "ledger", label: "Ledger" },
  { id: "settings", label: "Settings" },
];

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";


export function Dashboard({
  demoLedger,
  privateLedger,
  priceHistory,
  serverPrice,
}: {
  demoLedger: EtlResult;
  privateLedger: EtlResult | null;
  priceHistory: PricePoint[];
  serverPrice: number;
}) {
  const [mode, setMode] = useState<ViewMode>(privateLedger ? "real" : "demo");
  const [imported, setImported] = useState<EtlResult | null>(null);
  // Raw NamedFile[] backing the imported ledger — the source of truth.
  // When the user appends another CSV, we merge by file name into this list
  // and re-run the ETL over the union.
  const [importedFiles, setImportedFiles] = useState<NamedFile[]>([]);
  // One-shot feedback rendered next to the Settings importer after a drop:
  // tells the user how many files were merged, replaced, or skipped.
  const [importMessage, setImportMessage] = useState<{
    tone: "info" | "warn";
    text: string;
  } | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  // On mobile we collapse the secondary Overview panels behind a "Show details"
  // button so a thumb-scroll lands on the headline chart and heatmap, not a
  // wall of tabular data. The toggle has no effect at md+ where everything
  // is visible by default.
  const [overviewShowDetails, setOverviewShowDetails] = useState(false);
  // Imported data lives in localStorage, which the server can't see — so on
  // refresh the SSR pass renders mode="demo" and the client then flips to
  // "real" once useEffect reads localStorage. To avoid the demo→real flash,
  // we gate the dashboard body until we've checked localStorage. If
  // privateLedger exists (server-detected real data), the initial mode is
  // already correct and there's nothing to wait for.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedLedger = loadImportedLedger();
    if (savedLedger) setImported(savedLedger);
    const savedFiles = loadRawFiles();
    if (savedFiles.length > 0) setImportedFiles(savedFiles);
    const savedMode = loadMode();
    // Only honor saved "demo" if no real data is available — otherwise
    // imported data should default to real mode on refresh, matching the
    // initialization rule for server-detected privateLedger.
    if (savedMode === "real" || (savedMode === "demo" && !savedLedger && !privateLedger)) {
      setMode(savedMode);
    } else if (savedLedger) {
      setMode("real");
    }
    setHydrated(true);
  }, [privateLedger]);

  const realLedger = imported ?? privateLedger;
  const showEmptyState = mode === "real" && realLedger === null;
  const activeLedger =
    mode === "real" && realLedger ? realLedger : demoLedger;
  const txns = activeLedger.transactions;

  const bundled = priceHistory[priceHistory.length - 1];
  // serverPrice is fetched live on the server at page-render time (60s ISR
  // cache), so it's already the real price — no client-side flash.
  const [price, setPrice] = useState(serverPrice);
  const [live, setLive] = useState(true);

  useEffect(() => {
    // Poll every 60 s so charts and tables stay current during long sessions.
    // price → useMemo chain → all derived values recompute automatically.
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) return;
        const data = await res.json();
        const p = data?.bitcoin?.usd;
        if (!cancelled && typeof p === "number" && p > 0) {
          setPrice(p);
          setLive(true);
        }
      } catch {
        /* offline or rate-limited — keep current price */
      }
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ── Time-machine cursor ────────────────────────────────────────────────
  // Defaults to "today" (the bundled price-history's last point). When the
  // user drags the cursor backwards, we re-derive every analytic against
  // the historical price for that day. The TopBar and UnitProvider keep
  // showing the *real* live price so the unit toggle's BTC↔sats math
  // doesn't wobble while scrubbing.
  const [cursorDate, setCursorDate] = useState<string>(
    bundled.date.slice(0, 10),
  );

  const todayIso = bundled.date.slice(0, 10);
  const isCursorToday = cursorDate >= todayIso;

  const cursorHistoricalPrice = useMemo(() => {
    if (priceHistory.length === 0) return price;
    // Bisect: largest price-day <= cursorDate.
    let lo = 0;
    let hi = priceHistory.length - 1;
    if (cursorDate < priceHistory[0].date.slice(0, 10)) return priceHistory[0].price;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (priceHistory[mid].date.slice(0, 10) <= cursorDate) lo = mid;
      else hi = mid - 1;
    }
    return priceHistory[lo].price;
  }, [priceHistory, cursorDate, price]);

  // The price + as-of date the analytics see. When the cursor is at today,
  // use the live price (so KPIs match the header to the cent); otherwise
  // use the historical close from the bundled series.
  const effectivePrice = isCursorToday ? price : cursorHistoricalPrice;
  const effectiveAsOf = isCursorToday ? bundled.date : cursorDate;

  // For the holdings series, when time-traveling we truncate the curve at
  // the cursor — showing the future portfolio value of past buys would be
  // misleading. When the cursor is at today, leave the series untouched
  // so the live price restates the rightmost point as before.
  const cursorPriceHistory = useMemo(() => {
    if (isCursorToday) return priceHistory;
    return priceHistory.filter(
      (p) => p.date.slice(0, 10) <= cursorDate,
    );
  }, [priceHistory, cursorDate, isCursorToday]);

  // Likewise drop any transactions that happened after the cursor — a buy
  // hasn't happened yet from the cursor's perspective.
  const effectiveTxns = useMemo(() => {
    if (isCursorToday) return txns;
    return txns.filter((t) => t.date.slice(0, 10) <= cursorDate);
  }, [txns, cursorDate, isCursorToday]);

  const snapshot = useMemo(
    () => computeSnapshot(effectiveTxns, effectivePrice, effectiveAsOf),
    [effectiveTxns, effectivePrice, effectiveAsOf],
  );
  const series = useMemo(
    () =>
      computeHoldingsSeries(
        effectiveTxns,
        cursorPriceHistory,
        isCursorToday ? price : effectivePrice,
      ),
    [effectiveTxns, cursorPriceHistory, isCursorToday, price, effectivePrice],
  );
  const lots = useMemo(
    () => computeLots(effectiveTxns, effectivePrice, effectiveAsOf),
    [effectiveTxns, effectivePrice, effectiveAsOf],
  );
  const yearly = useMemo(
    () => computeYearly(effectiveTxns, effectivePrice, effectiveAsOf),
    [effectiveTxns, effectivePrice, effectiveAsOf],
  );
  const cohorts = useMemo(
    () => computeHalvingCohorts(effectiveTxns, effectivePrice, effectiveAsOf),
    [effectiveTxns, effectivePrice, effectiveAsOf],
  );
  const profitability = useMemo(() => computeProfitability(lots), [lots]);
  const cagr = useMemo(() => computeCagr(lots), [lots]);
  const exchanges = useMemo(
    () => computeExchangeBreakdown(effectiveTxns, effectivePrice),
    [effectiveTxns, effectivePrice],
  );
  // Projection models always use the full price history + live price —
  // they describe the network, not the user's portfolio, and shouldn't get
  // foreshortened by the time cursor. We compute both up front so the
  // section's in-component toggle switches instantly without recomputing.
  const projectionModels = useMemo(
    () => ({
      powerlaw: computePowerLaw({
        priceHistory,
        currentPrice: price,
        asOf: bundled.date,
      }),
      quantile: computeQuantileBands({
        priceHistory,
        currentPrice: price,
        asOf: bundled.date,
      }),
    }),
    [priceHistory, price, bundled.date],
  );

  function changeMode(next: ViewMode) {
    setMode(next);
    saveMode(next);
  }

  /**
   * Commit a new raw-file pool: re-run the ETL, persist both the raw files
   * and the derived ledger, switch into real mode, and bounce the user to
   * Settings so the import summary is the first thing they see.
   *
   * `recognizedAdded` counts files in this drop that mapped to a known
   * exchange (used for the "added N file(s)" toast).
   */
  function commitFiles(
    nextFiles: NamedFile[],
    opts: {
      recognizedAdded?: number;
      replacedNames?: string[];
      skippedNames?: string[];
      kind: "append" | "replace";
    },
  ) {
    const result = normalizeFiles(nextFiles, "imported");
    setImportedFiles(nextFiles);
    saveRawFiles(nextFiles);
    setImported(result);
    saveImportedLedger(result);
    setMode("real");
    saveMode("real");
    setTab("settings");

    // Build a one-line toast for the Settings importer.
    const parts: string[] = [];
    if (opts.kind === "replace") {
      parts.push(
        `Replaced your imported data with ${result.stats.filesIngested} file${
          result.stats.filesIngested === 1 ? "" : "s"
        }.`,
      );
    } else if (opts.recognizedAdded && opts.recognizedAdded > 0) {
      parts.push(
        `Added ${opts.recognizedAdded} file${
          opts.recognizedAdded === 1 ? "" : "s"
        } to your pool.`,
      );
    }
    if (opts.replacedNames && opts.replacedNames.length > 0) {
      parts.push(
        `Re-imported ${opts.replacedNames.length} existing file${
          opts.replacedNames.length === 1 ? "" : "s"
        } (${opts.replacedNames.join(", ")}).`,
      );
    }
    if (opts.skippedNames && opts.skippedNames.length > 0) {
      parts.push(
        `Skipped ${opts.skippedNames.length} unrecognized file${
          opts.skippedNames.length === 1 ? "" : "s"
        }.`,
      );
    }
    setImportMessage(
      parts.length > 0
        ? {
            tone:
              opts.skippedNames && opts.skippedNames.length > 0
                ? "warn"
                : "info",
            text: parts.join(" "),
          }
        : null,
    );
  }

  /**
   * Replace the current imported pool with whatever just got dropped.
   * Used by the real-mode empty state (no existing pool) and the explicit
   * "Replace all CSVs" action in Settings.
   */
  function handleReplaceFiles(newFiles: NamedFile[]) {
    if (newFiles.length === 0) return;
    commitFiles(newFiles, { kind: "replace" });
  }

  /**
   * Append the just-dropped files to the existing imported pool.
   *
   * Two paths, depending on whether we have the raw bytes for what's
   * already loaded:
   *
   *  • **Raw-file pool present** (post-upgrade path) — dedupe by file name
   *    (re-dropping `strike-2025.csv` replaces just that file), then re-run
   *    the ETL over the union. Clean and round-trippable.
   *
   *  • **Raw-file pool empty but an imported ledger exists** (legacy path —
   *    the user imported before raw-file persistence shipped) — we can't
   *    re-ETL over files we don't have, so we ETL the new files alone,
   *    then merge the two ledgers at the transaction level (dedupe by id).
   *    The new files go into the raw-file pool so subsequent appends use
   *    the clean path. **This is the path that previously, wrongly,
   *    fell through to a destructive replace.**
   *
   *  • **Nothing imported at all** — semantically a first import.
   */
  function handleAppendFiles(newFiles: NamedFile[]) {
    if (newFiles.length === 0) return;
    const existing = importedFiles;

    if (existing.length === 0 && imported) {
      // Legacy path — preserve existing data via a transaction-level merge.
      const newResult = normalizeFiles(newFiles, "imported");
      const merged = mergeEtlResults(imported, newResult);
      setImportedFiles(newFiles);
      saveRawFiles(newFiles);
      setImported(merged);
      saveImportedLedger(merged);
      setMode("real");
      saveMode("real");
      setTab("settings");
      const recognized = newResult.stats.filesIngested;
      const skipped = newResult.stats.filesSkipped;
      const parts: string[] = [];
      if (recognized > 0) {
        parts.push(
          `Added ${recognized} file${recognized === 1 ? "" : "s"} to your pool.`,
        );
      }
      if (skipped > 0) {
        parts.push(
          `Skipped ${skipped} unrecognized file${skipped === 1 ? "" : "s"}.`,
        );
      }
      parts.push(
        "Files you imported before this update are preserved at the transaction level but can't be removed individually.",
      );
      setImportMessage({
        tone: skipped > 0 ? "warn" : "info",
        text: parts.join(" "),
      });
      return;
    }

    if (existing.length === 0) {
      // Truly nothing to append to — first import.
      commitFiles(newFiles, { kind: "replace" });
      return;
    }

    // Clean path: dedupe by file name, re-ETL over the union.
    const existingByName = new Map(existing.map((f) => [f.name, f]));
    const replacedNames: string[] = [];
    for (const f of newFiles) {
      if (existingByName.has(f.name)) replacedNames.push(f.name);
      existingByName.set(f.name, f);
    }
    const merged = Array.from(existingByName.values());
    // We can't know "skipped" (unrecognized) until ETL runs — derive it from
    // the result by comparing the new file names against the recognized set.
    const result = normalizeFiles(merged, "imported");
    const recognizedNames = new Set(
      result.stats.files.filter((f) => f.recognized).map((f) => f.fileName),
    );
    const newRecognized = newFiles.filter((f) =>
      recognizedNames.has(f.name),
    ).length;
    const newSkippedNames = newFiles
      .filter((f) => !recognizedNames.has(f.name))
      .map((f) => f.name);
    // commitFiles re-normalizes — that's a few ms wasted, but keeps the
    // commit path single-sourced. The repeat ETL is over a small file list.
    commitFiles(merged, {
      kind: "append",
      recognizedAdded: newRecognized - replacedNames.length,
      replacedNames,
      skippedNames: newSkippedNames,
    });
  }

  function handleClear() {
    setImported(null);
    setImportedFiles([]);
    clearImportedLedger();
    setImportMessage(null);
    if (!privateLedger) {
      setMode("demo");
      saveMode("demo");
    }
  }

  /**
   * Remove a single file from the imported pool — recognized or not. For
   * recognized files we re-run the ETL so the dashboard reflects the
   * deletion; for unrecognized files we only need to update the FileImport
   * row.
   */
  function handleRemoveImportedFile(index: number) {
    if (!imported) return;
    const file = imported.stats.files[index];
    if (!file) return;
    // If we have the raw files cached, prefer re-running the ETL over a
    // smaller pool — that keeps the FileImport accounting correct for both
    // recognized and unrecognized rows.
    if (importedFiles.length > 0) {
      const nextFiles = importedFiles.filter((f) => f.name !== file.fileName);
      if (nextFiles.length === importedFiles.length) {
        // File isn't in the raw pool (older imports pre-rawFiles). Fall back
        // to the legacy stats-only edit for the unrecognized case.
        if (!file.recognized) {
          const nextStats = {
            ...imported.stats,
            files: imported.stats.files.filter((_, i) => i !== index),
            filesSkipped: Math.max(0, imported.stats.filesSkipped - 1),
          };
          const next = { ...imported, stats: nextStats };
          setImported(next);
          saveImportedLedger(next);
        }
        return;
      }
      if (nextFiles.length === 0) {
        handleClear();
        return;
      }
      const result = normalizeFiles(nextFiles, "imported");
      setImportedFiles(nextFiles);
      saveRawFiles(nextFiles);
      setImported(result);
      saveImportedLedger(result);
      return;
    }
    // Legacy path: no raw files cached. Only safe action is dropping an
    // unrecognized row from the stats (no transactions to recompute).
    if (!file.recognized) {
      const nextFiles = imported.stats.files.filter((_, i) => i !== index);
      const nextStats = {
        ...imported.stats,
        files: nextFiles,
        filesSkipped: Math.max(0, imported.stats.filesSkipped - 1),
      };
      const next = { ...imported, stats: nextStats };
      setImported(next);
      saveImportedLedger(next);
    }
  }

  function handleClearImportedUnrecognized() {
    if (!imported) return;
    if (importedFiles.length > 0) {
      const unrecognizedNames = new Set(
        imported.stats.files.filter((f) => !f.recognized).map((f) => f.fileName),
      );
      const nextFiles = importedFiles.filter(
        (f) => !unrecognizedNames.has(f.name),
      );
      if (nextFiles.length === importedFiles.length) {
        // None of the cached raw files match the unrecognized rows — fall
        // through to the legacy stats-only path so the user can still clear
        // them.
      } else {
        const result = normalizeFiles(nextFiles, "imported");
        setImportedFiles(nextFiles);
        saveRawFiles(nextFiles);
        setImported(result);
        saveImportedLedger(result);
        return;
      }
    }
    const recognized = imported.stats.files.filter((f) => f.recognized);
    if (recognized.length === imported.stats.files.length) return;
    const nextStats = {
      ...imported.stats,
      files: recognized,
      filesSkipped: 0,
    };
    const next = { ...imported, stats: nextStats };
    setImported(next);
    saveImportedLedger(next);
  }

  const s = activeLedger.stats;
  const isDemo = activeLedger.source === "demo";

  // If the server didn't detect real data, we don't yet know whether the
  // client has imported data in localStorage. Render an empty shell during
  // that microframe rather than flashing the demo dashboard.
  if (!hydrated && !privateLedger) {
    return <main className="mx-auto max-w-5xl px-5 py-8" aria-hidden="true" />;
  }

  return (
    <UnitProvider price={price}>
    <main className="mx-auto max-w-5xl px-5 py-8">
      <TopBar
        mode={mode}
        onModeChange={changeMode}
        price={price}
        live={live}
        asOf={bundled.date}
        onLogoClick={() => setTab("overview")}
      />

      {showEmptyState ? (
        <div className="mt-4">
          <RealModeEmptyState
            onFiles={handleReplaceFiles}
            onBackToDemo={() => changeMode("demo")}
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <SnapshotGrid snapshot={snapshot} />
          </div>

          <nav
            className="mt-4 flex gap-1 border-b border-edge"
            role="tablist"
            aria-label="Reports"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-[12px] transition-colors ${
                  tab === t.id
                    ? "border-bitcoin text-bitcoin"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="mt-3">
            {tab === "overview" && (
              <div className="space-y-3">
                <TimeMachine
                  prices={priceHistory}
                  cursorIso={cursorDate}
                  todayIso={todayIso}
                  onCursorChange={setCursorDate}
                />
                <HoldingsChart data={series} />
                <BuyHeatmap txns={effectiveTxns} />
                {/* Secondary panel: visible by default at md+, collapsed
                    behind a "Show details" button on mobile. The button is
                    hidden at md+ so it doesn't add noise on desktop. */}
                <button
                  type="button"
                  onClick={() => setOverviewShowDetails((v) => !v)}
                  aria-expanded={overviewShowDetails}
                  className="block w-full rounded border border-edge bg-panel px-3 py-2 text-[12px] font-medium text-muted hover:text-ink md:hidden"
                >
                  {overviewShowDetails
                    ? "Hide per-exchange breakdown"
                    : "Show per-exchange breakdown"}
                </button>
                <div
                  className={
                    overviewShowDetails ? "block" : "hidden md:block"
                  }
                >
                  <ExchangeBreakdown rows={exchanges} />
                </div>
              </div>
            )}
            {tab === "performance" && (
              <div className="space-y-3">
                {/* SubmarineChart and TaxSection take `currentPrice` directly;
                    pass the time-machine's effective price so they stay in
                    sync with the lots they're rendered against. */}
                <SubmarineChart lots={lots} currentPrice={effectivePrice} />
                <YearlyTable rows={yearly} />
                <HalvingCohorts rows={cohorts} />
                <ProfitabilityBar tiers={profitability} />
                <CapitalEfficiency cagr={cagr} />
                <HallOfFame lots={lots} />
              </div>
            )}
            {tab === "whatif" && (
              <WhatIfSection
                txns={txns}
                prices={priceHistory}
                currentPrice={price}
                asOf={bundled.date}
              />
            )}
            {tab === "projection" && (
              <ProjectionSection
                models={projectionModels}
                snapshot={snapshot}
              />
            )}
            {tab === "tax" && (
              <TaxSection lots={lots} currentPrice={effectivePrice} />
            )}
            {tab === "ledger" && (
              <TransactionsTable
                transactions={effectiveTxns}
                source={activeLedger.source}
              />
            )}
            {tab === "settings" && (
              <SettingsSection
                mode={mode}
                onModeChange={changeMode}
                activeStats={s}
                activeTransactions={txns}
                source={activeLedger.source}
                imported={imported}
                privateLedger={privateLedger}
                lastImportStats={imported?.stats ?? null}
                priceHistory={priceHistory}
                onAppendFiles={handleAppendFiles}
                onReplaceFiles={handleReplaceFiles}
                onClearImported={handleClear}
                onRemoveImportedFile={handleRemoveImportedFile}
                onClearImportedUnrecognized={handleClearImportedUnrecognized}
                importMessage={importMessage}
                onDismissImportMessage={() => setImportMessage(null)}
              />
            )}
          </div>

          <footer className="mt-6 text-[11px] leading-relaxed text-faint">
            {isDemo ? (
              <>
                {s.total.toLocaleString()} transactions normalized by the ETL
                pipeline from {s.filesIngested} raw exchange exports across
                Strike, Coinbase, Cash App and Swan · {s.duplicatesRemoved}{" "}
                duplicate rows removed · all figures are synthetic demo data ·{" "}
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className="text-bitcoin hover:underline"
                >
                  Load your own CSVs in Settings
                </button>
                .
              </>
            ) : (
              <>
                {s.total.toLocaleString()} of your transactions normalized from{" "}
                {s.filesIngested} exchange{" "}
                {s.filesIngested === 1 ? "export" : "exports"}
                {s.filesSkipped > 0
                  ? ` (${s.filesSkipped} unrecognized file${s.filesSkipped === 1 ? "" : "s"} skipped)`
                  : ""}{" "}
                · parsed locally, never uploaded ·{" "}
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className="text-bitcoin hover:underline"
                >
                  Manage data in Settings
                </button>
                .
              </>
            )}
          </footer>
        </>
      )}
    </main>
    </UnitProvider>
  );
}

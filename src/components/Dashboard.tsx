"use client";

import { useEffect, useMemo, useState } from "react";
import type { EtlResult, PricePoint, ViewMode } from "@/lib/types";
import { computeSnapshot, computeHoldingsSeries } from "@/lib/portfolio";
import {
  computeLots,
  computeYearly,
  computeProfitability,
  computeCagr,
  computeExchangeBreakdown,
} from "@/lib/analytics";
import { computePowerLaw } from "@/lib/powerlaw";
import {
  loadImportedLedger,
  saveImportedLedger,
  clearImportedLedger,
  loadMode,
  saveMode,
} from "@/lib/importStore";
import { TopBar } from "./TopBar";
import { RealModeEmptyState } from "./RealModeEmptyState";
import { SnapshotGrid } from "./SnapshotGrid";
import { HoldingsChart } from "./HoldingsChart";
import { SubmarineChart } from "./SubmarineChart";
import { YearlyTable } from "./YearlyTable";
import { ExchangeBreakdown } from "./ExchangeBreakdown";
import { ProfitabilityBar } from "./ProfitabilityBar";
import { CapitalEfficiency } from "./CapitalEfficiency";
import { HallOfFame } from "./HallOfFame";
import { TransactionsTable } from "./TransactionsTable";
import { PowerLawSection } from "./PowerLawSection";
import { TaxSection } from "./TaxSection";
import { WhatIfSection } from "./WhatIfSection";
import { SettingsSection } from "./SettingsSection";

type TabId =
  | "overview"
  | "performance"
  | "whatif"
  | "powerlaw"
  | "tax"
  | "ledger"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "whatif", label: "What if?" },
  { id: "powerlaw", label: "Power Law" },
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
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    const savedLedger = loadImportedLedger();
    if (savedLedger) setImported(savedLedger);
    const savedMode = loadMode();
    if (savedMode) setMode(savedMode);
  }, []);

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

  const snapshot = useMemo(
    () => computeSnapshot(txns, price, bundled.date),
    [txns, price, bundled.date],
  );
  const series = useMemo(
    () => computeHoldingsSeries(txns, priceHistory, price),
    [txns, priceHistory, price],
  );
  const lots = useMemo(
    () => computeLots(txns, price, bundled.date),
    [txns, price, bundled.date],
  );
  const yearly = useMemo(
    () => computeYearly(txns, price, bundled.date),
    [txns, price, bundled.date],
  );
  const profitability = useMemo(() => computeProfitability(lots), [lots]);
  const cagr = useMemo(() => computeCagr(lots), [lots]);
  const exchanges = useMemo(
    () => computeExchangeBreakdown(txns, price),
    [txns, price],
  );
  const powerLaw = useMemo(
    () => computePowerLaw(priceHistory, price, bundled.date),
    [priceHistory, price, bundled.date],
  );

  function changeMode(next: ViewMode) {
    setMode(next);
    saveMode(next);
  }
  function handleImport(result: EtlResult) {
    setImported(result);
    saveImportedLedger(result);
    setMode("real");
    saveMode("real");
    // Drop the user onto the Settings tab right after import so the import
    // summary is the first thing they see — proves what was loaded, from
    // where, and over what timeframe.
    setTab("settings");
  }
  function handleClear() {
    setImported(null);
    clearImportedLedger();
    if (!privateLedger) {
      setMode("demo");
      saveMode("demo");
    }
  }
  /**
   * Drop a single unrecognized file row from the imported ledger's stats.
   * Doesn't touch transactions — unrecognized files contributed none — so we
   * only need to update the bookkeeping and re-save.
   */
  function handleRemoveImportedFile(index: number) {
    if (!imported) return;
    const file = imported.stats.files[index];
    if (!file || file.recognized) return;
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
  function handleClearImportedUnrecognized() {
    if (!imported) return;
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

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <TopBar
        mode={mode}
        onModeChange={changeMode}
        price={price}
        live={live}
        asOf={bundled.date}
      />

      {showEmptyState ? (
        <div className="mt-4">
          <RealModeEmptyState
            onImport={handleImport}
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
                <HoldingsChart data={series} />
                <ExchangeBreakdown rows={exchanges} />
              </div>
            )}
            {tab === "performance" && (
              <div className="space-y-3">
                <SubmarineChart lots={lots} currentPrice={price} />
                <YearlyTable rows={yearly} />
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
            {tab === "powerlaw" && (
              <PowerLawSection data={powerLaw} snapshot={snapshot} />
            )}
            {tab === "tax" && (
              <TaxSection lots={lots} currentPrice={price} />
            )}
            {tab === "ledger" && (
              <TransactionsTable
                transactions={txns}
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
                onImport={handleImport}
                onClearImported={handleClear}
                onRemoveImportedFile={handleRemoveImportedFile}
                onClearImportedUnrecognized={handleClearImportedUnrecognized}
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
  );
}

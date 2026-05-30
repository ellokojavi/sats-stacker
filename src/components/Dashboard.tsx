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
import {
  loadImportedLedger,
  saveImportedLedger,
  clearImportedLedger,
  loadMode,
  saveMode,
} from "@/lib/importStore";
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
  // Power Law fit always uses the full price history + live price — it's
  // a model of the network, not the user's portfolio, and shouldn't get
  // foreshortened by the time cursor.
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
            {tab === "powerlaw" && (
              <PowerLawSection data={powerLaw} snapshot={snapshot} />
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
    </UnitProvider>
  );
}

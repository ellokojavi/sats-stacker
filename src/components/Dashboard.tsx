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
import { ImportDropzone } from "./ImportDropzone";
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

type TabId = "overview" | "performance" | "powerlaw" | "tax" | "ledger";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "powerlaw", label: "Power Law" },
  { id: "tax", label: "Tax" },
  { id: "ledger", label: "Ledger" },
];

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

export function Dashboard({
  demoLedger,
  privateLedger,
  priceHistory,
}: {
  demoLedger: EtlResult;
  privateLedger: EtlResult | null;
  priceHistory: PricePoint[];
}) {
  const [mode, setMode] = useState<ViewMode>(privateLedger ? "real" : "demo");
  const [imported, setImported] = useState<EtlResult | null>(null);
  const [showReplace, setShowReplace] = useState(false);
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
  const [price, setPrice] = useState(bundled.price);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(COINGECKO_URL)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("bad status")),
      )
      .then((data) => {
        const p = data?.bitcoin?.usd;
        if (!cancelled && typeof p === "number" && p > 0) {
          setPrice(p);
          setLive(true);
        }
      })
      .catch(() => {
        /* offline or rate-limited — keep the bundled price */
      });
    return () => {
      cancelled = true;
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
  const yearly = useMemo(() => computeYearly(txns, price), [txns, price]);
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
    setShowReplace(false);
  }
  function handleClear() {
    setImported(null);
    clearImportedLedger();
    setShowReplace(false);
    if (!privateLedger) {
      setMode("demo");
      saveMode("demo");
    }
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
            {tab === "powerlaw" && (
              <PowerLawSection data={powerLaw} snapshot={snapshot} />
            )}
            {tab === "tax" && (
              <TaxSection lots={lots} currentPrice={price} />
            )}
            {tab === "ledger" && <TransactionsTable transactions={txns} />}
          </div>

          {!isDemo && showReplace && (
            <div className="mt-3">
              <ImportDropzone onImport={handleImport} />
            </div>
          )}
          <footer className="mt-6 text-[11px] leading-relaxed text-faint">
            {isDemo ? (
              <>
                {s.total.toLocaleString()} transactions normalized by the ETL
                pipeline from {s.filesIngested} raw exchange exports across
                Strike, Coinbase, Cash App and Swan · {s.duplicatesRemoved}{" "}
                duplicate rows removed · all figures are synthetic demo data.
              </>
            ) : (
              <>
                {s.total.toLocaleString()} of your transactions normalized from{" "}
                {s.filesIngested} exchange{" "}
                {s.filesIngested === 1 ? "export" : "exports"}
                {s.filesSkipped > 0
                  ? ` (${s.filesSkipped} unrecognized file${s.filesSkipped === 1 ? "" : "s"} skipped)`
                  : ""}{" "}
                · {s.duplicatesRemoved} duplicate rows removed · parsed locally,
                never uploaded.{" "}
                <button
                  type="button"
                  onClick={() => setShowReplace((o) => !o)}
                  className="text-bitcoin hover:underline"
                >
                  {showReplace ? "Close" : "Replace CSVs"}
                </button>
                {imported !== null && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-muted hover:text-down"
                    >
                      Clear imported data
                    </button>
                  </>
                )}
              </>
            )}
          </footer>
        </>
      )}
    </main>
  );
}

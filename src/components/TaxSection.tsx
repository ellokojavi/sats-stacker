"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Lot } from "@/lib/types";
import {
  simulateSale,
  summarizeHoldings,
  type CostBasisMethod,
} from "@/lib/tax";
import { formatUsd, formatBtc, formatDateShort } from "@/lib/format";
import { Panel } from "./Panel";
import { MetricCard } from "./MetricCard";

/**
 * Canonical render of `n` as a BTC amount in an input: up to 8 decimals
 * (sat-level), trailing zeros stripped so "0.5" doesn't appear as "0.50000000".
 */
function btcInputValue(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(8).replace(/\.?0+$/, "") || "0";
}

/** Canonical render of `n` as a USD amount in an input — whole dollars. */
function usdInputValue(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toString();
}

const METHODS: CostBasisMethod[] = ["FIFO", "LIFO", "HIFO"];

const METHOD_NOTE: Record<CostBasisMethod, string> = {
  FIFO: "First in, first out — the oldest lots are sold first. The IRS default.",
  LIFO: "Last in, first out — the newest lots are sold first.",
  HIFO: "Highest in, first out — the most expensive lots are sold first, which minimizes the taxable gain.",
};

const MAX_ROWS = 10;

export function TaxSection({
  lots,
  currentPrice,
}: {
  lots: Lot[];
  currentPrice: number;
}) {
  const totalBtc = useMemo(
    () => lots.reduce((sum, l) => sum + l.btc, 0),
    [lots],
  );
  const summary = useMemo(() => summarizeHoldings(lots), [lots]);

  const [method, setMethod] = useState<CostBasisMethod>("FIFO");
  const [sellBtc, setSellBtc] = useState(
    () => Math.round(totalBtc * 0.25 * 1e8) / 1e8,
  );
  const effectiveSell = Math.min(sellBtc, totalBtc);

  // ── Editable BTC / USD inputs ────────────────────────────────────────────
  //
  // The slider gives a quick rough cut. The two inputs below let the user be
  // exact — type a specific BTC amount or a specific USD proceeds number. All
  // three controls drive the same `sellBtc` state through `currentPrice`.
  //
  // We keep draft strings for each input so intermediate typing states like
  // "0." or "" don't get reformatted out from under the user. The skip-next
  // ref is the canonical React pattern for breaking the feedback loop between
  // an onChange that sets shared state and a useEffect that mirrors that
  // shared state back into the input.
  const [btcDraft, setBtcDraft] = useState(() => btcInputValue(effectiveSell));
  const [usdDraft, setUsdDraft] = useState(() =>
    usdInputValue(effectiveSell * currentPrice),
  );
  const skipNextSync = useRef(false);

  // Mirror external changes to sellBtc (slider drag, ledger / price refresh)
  // back into the inputs — unless we set sellBtc from a typing event ourselves,
  // in which case the input drafts are already the source of truth.
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setBtcDraft(btcInputValue(effectiveSell));
    setUsdDraft(usdInputValue(effectiveSell * currentPrice));
  }, [effectiveSell, currentPrice]);

  const commitBtc = (rawBtc: number) => {
    const clamped = Math.max(0, Math.min(rawBtc, totalBtc));
    skipNextSync.current = true;
    setSellBtc(clamped);
    setUsdDraft(usdInputValue(clamped * currentPrice));
  };

  const commitUsd = (rawUsd: number) => {
    if (currentPrice <= 0) return;
    const btc = rawUsd / currentPrice;
    const clamped = Math.max(0, Math.min(btc, totalBtc));
    skipNextSync.current = true;
    setSellBtc(clamped);
    setBtcDraft(btcInputValue(clamped));
  };

  const handleBtcChange = (s: string) => {
    setBtcDraft(s);
    if (s === "") return; // tolerate empty while typing; blur will snap back
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) commitBtc(n);
  };

  const handleUsdChange = (s: string) => {
    setUsdDraft(s);
    if (s === "") return;
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0) commitUsd(n);
  };

  const handleBtcBlur = () => setBtcDraft(btcInputValue(effectiveSell));
  const handleUsdBlur = () =>
    setUsdDraft(usdInputValue(effectiveSell * currentPrice));

  const result = useMemo(
    () => simulateSale(lots, effectiveSell, currentPrice, method),
    [lots, effectiveSell, currentPrice, method],
  );
  const comparison = useMemo(
    () =>
      METHODS.map((m) => ({
        method: m,
        gain: simulateSale(lots, effectiveSell, currentPrice, m).gain,
      })),
    [lots, effectiveSell, currentPrice],
  );

  const ltPct = totalBtc > 0 ? (summary.longTermBtc / totalBtc) * 100 : 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-faint">
        Informational cost-basis estimates — not tax advice. Holding periods
        assume US-style rules: lots held more than one year are long-term.
        Consult a tax professional before filing.
      </p>

      <Panel title="Holding-period breakdown">
        <div className="mb-3 flex h-6 w-full overflow-hidden rounded">
          <div style={{ width: `${ltPct}%` }} className="bg-up" />
          <div style={{ width: `${100 - ltPct}%` }} className="bg-bitcoin" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard
            label="Long-term BTC (>1yr)"
            value={formatBtc(summary.longTermBtc)}
          />
          <MetricCard
            label="Long-term unrealized"
            value={formatUsd(summary.longTermUnrealized)}
            accent={summary.longTermUnrealized >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Short-term BTC (≤1yr)"
            value={formatBtc(summary.shortTermBtc)}
          />
          <MetricCard
            label="Short-term unrealized"
            value={formatUsd(summary.shortTermUnrealized)}
            accent={summary.shortTermUnrealized >= 0 ? "up" : "down"}
          />
        </div>
      </Panel>

      <Panel title="Sell simulator — estimated capital gain">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-md border border-edge p-0.5"
            role="group"
            aria-label="Cost-basis method"
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded px-3 py-1 text-[11px] ${
                  method === m
                    ? "bg-bitcoin/20 text-bitcoin"
                    : "text-muted hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted">{METHOD_NOTE[method]}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-muted">Sell</span>
          <input
            type="range"
            min={0}
            max={totalBtc}
            step={totalBtc > 0 ? totalBtc / 200 : 0.01}
            value={effectiveSell}
            onChange={(e) => setSellBtc(Number(e.target.value))}
            className="min-w-[140px] flex-1 accent-bitcoin"
            aria-label="BTC to sell"
          />
          <div className="flex items-center gap-2">
            {/* BTC input — suffix label tucked inside the right edge */}
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={btcDraft}
                onChange={(e) => handleBtcChange(e.target.value)}
                onBlur={handleBtcBlur}
                min={0}
                max={totalBtc || undefined}
                step={0.00000001}
                aria-label="BTC to sell"
                /* Tailwind arbitrary selectors kill the native spinner
                   buttons that crowd the number; the `appearance:textfield`
                   reset is Firefox's equivalent. */
                className="w-36 rounded border border-edge bg-night py-1 pl-2.5 pr-10 text-right font-mono tabular-nums text-[12px] text-ink focus:border-bitcoin focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-faint">
                BTC
              </span>
            </div>
            {/* USD input — prefix "$" tucked inside the left edge */}
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[11px] text-faint">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={usdDraft}
                onChange={(e) => handleUsdChange(e.target.value)}
                onBlur={handleUsdBlur}
                min={0}
                step={1}
                aria-label="USD proceeds"
                className="w-32 rounded border border-edge bg-night py-1 pl-6 pr-2.5 text-right font-mono tabular-nums text-[12px] text-ink focus:border-bitcoin focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Proceeds" value={formatUsd(result.proceeds)} />
          <MetricCard label="Cost basis" value={formatUsd(result.costBasis)} />
          <MetricCard
            label="Capital gain"
            value={formatUsd(result.gain)}
            accent={result.gain >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Long-term gain"
            value={formatUsd(result.longTermGain)}
            accent={result.longTermGain >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="Short-term gain"
            value={formatUsd(result.shortTermGain)}
            accent={result.shortTermGain >= 0 ? "up" : "down"}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge pt-3 text-[11px]">
          <span className="text-muted">Gain by method:</span>
          {comparison.map((c) => (
            <span
              key={c.method}
              className={c.method === method ? "text-ink" : "text-muted"}
            >
              {c.method}{" "}
              <span className="font-mono">{formatUsd(c.gain)}</span>
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title={`Lots consumed by this sale — ${method} · ${result.matches.length}`}
      >
        {result.matches.length === 0 ? (
          <p className="text-[12px] text-muted">
            Move the slider above to simulate a sale.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-left font-normal">Acquired</th>
                  <th className="py-1.5 text-left font-normal">Source</th>
                  <th className="py-1.5 text-right font-normal">BTC sold</th>
                  <th className="py-1.5 text-right font-normal">Cost basis</th>
                  <th className="py-1.5 text-right font-normal">Gain</th>
                  <th className="py-1.5 text-right font-normal">Term</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.slice(0, MAX_ROWS).map((m, i) => (
                  <tr
                    key={m.lotId || i}
                    className="border-t border-edge text-ink"
                  >
                    <td className="py-1.5 text-left font-mono">
                      {formatDateShort(m.lotDate)}
                    </td>
                    <td className="py-1.5 text-left">{m.source}</td>
                    <td className="py-1.5 text-right font-mono">
                      {m.btc.toFixed(8)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {formatUsd(m.costBasis)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono ${m.gain >= 0 ? "text-up" : "text-down"}`}
                    >
                      {formatUsd(m.gain)}
                    </td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          m.longTerm
                            ? "bg-up/15 text-up"
                            : "bg-bitcoin/15 text-bitcoin"
                        }`}
                      >
                        {m.longTerm ? "long" : "short"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.matches.length > MAX_ROWS && (
              <p className="mt-2 text-[11px] text-faint">
                + {result.matches.length - MAX_ROWS} more lots consumed by this
                sale.
              </p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

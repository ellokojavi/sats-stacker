# Daily briefing — 2026-05-28

Scheduled-task report. Audited the current sats-stacker codebase and identified six capability proposals that would meaningfully extend the app for a recruiter audience without growing the tab count or introducing redundant sections.

## State of the app (snapshot)

- **Phases 1–4 are shipped.** ETL across four exchanges, snapshot KPIs, HODLings, submarine, yearly, profitability, CAGR vs benchmarks, exchange breakdown, hall of fame, buy heatmap, seven What-If strategies (lump-sum, weekly, monthly, dip, halving, oracle), Power Law fit + projections + DCA overlay, FIFO/LIFO/HIFO tax sim with ST/LT split, ledger table, import/export of normalized CSV.
- **Surface:** seven tabs (Overview, Performance, What If?, Power Law, Tax, Ledger, Settings). README roadmap is accurate.
- **Codebase weight:** ~6.9k LOC across `src/`. Biggest files are `PowerLawSection.tsx` (876), `WhatIfSection.tsx` (583), `BuyHeatmap.tsx` (513). Adding another 500-line tab would tip the app from "deep" toward "sprawling."
- **Latent data not yet surfaced:** fees per transaction are normalized by the ETL but never displayed; the `Transaction.action` field exists but the analytics treat every row as a buy; live price + holdings series are precise but there's no risk/volatility derivation.

## Proposals

Ordered by recruiter-signal strength and ease of integration. Each one extends an existing tab — none ships as a new top-level section.

### 1. IRS Form 8949 export (Tax tab)

Most demo portfolio apps stop at theoretical lot math. Generating a Form 8949–shaped CSV (acquisition date, disposal date, proceeds, cost basis, gain/loss, ST/LT) from the existing FIFO/LIFO/HIFO engine demonstrates domain knowledge tax professionals actually use. It also gives the existing `exportCsv.ts` module a second, higher-value export beyond the raw ledger.

- **Placement:** Tax tab, new "Export" panel below the simulator. No new tab.
- **Anti-bloat:** Reuses `tax.ts` lot-matching output; just adds a CSV serializer alongside `buildLedgerCsv`.
- **Effort:** ~150 LOC + tests. The hard work (lot matching) is already done.
- **Recruiter signal:** Strong — shows the app is not just analytical theater but actually usable for filing.

### 2. Realized P/L + tax-loss harvesting hints (Tax tab)

The `Transaction.action` column already distinguishes buys from other actions, but no analytics treat sells as realized events. Add:

- a Realized P/L line that walks any sell rows through the active cost-basis method to produce year-by-year realized gains;
- a "Harvest candidates" card that surfaces the three lots which, if sold today, would lock in the largest loss (or smallest LT gain), with their acquisition dates and current unrealized P/L.

This turns the Tax tab from "what would happen if I sold X BTC" into "here's what your portfolio is doing right now for tax purposes."

- **Placement:** Tax tab, slot between the holding-period breakdown and the sell simulator.
- **Anti-bloat:** Sits in the existing Tax tab — no new home needed. Logic builds on `computeLots`.
- **Effort:** ~200 LOC + tests.
- **Recruiter signal:** Strong — moves the project from "math demo" into "decision support."

### 3. Risk & volatility panel (Performance tab)

The CAGR card benchmarks return vs S&P 500 and Mag7, but there's no risk-adjusted view. Add a small panel with:

- portfolio max drawdown (distinct from the per-lot submarine chart — this is value-of-stack drawdown over time);
- realized 30/90/365-day volatility of the holdings curve;
- a Sharpe-style ratio against a configurable risk-free rate (default: short-term Treasury).

These are standard finance metrics; their absence is a noticeable gap on a portfolio-analyzer pitch to anyone with markets background.

- **Placement:** Performance tab, between `CapitalEfficiency` and `HallOfFame`.
- **Anti-bloat:** Two-tile card. No new dependency. Reuses `computeHoldingsSeries`.
- **Effort:** ~250 LOC + tests.

### 4. Fee drag analysis (Exchange Breakdown panel)

Fees per transaction are normalized by the ETL but never displayed. The Exchange Breakdown table already lists per-exchange BTC, invested, profit, ROI, avg cost — adding a Fees column and a tiny "fee drag on net P/L" line under the table makes the ETL work concretely visible to a reader. Optionally adds one more headline tile: "Lifetime fees paid."

- **Placement:** Extends `ExchangeBreakdown.tsx`. Optional snapshot tile.
- **Anti-bloat:** Zero new sections. Just surfaces data that's already computed and discarded.
- **Effort:** ~80 LOC.
- **Recruiter signal:** Cheap and visible — closes the loop on the ETL narrative.

### 5. Stacking velocity & target tracker (Overview tab)

Add a compact card to Overview:

- current pace (sats/day, $/day) over a user-toggleable window (30/90/365 days);
- a "Target" picker (defaults: 0.1 BTC, 1 BTC, 1M sats, 21M sats);
- ETA at current pace, plus the dollar contribution needed per month to hit the target by a chosen date.

Recruiter-friendly because it's tangible and concrete — "When do I hit 1 BTC?" is the question every stacker actually asks.

- **Placement:** Overview tab, slim card between `SnapshotGrid` and `HoldingsChart`.
- **Anti-bloat:** Replaces nothing but adds value users will look at first. If it grows beyond a card, fold it into `SnapshotGrid` rather than spawning a tab.
- **Effort:** ~200 LOC + tests.

### 6. Benchmark counterfactual portfolios in What If? (deprioritized / monitor for bloat)

The CAGR card already shows the *return* of S&P 500 / Mag7 alongside the portfolio. The What If? tab compares *DCA strategies inside Bitcoin*. A natural extension is "had I DCAed into VOO or QQQ with the same dollars, here's the curve." But:

- this duplicates CAGR's signal in chart form;
- it pulls a third price-history dependency (S&P daily) for marginal additional insight;
- the What If? tab is already the largest single component (583 LOC).

**Recommendation:** skip for now. Re-evaluate only if a recruiter asks "how does your stack compare to traditional assets visually."

## Anti-bloat plan in one paragraph

Every proposal except #6 extends an existing tab. No new top-level tab is added. The risk of bloat is concentrated in two places: (a) the Tax tab gains two new cards under proposals 1 and 2 — keep them visually compact and below the existing simulator so the tab still opens to the headline interaction; (b) the Overview tab gains a velocity card under proposal 5 — if it grows past one row it should fold into `SnapshotGrid` rather than become its own panel. The README roadmap would gain one new entry, framed as "Phase 5 — Realized P/L, fees, risk & goals," with the proposals above as bullets.

## Recommended next move

Phase 5 makes a clean recruiter-narrative beat if shipped together. The lowest-effort, highest-cost-per-LOC win is **#4 (fee drag)** — it closes a visible gap and reinforces the ETL story. The highest recruiter-signal win is **#1 (Form 8949 export)** because it pushes the app from "demo" into "actually useful." Suggested ship order: 4 → 1 → 2 → 5 → 3.

---
*Generated autonomously by the daily-briefing scheduled task. Decisions made along the way: skipped #6 to avoid duplicating CAGR signal; chose to extend existing tabs rather than propose a new "Macro" tab even though hash-rate / halving-countdown widgets would look slick — they'd be noise, not signal, on a recruiter review.*

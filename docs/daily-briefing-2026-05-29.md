# Daily briefing — 2026-05-29

Scheduled-task report. Audited the codebase again and propose six **new** capabilities distinct from yesterday's six. Anti-bloat plan in §3.

## 1. What's changed since yesterday's briefing

Nothing has shipped against any of yesterday's six proposals — no new commits since `fad785d` (the SnapshotGrid 4-col revert). LOC is unchanged at ~6.9k. The roadmap in the README still ends at Phase 4. So:

- Yesterday's proposals (#1 Form 8949 export, #2 Realized P/L + harvesting, #3 Risk panel, #4 Fee drag, #5 Stacking velocity, #6 deprioritized benchmark counterfactuals) **remain open**. The recommended ship order from yesterday (4 → 1 → 2 → 5 → 3) still stands.
- One **structural caveat** discovered while rechecking the data flow: every exchange normalizer in `src/lib/etl/normalize.ts` hard-codes `action: "BUY"`. There are literally no sell rows in the ledger. Yesterday's #2 (Realized P/L on sells) therefore depends on a prior unlocked: either (a) synthetic-data generation of sells, or (b) ETL paths for the non-buy Transaction Types each exchange exports. Worth tracking as proposal **#0 — ETL sell-support** in front of #2.

## 2. New proposals (distinct from yesterday's six)

Ordered by recruiter-signal × ease ratio.

### A. BTC / sats-denominated view toggle

A header toggle next to the live-price chip that flips the entire dashboard between USD and BTC/sats denomination. KPIs, charts, table columns, axes — everything respects the active unit.

- **Why it's strong:** This is the single feature a Bitcoin-literate recruiter notices first. "Number of sats" is the unit that matters to the audience the app implicitly addresses; not supporting it on a project literally named *sats-stacker* is a tell. Also a clean engineering demonstration — pure-function analytics + a unit-aware formatter is the right abstraction, and the codebase is structured to make it cheap.
- **Placement:** Header toggle, in `TopBar.tsx`. Propagates via a small `unit` context to every component that calls `formatUsd` / `formatBtc`.
- **Anti-bloat:** Adds no new section. Replaces formatter call sites with a unit-aware variant. Tab count unchanged.
- **Effort:** ~250 LOC: extend `format.ts` with `formatValue(n, unit)`, add a context, sweep ~30 call sites. No new chart, no new dependency.
- **Recruiter signal:** Very strong. Reads as "this developer understands the domain, not just the math."

### B. "Time-machine" date cursor (Overview)

A draggable date cursor over the HoldingsChart that recomputes every snapshot KPI, lot table, and chart annotation **as if today were that date**. Snap-to-today reset button.

- **Why it's strong:** Demonstrates that every analytic is a pure function over a date-filtered ledger and the current price — i.e., that the pipeline is composable, not just wired-up. A recruiter dragging the slider and watching the whole dashboard re-render in real time is the kind of demo moment screenshots can't deliver.
- **Placement:** Overview tab. The cursor lives on the HoldingsChart x-axis; the existing SnapshotGrid + downstream tabs subscribe to a global `asOf` date.
- **Anti-bloat:** Replaces no section. Reuses every existing analytic — just changes the `asOf` and current-price inputs they already accept. The Performance and Tax tabs inherit the time-travel for free.
- **Effort:** ~200 LOC: a wrapper around `bundled.date` + `price` in `Dashboard.tsx`, plus a small slider component over HoldingsChart. The hardest part is sourcing a historical price for the cursor date — the bundled CryptoCompare price series already covers it.
- **Recruiter signal:** Strong, and uniquely interactive — most portfolio apps are static.

### C. ETL data-quality / anomaly panel (Settings → ImportSummary)

Expand the existing `ImportSummary` with a Data Quality block:

- **Anomaly count:** transactions whose implied $/BTC diverges from the bundled CoinGecko price for that day by > 5% — typically a fee misallocation or a row the normalizer mishandled.
- **Header-detection confidence:** for each ingested file, what schema we recognized and the strength of the match (column-name overlap).
- **Per-format row counts:** Strike vs Coinbase vs CashApp vs Swan, with the date range each exchange covers.

Right now the ETL story is told only by file/transaction counts. Surfacing *validation* moves the headline skill from "we transformed" to "we transformed and verified."

- **Placement:** Settings tab, inside `ImportSummary.tsx`. New collapsible "Data quality" subsection.
- **Anti-bloat:** Extends an existing component. No new tab, no new top-level section.
- **Effort:** ~250 LOC + tests. Anomaly check needs a price lookup by date — already available from `priceHistory`.
- **Recruiter signal:** Strong because it directly amplifies the load-bearing narrative of the project (the multi-exchange ETL).

### D. Halving-cycle cohort view (Performance)

A small panel grouping all buys by Bitcoin halving epoch (`2012-11 → 2016-07`, `2016-07 → 2020-05`, `2020-05 → 2024-04`, `2024-04 → 2028 (est.)`) with the same columns as `YearlyTable`: BTC stacked, USD invested, average buy price, current value, profit, ROI, annualized ROI.

- **Why it's strong:** Calendar years are a generic Wall Street primitive. **Halving epochs are the Bitcoin-native partition** — they're what a knowledgeable reviewer would actually want to see. The yearly view and the cycle view answer different questions; both belong.
- **Placement:** Performance tab, directly under `YearlyTable`. Same visual treatment so they read as siblings.
- **Anti-bloat:** Pure data partition reuse — `computeYearly` becomes parameterizable over a bucketing function. ~80 LOC of code, ~50 of UI.
- **Effort:** ~150 LOC + tests.
- **Recruiter signal:** Moderate-to-strong with Bitcoin-literate reviewers; invisible to others. Cheap insurance.

### E. Open Graph share card / dynamic snapshot URL

A Next.js dynamic OG image route (`/og`) that renders a dark-theme card with the demo (or shared) portfolio's headline KPIs: BTC held, invested, current value, net P/L, ROI. The root page wires the OG meta tags. Recruiters who paste the live URL into Slack, LinkedIn, or DM auto-render a thumbnail with the actual dashboard numbers.

- **Why it's strong:** Distribution side, not feature side. Costs almost nothing to build and increases the chance the project gets clicked on when shared. Demonstrates familiarity with Next.js metadata APIs.
- **Placement:** New route `/app/og/route.tsx` + `metadata` export on `/app/page.tsx`. No UI surface.
- **Anti-bloat:** Zero UI footprint. Doesn't appear in the dashboard.
- **Effort:** ~120 LOC. `next/og`'s `ImageResponse` is one file.
- **Recruiter signal:** Indirect but high leverage — it determines whether the link gets clicked at all.

### F. Print-ready PDF "Stacker Report" (Settings)

A button in Settings that generates a one-page PDF: KPI grid (top), holdings curve (middle), exchange breakdown table + halving cohort table (bottom), generation date. Useful as a tangible artifact someone can attach to an email or print.

- **Why it's strong:** Most portfolio dashboards live behind a screenshot in a tweet. A PDF export is a small touch that says "this app is for using, not just demoing."
- **Placement:** Settings tab, new "Export report" button below the existing CSV export.
- **Anti-bloat:** Single button. Reuses every existing visualization (rendered to PDF via a small server route using `@react-pdf/renderer` or by capturing the existing DOM via a print stylesheet — recommend the print-stylesheet route, no new dep).
- **Effort:** ~150 LOC if print-stylesheet; ~300 LOC + a new dep if `@react-pdf/renderer`. Recommend the print-stylesheet route.
- **Recruiter signal:** Moderate. Better signal-per-LOC than the existing CSV export.

## 3. Anti-bloat plan

Every proposal extends an existing tab or adds zero UI footprint. No new top-level tab is introduced. Tab count stays at 7.

Concentration risk lives in two places:

- **Settings tab grows** under proposals C and F. Keep both within the existing `ImportSummary` and `SettingsSection` panels rather than spawning new top-level cards. Settings is the right home for both — it's already the "what got loaded, how to export" tab.
- **TopBar grows** under proposal A. The unit toggle should sit next to the live-price chip, not as a separate row. If the header gets visually cramped on mobile, collapse the unit toggle into the existing mobile-overflow menu rather than expanding header height.

The Overview tab gains the time-machine cursor (B) on top of the chart — that's a control affordance, not a new panel, and replaces nothing.

If proposals A, B, C, D, F all ship, the README roadmap gets one new entry: **Phase 6 — Domain depth & shareability**, with A/B/C/D/E/F as bullets. (Phase 5 is reserved for yesterday's still-open proposals: Realized P/L, fees, risk, goals.)

## 4. Recommended sequencing

Two phases, six landings each. Yesterday's six become Phase 5; today's six become Phase 6.

**Phase 5 — Realized P/L, fees, risk & goals (from 2026-05-28):**
0. ETL sell-support (new precondition surfaced today)
4. Fee drag
1. Form 8949 export
2. Realized P/L + harvest hints
5. Stacking velocity & target
3. Risk & volatility panel

**Phase 6 — Domain depth & shareability (from today):**
E. OG share card *(ship first — distribution lever)*
A. BTC/sats unit toggle *(highest recruiter signal of the six)*
C. ETL anomaly panel
D. Halving cohort view
B. Time-machine cursor
F. Print-ready PDF

Lowest-effort win across both phases: **E (OG share card)** — ~120 LOC, zero UI footprint, runs the moment it's pushed. Highest-signal single win: **A (BTC/sats unit toggle)** — the feature most likely to make a recruiter who knows Bitcoin pause and look closer.

---
*Generated autonomously by the daily-briefing scheduled task. Decisions made along the way: (1) treated yesterday's six as still-open since none have shipped, so today's six are designed to be distinct rather than redundant; (2) flagged the hardcoded `action: "BUY"` in the ETL as a precondition for yesterday's #2 — keeping the gap visible rather than letting it bite mid-implementation; (3) chose to recommend the print-stylesheet path for the PDF export to avoid adding a new dep; (4) skipped a "macro indicators" proposal (hashrate, mempool, halving countdown) again — same reason as yesterday: noise, not signal, on a recruiter review.*

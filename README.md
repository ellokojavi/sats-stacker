<div align="center">

# ₿ sats-stacker

**A dark-themed Bitcoin DCA portfolio analyzer.**

Cost basis, ROI, capital efficiency, the Bitcoin Power Law, and cost-basis tax estimates — across every exchange you've stacked on.

![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-f7931a)

</div>

---

## Overview

sats-stacker turns a pile of exchange CSV exports into a single portfolio dashboard.

It started life as a Jupyter notebook that merged Bitcoin transaction history from **Strike, Coinbase, Cash App, and Swan**, normalized four different CSV schemas into one ledger, and computed cost basis, ROI, and CAGR. This repository rebuilds that analysis as a fast, shareable web app — with tabbed reports, a Bitcoin Power Law view, and a cost-basis tax engine.

## How it works

Every exchange exports its history in a different, slightly messy CSV format:

- **Coinbase** prepends account-info rows before the real header
- **Cash App** quotes every field and writes amounts like `-$1,000.00` (commas and all)
- **Swan** leads with a company-info header
- **Strike** interleaves deposit and send rows among the actual purchases

The ETL pipeline in `src/lib/etl/` auto-detects each file's exchange from its header, finds the real header past any preamble, normalizes all four schemas onto one standard ledger (`date, source, btc, usd, fees`), removes duplicate rows, and hands the result to the dashboard. The core is pure TypeScript with no filesystem dependency, so the **exact same pipeline runs at build time over the bundled data and in your browser over files you import.**

## Demo and Real modes

A **Demo / Real** toggle in the header switches between synthetic data (shareable, works out of the box) and your own holdings. Switch to Real with no data loaded and the app walks you through importing your first CSVs.

Two ways to load real data, and you can mix exports from all four exchanges:

- **In-app import** — drop your exports into the import zone. They're parsed in your browser and remembered on this device.
- **Local folder** — drop CSVs into `data/private/` (any layout). The app loads them on startup.

Both keep real data out of the repo: `data/private/` is git-ignored, the browser import never writes to disk, and `.gitignore` blocks common real-export filenames. `scripts/generate_data.py` writes the synthetic demo CSVs in each exchange's native format — **the repository contains no real financial data.**

## What it shows

Reports are organized into six tabs, with the headline KPIs pinned above them:

- **Overview** — portfolio value over time with a clickable legend that toggles each curve and its Y-axis, and the per-exchange breakdown
- **Performance** — submarine chart, yearly performance with capital-weighted annualized ROI, profitability distribution, capital-weighted CAGR vs. benchmarks, hall of fame & wall of shame
- **What If?** — compares your actual DCA against five counterfactual strategies (lump-sum, weekly, monthly, quarterly, and annual buys anchored to your first purchase date), with an interactive scoreboard and per-strategy info tooltips
- **Power Law** — current price against Bitcoin's historical power-law trend on log-log axes (real prices from CryptoCompare), with model "fair value", market/model multiplier, slope β, R², bear/base/bull forward projections, and a DCA overlay of your own stacking pace; charts support date-range zoom with presets and drag selection, and a +5-year forecast band
- **Tax** — holding-period breakdown plus an interactive sell simulator: FIFO / LIFO / HIFO cost-basis lot matching with editable BTC quantity and USD proceeds inputs, and estimated capital gain with short-/long-term split
- **Ledger** — the full sortable, paginated transactions table

**Live BTC price** — fetched server-side at page render (60-second ISR cache) so headline numbers are correct on first load with no flicker. A background client-side poll refreshes every 60 seconds, so charts and tables stay current during long sessions. A pulsing price chip in the header links directly to CoinGecko.

## Tech stack

- **Next.js 14** (App Router) and **React 18**
- **TypeScript**
- **Tailwind CSS** for the dark dashboard theme
- **Recharts** for charts
- **Vitest** for unit tests
- **Python** (standard library only) for the synthetic-data generator

## Getting started

### Prerequisites

- Node.js 18.18 or newer, and npm
- Python 3.9+ — only needed if you want to regenerate the demo data

### Run it locally

```bash
git clone https://github.com/ellokojavi/sats-stacker.git
cd sats-stacker
npm install
npm run dev
```

Then open <http://localhost:3000>.

### Run the tests

```bash
npm test
```

The cost-basis tax engine (FIFO / LIFO / HIFO lot matching) is covered by a Vitest suite.

### Regenerate the demo data (optional)

```bash
python scripts/generate_data.py
```

The generator is seeded, so every run produces the same exports.

## Project structure

```
sats-stacker/
├── data/
│   ├── raw/                    synthetic exchange exports, native formats
│   │   └── Strike/ Coinbase/ CashApp/ Swan/
│   ├── private/                drop your real exports here (git-ignored)
│   └── btc_price_history.json  weekly BTC price series (2011-present)
├── scripts/
│   └── generate_data.py        deterministic synthetic-export generator
├── src/
│   ├── app/                    Next.js App Router — dashboard + /price route
│   ├── components/             dashboard, tabs, panels, charts, tables, import
│   └── lib/
│       ├── etl/                CSV parser, exchange normalizers, pipeline
│       ├── analytics.ts        lots, yearly, profitability, CAGR, per-exchange
│       ├── powerlaw.ts         power-law least-squares fit
│       ├── tax.ts              FIFO/LIFO/HIFO cost-basis engine
│       ├── tax.test.ts         Vitest unit tests for the tax engine
│       ├── portfolio.ts        snapshot + holdings-series metrics
│       ├── data.ts             filesystem loaders (demo / private)
│       ├── importStore.ts      browser-import localStorage persistence
│       ├── format.ts           number / date formatting
│       └── types.ts            shared types
├── tailwind.config.ts
└── package.json
```

## Roadmap

sats-stacker was built in phases.

- [x] **Phase 1 — Foundation**: ETL pipeline, synthetic-data generator, portfolio snapshot, HODLings chart
- [x] **Phase 2 — Analytics**: submarine chart, yearly performance, per-exchange breakdown, profitability distribution, CAGR vs. benchmarks, transactions table, live price feed
- [x] **Power Law & tabs**: Bitcoin power-law analysis on log-log axes, tabbed reports, dedicated live-price page
- [x] **Phase 3 — Tax**: cost-basis lot tracking (FIFO / LIFO / HIFO) with a sell simulator, capital-gains estimates, and unit tests
- [x] **Phase 4 — Polish & What If?**: What If? strategy comparator, date-range zoom with presets, power-law holdings projections (bear/base/bull bands), real BTC price history from CryptoCompare, editable tax inputs, clickable chart legends, capital-weighted annualized ROI, server-side price fetch with 60-second auto-refresh

## Disclaimer

The tax figures are informational cost-basis estimates, not tax advice. Holding periods assume US-style rules (lots held over one year are long-term). Consult a tax professional before filing.

## License

Released under the [MIT License](LICENSE).

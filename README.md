<div align="center">

# ₿ sats-stacker

**A dark-themed Bitcoin DCA portfolio analyzer.**

Cost basis, ROI, and capital efficiency across every exchange you've stacked on — in one dashboard.

![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-f7931a)

</div>

---

## Overview

sats-stacker turns a pile of exchange CSV exports into a single portfolio dashboard.

It started life as a Jupyter notebook that merged Bitcoin transaction history from **Strike, Coinbase, Cash App, and Swan**, normalized four different CSV schemas into one ledger, and computed cost basis, ROI, and CAGR. This repository rebuilds that analysis as a fast, shareable web app.

## Demo data & privacy

**This repository contains no real financial data.**

Every number in the app is synthetic. `scripts/generate_data.py` is a deterministic generator that invents a plausible dollar-cost-averaging history across the four exchanges and prices each buy against an approximate, public Bitcoin price curve. The app reads only this synthetic ledger — real holdings never enter the repo, and `.gitignore` blocks common real-export filenames as a backstop.

## Tech stack

- **Next.js 14** (App Router) and **React 18**
- **TypeScript**
- **Tailwind CSS** for the dark dashboard theme
- **Recharts** for charts
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

### Regenerate the demo data (optional)

The repo already ships with a generated dataset under `data/`. To re-roll it:

```bash
python scripts/generate_data.py
```

The generator is seeded, so every run produces the same ledger.

## Project structure

```
sats-stacker/
├── data/                      synthetic ledger + price history (generated)
│   ├── synthetic_ledger.csv
│   └── btc_price_history.json
├── scripts/
│   └── generate_data.py       deterministic synthetic-data generator
├── src/
│   ├── app/                   Next.js App Router — layout, page, styles
│   ├── components/            TopBar, MetricCard, SnapshotGrid, HoldingsChart
│   └── lib/                   data loading, portfolio math, formatting, types
├── tailwind.config.ts
└── package.json
```

## What it shows — Phase 1

- **Portfolio snapshot** — total stack, net invested, current value, net profit/loss, total ROI, average cost basis, and break-even distance
- **HODLings value over time** — portfolio value charted against the Bitcoin price

## Roadmap

sats-stacker is built in phases.

- [x] **Phase 1 — Foundation**: project scaffold, synthetic-data pipeline, portfolio snapshot, HODLings chart
- [ ] **Phase 2 — Analytics**: submarine chart, yearly performance, profitability distribution, CAGR vs. benchmarks, per-exchange breakdown, sortable transactions table, live price feed
- [ ] **Phase 3 — Tax**: cost-basis lot tracking (FIFO / HIFO / LIFO / Specific ID) with capital-gains prep and unit tests

## License

Released under the [MIT License](LICENSE).

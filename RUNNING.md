# Running sats-stacker locally

A quick, self-contained cheat sheet for getting the app up on your own machine.
For the full project story, see [`README.md`](README.md).

## What this is

**sats-stacker** is a Next.js + TypeScript + Tailwind dashboard that turns raw
Bitcoin exchange CSV exports (Strike, Coinbase, Cash App, Swan) into one
portfolio view — cost basis, ROI, CAGR, a tax engine, and projection models.
It ships with **synthetic demo data**, so it runs out of the box with no real
holdings. A **Demo / Real** toggle in the header switches to your own data.

## Prerequisites

- **Node.js 18.18 or newer** and **npm** (check with `node -v`)
- **Python 3.9+** — only if you want to regenerate the synthetic demo CSVs

## Start the dev server

```bash
git clone https://github.com/ellokojavi/sats-stacker.git
cd sats-stacker
npm install        # first time only
npm run dev
```

Then open <http://localhost:3000>. The dev server hot-reloads on save.

## Everyday commands

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Start the local dev server on port 3000                             |
| `npm run build`     | Production build (also typechecks and lints)                        |
| `npm start`         | Serve the production build (run `npm run build` first)              |
| `npm test`          | Run the Vitest suite (ETL, tax engine, analytics)                   |
| `npm run screenshots` | Regenerate the README screenshots against the demo data           |

## Loading your own data (Real mode)

Two ways, and you can mix all four exchanges:

1. **In-app import** — switch to **Real** mode and drop your CSV exports onto
   the import zone. You can drop **loose files or whole folders** (e.g. one
   folder per exchange); every `.csv` inside is read recursively. Data is
   parsed in your browser and remembered on this device — nothing is uploaded.
2. **Local folder** — drop CSVs into `data/private/` (any layout). The app
   picks them up on startup. This folder is git-ignored, so real holdings never
   get committed.

## Regenerate demo data (optional)

```bash
python scripts/generate_data.py
```

The generator is seeded, so every run produces the same synthetic exports in
each exchange's native CSV format under `data/raw/`.

## Troubleshooting

- **Port 3000 in use** — run `npm run dev -- -p 3001` and open that port.
- **Node too old** — the build needs Node 18.18+. Upgrade if `node -v` is lower.
- **Stale build errors after pulling** — delete `.next/` and re-run `npm run dev`.

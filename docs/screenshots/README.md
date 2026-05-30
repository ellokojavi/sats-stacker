# Screenshots

These images are referenced from the project root `README.md`. They show the app running against the bundled **synthetic** dataset only — never real holdings.

## Regenerating

Screenshots are captured automatically by `scripts/capture_screenshots.mjs` (Playwright).

```bash
npm run dev          # in one terminal, leave running
npm run screenshots  # in another
```

The script boots a headless Chromium, navigates each tab, waits for charts to render, and overwrites the PNGs in this folder. Re-run it whenever the dashboard's layout, charts, or KPIs change meaningfully — stale screenshots are worse than missing ones.

## Inventory

| File                       | Tab / View              | Why it's here                                                                |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `01-overview-hero.png`     | Overview                | Hero shot: KPI snapshot + HODLings chart + time machine. README header.      |
| `02-performance.png`       | Performance             | Submarine chart + CAGR vs. benchmarks — signals analytical depth.            |
| `03-projection.png`        | Projection              | Log-log chart with model toggle (Power Law / Quantile Bands) + DCA overlay.  |
| `04-tax.png`               | Tax                     | FIFO/LIFO/HIFO sell simulator — proves Phase 3 shipped.                      |
| `05-whatif.png` *(opt.)*   | What If?                | DCA vs. counterfactual strategies scoreboard.                                |

Filenames are intentionally numbered so they sort predictably and the name itself documents intent.

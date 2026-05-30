#!/usr/bin/env node
/**
 * Capture README screenshots against the running dev server.
 *
 * Usage:
 *   npm run dev          # in one terminal, leave running
 *   npm run screenshots  # in another
 *
 * Writes PNGs to docs/screenshots/. Only the synthetic ("demo") dataset is
 * captured — never real holdings. The dev server is responsible for serving
 * the synthetic ledger.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "docs/screenshots");
const BASE_URL = process.env.SCREENSHOTS_BASE_URL ?? "http://localhost:3000";

// 16:10 wide enough for the dashboard to breathe, but not so wide it's
// awkward on a README page render.
const VIEWPORT = { width: 1440, height: 900 };

const SHOTS = [
  {
    file: "01-overview-hero.png",
    tab: "Overview",
    waitFor: "text=Portfolio",
  },
  {
    file: "02-performance.png",
    tab: "Performance",
    waitFor: "text=Submarine",
  },
  {
    file: "03-projection.png",
    tab: "Projection",
    // "log-log" appears in the chart panel title for both Power Law and
    // Quantile Bands renderings, so it's a stable selector across the
    // in-tab model toggle.
    waitFor: "text=log-log",
  },
  {
    file: "04-tax.png",
    tab: "Tax",
    waitFor: "text=FIFO",
  },
  {
    file: "05-whatif.png",
    tab: "What If?",
    waitFor: "text=DCA",
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina-crisp PNGs
    colorScheme: "dark",
  });
  const page = await context.newPage();

  console.log(`[screenshots] base URL: ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Make sure we're on the demo dataset. If a Demo/Real toggle is showing
  // "Real", flip it back.
  const demoButton = page.getByRole("button", { name: /^demo$/i });
  if (await demoButton.isVisible().catch(() => false)) {
    await demoButton.click().catch(() => {});
  }

  for (const shot of SHOTS) {
    const tabButton = page.getByRole("tab", { name: shot.tab });
    if (await tabButton.isVisible().catch(() => false)) {
      await tabButton.click();
    }
    if (shot.waitFor) {
      await page.waitForSelector(shot.waitFor, { timeout: 10_000 }).catch(() => {});
    }
    // Let Recharts finish its enter animation.
    await page.waitForTimeout(800);
    const out = resolve(OUT, shot.file);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`[screenshots] wrote ${out}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error("[screenshots] failed:", err);
  process.exit(1);
});

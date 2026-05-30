# Deploying sats-stacker to Vercel

The repo is configured to deploy to Vercel out of the box. This is what
landed in `feat(deploy): Vercel-ready + README live-demo link`, and what
the README hero's "Try the demo live" button points at.

## One-time setup (Javier)

1. Sign in at <https://vercel.com> with the GitHub account that owns
   `ellokojavi/sats-stacker` (uses the same GitHub identity, no extra
   account juggling).
2. Click **Add New… → Project**, then **Import** the `sats-stacker` repo.
3. **Framework preset** auto-detects as *Next.js*. Leave the build /
   output / install commands at their defaults — they match what
   `package.json` already declares.
4. **Project name:** `sats-stacker` (so the production URL becomes
   `https://sats-stacker.vercel.app`, matching the link in the README
   hero). If that name is taken globally, claim something close
   (`sats-stacker-app`, `sats-stacker-demo`) and update the two URLs
   in `README.md` to match.
5. **Environment variables:** none. The CoinGecko price fetch is public
   and the bundled BTC price history is committed.
6. **Deploy.** Wait for the first build to finish; the URL goes live as
   soon as it does.

Every subsequent push to `main` will redeploy automatically. PRs get
their own preview URLs.

## Why the `next.config.mjs` change matters

`src/lib/data.ts` reads `data/raw/**/*.csv` and
`data/btc_price_history.json` with `fs.readFileSync(process.cwd() + …)`
at request time. Next.js's file-tracer follows JS/TS imports but doesn't
know about runtime `fs` reads, so on Vercel those files wouldn't be
bundled into the serverless function — the page would render locally and
500 in production.

`next.config.mjs` now sets `outputFileTracingIncludes` so Vercel ships
the `data/` directory alongside the serverless bundle. Without that line
the demo would be broken on first deploy.

## Verifying after deploy

After the URL goes live, smoke-test:

- the **Overview** tab renders the snapshot KPIs and the HODLings chart
  (proves `loadDemoLedger()` + `loadPriceHistory()` work at runtime),
- the **header price chip** shows a live BTC price (proves the
  server-side CoinGecko fetch works — it might be cold for ~60 s after
  first hit while the ISR cache populates),
- the **Power Law** tab plots the log-log fit (proves the historical
  price array is intact),
- the **Tax** tab's FIFO/LIFO/HIFO simulator updates as the BTC slider
  moves (proves the tax engine works in the production bundle).

If any of those fails, check the Vercel function logs for `ENOENT` — it
usually means the `outputFileTracingIncludes` glob didn't match. The
fix is to widen the glob, not to introduce a new build step.

## Custom domain (optional)

If `sats-stacker.javieririgoyen.com` (or similar) ever becomes useful,
Vercel's domain config takes a CNAME and propagates HTTPS automatically.
The README link would need a one-line update to point at the new host.

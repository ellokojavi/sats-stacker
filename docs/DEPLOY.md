# Deploying sats-stacker to Vercel

The repo is configured to deploy to Vercel out of the box. The README
hero's "Deploy with Vercel" button kicks off this flow for any reviewer
who wants their own live copy.

## One-time setup

The README "Deploy with Vercel" button is the fastest path — it walks you
through importing the repo into your own Vercel account with one click.
The longer-form version of the same flow:

1. Sign in at <https://vercel.com> with GitHub.
2. **Add New… → Project**, **Import** `ellokojavi/sats-stacker` (or your
   fork). Framework preset auto-detects as *Next.js*; leave the build,
   output, and install commands at their defaults.
3. **Environment variables:** none. The CoinGecko price fetch is public
   and the bundled BTC price history is committed.
4. **Deploy.** The first build takes ~60 seconds and the URL goes live
   immediately after. Vercel auto-assigns a `*.vercel.app` subdomain
   from the project name — you can rename it later under Project Settings
   → Domains, or attach a custom domain.

Every subsequent push to `main` redeploys automatically. PRs get their
own preview URLs.

Once a canonical production URL exists, swap the README hero's "Deploy
with Vercel" button for a "Try the live demo →" link pointing at it.

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

Vercel's domain config takes a CNAME and propagates HTTPS automatically.
If you point a custom domain at the deployment, update the README hero
button (or replace it with a live-demo link) to match.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `src/lib/data.ts` reads the bundled CSVs and BTC price history with
  // `fs.readFileSync(process.cwd() + "/data/...")`. Next's file-tracer
  // collects JS/TS imports but doesn't know about runtime fs reads, so we
  // explicitly tell it to ship the `data/` folder alongside the serverless
  // bundle on Vercel. Without this, the page renders fine locally but
  // throws ENOENT in production.
  outputFileTracingIncludes: {
    "/": ["./data/raw/**/*", "./data/btc_price_history.json"],
  },
};

export default nextConfig;

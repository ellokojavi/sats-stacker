#!/usr/bin/env python3
"""
generate_data.py - synthetic data generator for sats-stacker.

Produces a 100% FAKE Bitcoin dollar-cost-averaging ledger plus a Bitcoin
price history, so the dashboard can be demoed and shared publicly without
exposing anyone's real holdings.

Outputs (written to ../data relative to this script):
  - synthetic_ledger.csv     the fake transaction ledger
  - btc_price_history.json   weekly BTC price series for the charts

Usage:
    python scripts/generate_data.py

The run is deterministic: a fixed RNG seed means every run produces the
exact same data, so the committed files are reproducible.
"""

import csv
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

SEED = 42

# ---------------------------------------------------------------------------
# Monthly BTC price anchors (USD, approximate).
# These only shape a realistic-looking price curve. Bitcoin's market price is
# public information - nothing here is private. Values are rounded/approximate.
# ---------------------------------------------------------------------------
ANCHORS = [
    (2017, 12, 14000),
    (2018, 1, 11000), (2018, 2, 10300), (2018, 3, 7000), (2018, 4, 9200),
    (2018, 5, 7400), (2018, 6, 6300), (2018, 7, 7700), (2018, 8, 7000),
    (2018, 9, 6600), (2018, 10, 6300), (2018, 11, 4000), (2018, 12, 3700),
    (2019, 1, 3450), (2019, 2, 3800), (2019, 3, 4100), (2019, 4, 5300),
    (2019, 5, 8300), (2019, 6, 10800), (2019, 7, 10000), (2019, 8, 9600),
    (2019, 9, 8300), (2019, 10, 9200), (2019, 11, 7600), (2019, 12, 7200),
    (2020, 1, 9400), (2020, 2, 8600), (2020, 3, 6450), (2020, 4, 8700),
    (2020, 5, 9500), (2020, 6, 9150), (2020, 7, 11100), (2020, 8, 11700),
    (2020, 9, 10800), (2020, 10, 13800), (2020, 11, 19700), (2020, 12, 29000),
    (2021, 1, 33100), (2021, 2, 45200), (2021, 3, 58800), (2021, 4, 57700),
    (2021, 5, 37300), (2021, 6, 35000), (2021, 7, 41500), (2021, 8, 47100),
    (2021, 9, 43800), (2021, 10, 61300), (2021, 11, 57000), (2021, 12, 46200),
    (2022, 1, 38500), (2022, 2, 43200), (2022, 3, 45500), (2022, 4, 37600),
    (2022, 5, 31800), (2022, 6, 19900), (2022, 7, 23300), (2022, 8, 20000),
    (2022, 9, 19400), (2022, 10, 20500), (2022, 11, 17200), (2022, 12, 16500),
    (2023, 1, 23100), (2023, 2, 23100), (2023, 3, 28500), (2023, 4, 29200),
    (2023, 5, 27200), (2023, 6, 30400), (2023, 7, 29200), (2023, 8, 25900),
    (2023, 9, 26900), (2023, 10, 34500), (2023, 11, 37700), (2023, 12, 42300),
    (2024, 1, 42600), (2024, 2, 61200), (2024, 3, 71300), (2024, 4, 60000),
    (2024, 5, 67500), (2024, 6, 61000), (2024, 7, 66200), (2024, 8, 59100),
    (2024, 9, 63300), (2024, 10, 70200), (2024, 11, 96400), (2024, 12, 93600),
    (2025, 1, 102000), (2025, 2, 84400), (2025, 3, 82500), (2025, 4, 94200),
    (2025, 5, 104000), (2025, 6, 107500), (2025, 7, 117800), (2025, 8, 112400),
    (2025, 9, 114600), (2025, 10, 109800), (2025, 11, 90500), (2025, 12, 88700),
    (2026, 1, 95300), (2026, 2, 101200), (2026, 3, 97600), (2026, 4, 103400),
    (2026, 5, 105800),
]

ANCHOR_POINTS = [
    (datetime(y, m, 1, tzinfo=timezone.utc), float(p)) for (y, m, p) in ANCHORS
]


def price_on(when: datetime) -> float:
    """Log-interpolate the anchor curve and add stable per-day noise."""
    if when <= ANCHOR_POINTS[0][0]:
        base = ANCHOR_POINTS[0][1]
    elif when >= ANCHOR_POINTS[-1][0]:
        base = ANCHOR_POINTS[-1][1]
    else:
        base = ANCHOR_POINTS[-1][1]
        for i in range(len(ANCHOR_POINTS) - 1):
            d0, p0 = ANCHOR_POINTS[i]
            d1, p1 = ANCHOR_POINTS[i + 1]
            if d0 <= when <= d1:
                frac = (when - d0).total_seconds() / (d1 - d0).total_seconds()
                base = math.exp(math.log(p0) + frac * (math.log(p1) - math.log(p0)))
                break
    # Per-day noise keyed on the calendar day, so it is independent of the
    # order in which transactions are generated.
    daily = random.Random(when.date().toordinal())
    return base * (1.0 + daily.uniform(-0.035, 0.035))


def main() -> None:
    random.seed(SEED)
    txns = []

    def add_buy(when, source, usd, fee_rate=0.0, flat_fee=0.0):
        """Record one synthetic BUY. USD is the total spent (fees included)."""
        price = price_on(when)
        fee = usd * fee_rate + flat_fee
        btc = (usd - fee) / price
        txns.append({
            "Date": when.strftime("%Y-%m-%d %H:%M:%S+00:00"),
            "Source": source,
            "Action": "BUY",
            "BTC_Amount": f"{btc:.8f}",
            "USD_Amount": f"{float(usd):.2f}",
            "Fees": f"{fee:.2f}",
        })

    def at(y, m, d, h=12, mi=0):
        return datetime(y, m, d, h, mi, tzinfo=timezone.utc)

    # Phase 1 - Coinbase early lump buys (Dec 2017).
    for day, amt in [(8, 2000), (12, 1000), (20, 3000), (22, 750), (28, 500)]:
        add_buy(at(2017, 12, day, random.randint(9, 20), random.randint(0, 59)),
                "Coinbase", amt, fee_rate=0.0149)

    # Phase 2 - Coinbase weekly DCA through 2021 (~$100/week).
    cursor = at(2021, 1, 6)
    while cursor < at(2021, 12, 31):
        add_buy(cursor.replace(hour=random.randint(2, 5), minute=random.randint(0, 59)),
                "Coinbase", 100.0, fee_rate=0.0149)
        cursor += timedelta(days=7)

    # Phase 3 - Coinbase occasional lump buys (2022-2024).
    for _ in range(14):
        y = random.choice([2022, 2023, 2024])
        add_buy(at(y, random.randint(1, 12), random.randint(1, 28),
                   random.randint(9, 21), random.randint(0, 59)),
                "Coinbase", random.choice([500, 750, 1000, 2000, 3000]),
                fee_rate=0.0149)

    # Phase 4 - Cash App buys (2023).
    for _ in range(13):
        add_buy(at(2023, random.randint(8, 12), random.randint(1, 28),
                   random.randint(8, 22), random.randint(0, 59)),
                "CashApp", random.choice([150, 200, 300, 500, 1000, 2500]),
                fee_rate=0.018)

    # Phase 5 - Swan buys (late 2023).
    for day in (17, 19, 21, 28):
        add_buy(at(2023, 11, day, random.randint(3, 16), random.randint(0, 59)),
                "Swan", 500.0, flat_fee=4.95)

    # Phase 6 - Strike heavy DCA (Jan 2024 -> mid-May 2026).
    cursor = at(2024, 1, 1, 13, 0)
    end = at(2026, 5, 15)
    while cursor < end:
        if random.random() > 0.20:  # skip roughly one day in five
            add_buy(cursor.replace(hour=13, minute=random.randint(0, 5)),
                    "Strike", float(random.choice([20, 25, 30, 50, 50, 100])))
        if random.random() < 0.03:  # occasional larger top-up
            add_buy(cursor.replace(hour=random.randint(14, 20), minute=random.randint(0, 59)),
                    "Strike", float(random.choice([500, 1000, 2000])))
        cursor += timedelta(days=1)

    txns.sort(key=lambda t: t["Date"])

    here = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(here, "..", "data")
    os.makedirs(data_dir, exist_ok=True)

    ledger_path = os.path.join(data_dir, "synthetic_ledger.csv")
    with open(ledger_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["Date", "Source", "Action", "BTC_Amount", "USD_Amount", "Fees"])
        for t in txns:
            writer.writerow([t["Date"], t["Source"], t["Action"],
                             t["BTC_Amount"], t["USD_Amount"], t["Fees"]])

    # Weekly BTC price history for the charts.
    history = []
    cursor = datetime(2017, 12, 1, tzinfo=timezone.utc)
    history_end = datetime(2026, 5, 20, tzinfo=timezone.utc)
    while cursor <= history_end:
        history.append({"date": cursor.strftime("%Y-%m-%d"),
                         "price": round(price_on(cursor), 2)})
        cursor += timedelta(days=7)

    history_path = os.path.join(data_dir, "btc_price_history.json")
    with open(history_path, "w") as fh:
        json.dump(history, fh, indent=0)

    # Run summary.
    total_btc = sum(float(t["BTC_Amount"]) for t in txns)
    total_usd = sum(float(t["USD_Amount"]) for t in txns)
    by_source = {}
    for t in txns:
        by_source[t["Source"]] = by_source.get(t["Source"], 0) + 1
    print("Synthetic data generated.")
    print(f"  Ledger:        {ledger_path}")
    print(f"  Price history: {history_path}")
    print(f"  Transactions:  {len(txns)}  " +
          ", ".join(f"{k} {v}" for k, v in sorted(by_source.items())))
    print(f"  Total stacked: {total_btc:.8f} BTC over ${total_usd:,.2f}")
    print(f"  Date range:    {txns[0]['Date'][:10]} -> {txns[-1]['Date'][:10]}")
    print(f"  Price points:  {len(history)}")


if __name__ == "__main__":
    main()

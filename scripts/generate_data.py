#!/usr/bin/env python3
"""
generate_data.py - synthetic exchange-export generator for sats-stacker.

Produces 100% FAKE Bitcoin transaction CSVs in the *native export format* of
four exchanges (Strike, Coinbase, Cash App, Swan), so the app's ETL pipeline
has realistic, messy inputs to normalize - without exposing anyone's real
holdings.

Outputs (written under ../data relative to this script):
  raw/Strike/strike-statement-YYYY.csv     Strike account-statement format
  raw/Coinbase/coinbase-transactions.csv   Coinbase format (with preamble rows)
  raw/CashApp/cashapp-bitcoin-report.csv   Cash App format (quoted, $-amounts)
  raw/Swan/swan-transfers.csv              Swan format (with company header)
  btc_price_history.json                   weekly BTC price series for charts

Each file mimics that exchange's real quirks - preamble lines, quoted fields,
dollar-sign amounts, deposit/withdrawal/send rows, even a few duplicate rows -
so the ETL has to do real work. The run is deterministic (fixed RNG seed).

Usage:  python scripts/generate_data.py
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
    (2011, 1, 0.30), (2011, 2, 1.10), (2011, 3, 0.85), (2011, 4, 1.80),
    (2011, 5, 8.50), (2011, 6, 15.00), (2011, 7, 13.50), (2011, 8, 9.50),
    (2011, 9, 5.00), (2011, 10, 3.50), (2011, 11, 3.00), (2011, 12, 4.20),
    (2012, 1, 5.50), (2012, 2, 4.90), (2012, 3, 4.85), (2012, 4, 5.00),
    (2012, 5, 5.20), (2012, 6, 6.60), (2012, 7, 8.50), (2012, 8, 11.00),
    (2012, 9, 12.50), (2012, 10, 11.50), (2012, 11, 12.50), (2012, 12, 13.50),
    (2013, 1, 20.00), (2013, 2, 33.00), (2013, 3, 93.00), (2013, 4, 140.00),
    (2013, 5, 120.00), (2013, 6, 100.00), (2013, 7, 95.00), (2013, 8, 110.00),
    (2013, 9, 135.00), (2013, 10, 200.00), (2013, 11, 1100.00), (2013, 12, 750.00),
    (2014, 1, 800.00), (2014, 2, 580.00), (2014, 3, 460.00), (2014, 4, 450.00),
    (2014, 5, 630.00), (2014, 6, 640.00), (2014, 7, 590.00), (2014, 8, 510.00),
    (2014, 9, 410.00), (2014, 10, 340.00), (2014, 11, 380.00), (2014, 12, 320.00),
    (2015, 1, 230.00), (2015, 2, 250.00), (2015, 3, 245.00), (2015, 4, 235.00),
    (2015, 5, 230.00), (2015, 6, 260.00), (2015, 7, 285.00), (2015, 8, 230.00),
    (2015, 9, 240.00), (2015, 10, 310.00), (2015, 11, 380.00), (2015, 12, 430.00),
    (2016, 1, 380.00), (2016, 2, 440.00), (2016, 3, 415.00), (2016, 4, 460.00),
    (2016, 5, 535.00), (2016, 6, 670.00), (2016, 7, 625.00), (2016, 8, 575.00),
    (2016, 9, 610.00), (2016, 10, 700.00), (2016, 11, 745.00), (2016, 12, 960.00),
    (2017, 1, 970.00), (2017, 2, 1180.00), (2017, 3, 1080.00), (2017, 4, 1350.00),
    (2017, 5, 2300.00), (2017, 6, 2480.00), (2017, 7, 2880.00), (2017, 8, 4700.00),
    (2017, 9, 4340.00), (2017, 10, 6470.00), (2017, 11, 9900.00),
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
    daily = random.Random(when.date().toordinal())
    return base * (1.0 + daily.uniform(-0.035, 0.035))


# --- deterministic id helpers (seeded, unlike uuid4) -----------------------
def _hex(n):
    return "".join(random.choice("0123456789abcdef") for _ in range(n))


def make_uuid():
    return f"{_hex(8)}-{_hex(4)}-{_hex(4)}-{_hex(4)}-{_hex(12)}"


def make_short_id(n=6):
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "".join(random.choice(alphabet) for _ in range(n))


def make_txhash():
    return _hex(64)


def make_address():
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "bc1q" + "".join(random.choice(alphabet) for _ in range(38))


# --- native CSV column layouts ---------------------------------------------
STRIKE_COLS = [
    "Reference", "Date & Time (UTC)", "Transaction Type", "Amount USD",
    "Fee USD", "Amount BTC", "Fee BTC", "BTC Price", "Cost Basis (USD)",
    "Destination", "Description", "Transaction Hash", "Note",
]
COINBASE_COLS = [
    "ID", "Timestamp", "Transaction Type", "Asset", "Quantity Transacted",
    "Price Currency", "Price at Transaction", "Subtotal",
    "Total (inclusive of fees and/or spread)", "Fees and/or Spread", "Notes",
]
CASHAPP_COLS = [
    "Transaction ID", "Date", "Transaction Type", "Currency", "Amount", "Fee",
    "Net Amount", "Asset Type", "Asset Price", "Asset Amount", "Status",
    "Notes", "Name of sender/receiver", "Account",
]
SWAN_COLS = [
    "Event", "Date", "Timezone", "Status", "Transaction ID", "Total USD",
    "Transaction USD", "Fee USD", "Unit Count", "Asset Type", "BTC Price",
    "Address Label", "USD Cost Basis", "Acquisition Date",
]


def money(x):
    return f"${x:,.2f}"


def neg_money(x):
    return f"-${abs(x):,.2f}"


def write_strike(events, data_dir):
    out_dir = os.path.join(data_dir, "raw", "Strike")
    os.makedirs(out_dir, exist_ok=True)
    by_year = {}

    def add(dt, row):
        by_year.setdefault(dt.year, []).append((dt, row))

    purchases = []
    for ev in events:
        usd, fee, btc, price = ev["usd"], ev["fee"], ev["btc"], ev["price"]
        dep_dt = ev["dt"] - timedelta(seconds=38)
        add(dep_dt, [make_uuid(), dep_dt.strftime("%b %d %Y %H:%M:%S"),
                     "Deposit", f"{usd:.2f}", "", "", "", "", "", "", "", "", ""])
        purchase = [make_uuid(), ev["dt"].strftime("%b %d %Y %H:%M:%S"),
                    "Purchase", f"{-usd:.2f}", (f"{fee:.2f}" if fee else ""),
                    f"{btc:.8f}", "", f"{price:.2f}", f"{usd:.2f}", "", "", "", ""]
        add(ev["dt"], purchase)
        purchases.append((ev["dt"], purchase))

    # A few exact duplicate purchase rows - the ETL must dedupe these.
    for dt, row in random.sample(purchases, 3):
        add(dt + timedelta(seconds=1), list(row))

    # A couple of outbound "Send" rows - the ETL must filter these out.
    for ev in random.sample(events, 2):
        sdt = ev["dt"] + timedelta(days=3, hours=2)
        add(sdt, [make_uuid(), sdt.strftime("%b %d %Y %H:%M:%S"), "Send", "",
                  "", f"{-0.005:.8f}", "", "", "", make_address(), "",
                  make_txhash(), "cold storage"])

    written = []
    for year in sorted(by_year):
        rows = [r for _, r in sorted(by_year[year], key=lambda x: x[0])]
        path = os.path.join(out_dir, f"strike-statement-{year}.csv")
        with open(path, "w", newline="") as fh:
            writer = csv.writer(fh, lineterminator="\n")
            writer.writerow(STRIKE_COLS)
            writer.writerows(rows)
        written.append(path)
    return written


def write_coinbase(events, data_dir):
    out_dir = os.path.join(data_dir, "raw", "Coinbase")
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    buy_rows = []
    for ev in events:
        usd, fee, btc, price = ev["usd"], ev["fee"], ev["btc"], ev["price"]
        ts = ev["dt"].strftime("%Y-%m-%d %H:%M:%S") + " UTC"
        row = [make_uuid(), ts, "Buy", "BTC", f"{btc:.8f}", "USD",
               money(price), money(usd - fee), money(usd), money(fee),
               f"Bought {btc:.8f} BTC for {usd:.2f} USD"]
        rows.append((ev["dt"], row))
        buy_rows.append((ev["dt"], row))

    for dt, row in random.sample(buy_rows, 2):
        rows.append((dt + timedelta(seconds=1), list(row)))

    for ev in random.sample(events, 3):
        sdt = ev["dt"] + timedelta(days=5)
        p = price_on(sdt)
        rows.append((sdt, [make_uuid(), sdt.strftime("%Y-%m-%d %H:%M:%S") + " UTC",
                            "Send", "BTC", f"{-0.01:.8f}", "USD", money(p),
                            neg_money(0.01 * p), neg_money(0.01 * p), "$0.00",
                            f"Sent 0.01000000 BTC to {make_address()}"]))

    rows.sort(key=lambda x: x[0])
    path = os.path.join(out_dir, "coinbase-transactions.csv")
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["Transactions"])
        writer.writerow(["User", "Demo User (synthetic data)", make_uuid()])
        writer.writerow([])
        writer.writerow(COINBASE_COLS)
        writer.writerows(r for _, r in rows)
    return [path]


def write_cashapp(events, data_dir):
    out_dir = os.path.join(data_dir, "raw", "CashApp")
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    buy_rows = []
    for ev in events:
        usd, fee, btc, price = ev["usd"], ev["fee"], ev["btc"], ev["price"]
        d = ev["dt"].strftime("%Y-%m-%d %H:%M:%S") + " PST"
        row = [make_short_id(6), d, "Bitcoin Buy", "USD", neg_money(usd - fee),
               neg_money(fee), neg_money(usd), "BTC", money(price),
               f"{btc:.8f}", "COMPLETED", f"purchase of BTC {btc:.8f}",
               "", "Your Cash"]
        rows.append((ev["dt"], row))
        buy_rows.append((ev["dt"], row))
        wdt = ev["dt"] + timedelta(minutes=2)
        rows.append((wdt, [make_short_id(6), wdt.strftime("%Y-%m-%d %H:%M:%S") + " PST",
                           "Bitcoin Withdrawal", "USD", neg_money(usd), "$0",
                           neg_money(usd), "BTC", money(price), f"{btc:.8f}",
                           "COMPLETED", f"Withdrawing BTC {btc:.8f}",
                           "", "Your Cash"]))

    for dt, row in random.sample(buy_rows, 1):
        rows.append((dt + timedelta(seconds=1), list(row)))

    rows.sort(key=lambda x: x[0])
    path = os.path.join(out_dir, "cashapp-bitcoin-report.csv")
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n", quoting=csv.QUOTE_ALL)
        writer.writerow(CASHAPP_COLS)
        writer.writerows(r for _, r in rows)
    return [path]


def write_swan(events, data_dir):
    out_dir = os.path.join(data_dir, "raw", "Swan")
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for ev in events:
        usd, btc, price = ev["usd"], ev["btc"], ev["price"]
        dep_fee = 4.95
        dep_dt = ev["dt"] - timedelta(seconds=30)
        rows.append((dep_dt, ["deposit", dep_dt.strftime("%Y-%m-%d %H:%M:%S") + "+00",
                              "UTC", "settled", "", f"{usd + dep_fee:.2f}", "",
                              f"{dep_fee:.2f}", "", "USD", "", "", "", ""]))
        rows.append((ev["dt"], ["purchase", ev["dt"].strftime("%Y-%m-%d %H:%M:%S") + "+00",
                                "UTC", "settled", make_uuid(), f"{usd:.2f}",
                                f"{usd:.2f}", "", f"{btc:.8f}", "BTC",
                                f"{price:.2f}", "", "", ""]))
    rows.sort(key=lambda x: x[0])
    path = os.path.join(out_dir, "swan-transfers.csv")
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["Swan Bitcoin - synthetic sample export - not real data"])
        writer.writerow(["Phone: 000-000-0000"])
        writer.writerow(SWAN_COLS)
        writer.writerows(r for _, r in rows)
    return [path]


def write_price_history(data_dir):
    history = []
    cursor = datetime(2011, 1, 1, tzinfo=timezone.utc)
    history_end = datetime(2026, 5, 20, tzinfo=timezone.utc)
    while cursor <= history_end:
        history.append({"date": cursor.strftime("%Y-%m-%d"),
                        "price": round(price_on(cursor), 2)})
        cursor += timedelta(days=7)
    path = os.path.join(data_dir, "btc_price_history.json")
    with open(path, "w") as fh:
        json.dump(history, fh, indent=0)
    return path, len(history)


def main():
    random.seed(SEED)
    events = {"Strike": [], "Coinbase": [], "CashApp": [], "Swan": []}

    def buy(exchange, when, usd, fee):
        """Record one synthetic buy. USD is the total spent (fees included)."""
        price = price_on(when)
        btc = (usd - fee) / price
        events[exchange].append({"dt": when, "usd": float(usd),
                                 "fee": float(fee), "btc": btc, "price": price})

    def at(y, m, d, h=12, mi=0):
        return datetime(y, m, d, h, mi, tzinfo=timezone.utc)

    # Phase 1 - Coinbase early lump buys (Dec 2017).
    for day, amt in [(8, 2000), (12, 1000), (20, 3000), (22, 750), (28, 500)]:
        buy("Coinbase", at(2017, 12, day, random.randint(9, 20), random.randint(0, 59)),
            amt, amt * 0.0149)

    # Phase 2 - Coinbase weekly DCA through 2021 (~$100/week).
    cursor = at(2021, 1, 6)
    while cursor < at(2021, 12, 31):
        buy("Coinbase", cursor.replace(hour=random.randint(2, 5), minute=random.randint(0, 59)),
            100.0, 100.0 * 0.0149)
        cursor += timedelta(days=7)

    # Phase 3 - Coinbase occasional lump buys (2022-2024).
    for _ in range(14):
        y = random.choice([2022, 2023, 2024])
        amt = random.choice([500, 750, 1000, 2000, 3000])
        buy("Coinbase", at(y, random.randint(1, 12), random.randint(1, 28),
                           random.randint(9, 21), random.randint(0, 59)),
            amt, amt * 0.0149)

    # Phase 4 - Cash App buys (2023).
    for _ in range(13):
        amt = random.choice([150, 200, 300, 500, 1000, 2500])
        buy("CashApp", at(2023, random.randint(8, 12), random.randint(1, 28),
                          random.randint(8, 22), random.randint(0, 59)),
            amt, amt * 0.018)

    # Phase 5 - Swan buys (late 2023). The deposit fee is shown on the deposit
    # row in the export, so the purchase row itself carries no fee.
    for day in (17, 19, 21, 28):
        buy("Swan", at(2023, 11, day, random.randint(3, 16), random.randint(0, 59)),
            500.0, 0.0)

    # Phase 6 - Strike heavy DCA (Jan 2024 -> mid-May 2026), no explicit fee.
    cursor = at(2024, 1, 1, 13, 0)
    end = at(2026, 5, 15)
    while cursor < end:
        if random.random() > 0.20:
            buy("Strike", cursor.replace(hour=13, minute=random.randint(0, 5)),
                float(random.choice([20, 25, 30, 50, 50, 100])), 0.0)
        if random.random() < 0.03:
            buy("Strike", cursor.replace(hour=random.randint(14, 20), minute=random.randint(0, 59)),
                float(random.choice([500, 1000, 2000])), 0.0)
        cursor += timedelta(days=1)

    here = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(here, "..", "data")
    os.makedirs(data_dir, exist_ok=True)

    written = []
    written += write_strike(events["Strike"], data_dir)
    written += write_coinbase(events["Coinbase"], data_dir)
    written += write_cashapp(events["CashApp"], data_dir)
    written += write_swan(events["Swan"], data_dir)
    price_path, price_count = write_price_history(data_dir)

    total_btc = sum(e["btc"] for src in events.values() for e in src)
    total_usd = sum(e["usd"] for src in events.values() for e in src)
    print("Synthetic exchange exports generated:")
    for path in written:
        rel = os.path.relpath(path, data_dir)
        print(f"  data/{rel}")
    print(f"  data/{os.path.relpath(price_path, data_dir)}  ({price_count} points)")
    print("Buys per exchange: " +
          ", ".join(f"{k} {len(v)}" for k, v in sorted(events.items())))
    print(f"Underlying total: {total_btc:.8f} BTC over ${total_usd:,.2f} "
          "(before ETL dedupe / decoy rows)")


if __name__ == "__main__":
    main()

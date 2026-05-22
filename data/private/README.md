# data/private/

Drop your **real** exchange CSV exports in this folder and `sats-stacker` will
load them on startup instead of the synthetic demo data.

- Organize them however you like — subfolders are fine. Every `.csv` under this
  folder is read, and the exchange is auto-detected from each file's header.
- Supported exchanges: Strike, Coinbase, Cash App, and Swan.
- **Everything in this folder is git-ignored except this README.** Your real
  files are never committed and never leave your machine.

Prefer not to touch the filesystem? Use the in-app **Import CSVs** control
instead — it parses files entirely in your browser.

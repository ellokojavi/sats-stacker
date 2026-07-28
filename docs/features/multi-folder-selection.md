# Feature brief — Multi-folder selection / parent-folder recursive scan

**Status:** Gate review (PM intake) · **Recommendation: NO-GO on new build** (already shipped; verify + document) · Awaiting Javier's approval

## Feature

The proposal, as evolved during the gate:

- **Original ask:** "Let me choose multiple folders at once in the folder-selection dialog" — e.g. pick `Strike/`, `Coinbase/`, `Cash App/`, and `Swan/` together in a single browse action.
- **Javier's reshape (the one that governs this brief):** "If only one folder can be selected, then let me pick a **parent** folder and have every sub-folder and CSV under it scanned."

So the feature under review is: **point the importer at one parent directory (e.g. `exports/` containing per-exchange subfolders) and have all nested CSVs discovered and run through the ETL, with no per-folder repetition.**

## The critical finding: this already ships

The reshaped behavior is **already the app's behavior today**, verified end-to-end against the code:

1. **Folder picker enumerates the entire tree.** `ImportDropzone.tsx`'s "…or add a whole folder" control is a `<input webkitdirectory>` (line 210–217). `webkitdirectory` recursively enumerates the *whole* selected directory tree — every nested subfolder's files — and populates each file's `webkitRelativePath`. `ingestList` (line 115) maps each file to `{ path: file.webkitRelativePath, file }`, so picking `exports/` yields `exports/Strike/strike.csv`, `exports/Coinbase/coinbase.csv`, etc.
2. **Drag-drop walks folders recursively too.** `ingestDrop` → `readEntry` (line 38) recurses through `FileSystemDirectoryEntry` readers, flattening nested folders while preserving each file's relative path. Dropping one parent folder — or several folders in one gesture — all flows through the same path.
3. **Every enumerated file hits the ETL.** `toNamedFiles` (line 80) filters to `.csv` and reads all of them; `onFiles` → `Dashboard.handleReplaceFiles` → `commitFiles` → `normalizeFiles` (`pipeline.ts` line 112), whose `files.forEach` runs **each** file through `detectExchange` + the matching normalizer. Not just top-level files — all of them, at any depth. Confirmed.

The literal *original* ask (select multiple folders in one native dialog) is **not buildable** — no browser supports it: `<input webkitdirectory>` takes one directory tree per dialog (all browsers), and `showDirectoryPicker()` returns one handle per call (Chromium-only). But that ask is fully **satisfied in substance** by the reshape, which is already implemented: put the exchanges under one parent, pick the parent, done. And multi-folder *drag-drop* (dropping several folders at once) already works as a bonus.

## What it is not

- Not a native multi-folder dialog — that capability does not exist in any browser and is out of scope.
- Not a new ETL, normalizer, or schema change — detection and normalization are untouched.
- Not a change to how nested paths are handled — flattening + relative-path-as-name already exists and prevents basename collisions.
- Not a recursion bug fix — recursion works; there is nothing broken to repair.

## Job to be done

- **Investor persona:** "I keep my exports in one folder tree, one subfolder per exchange — let me hand you the top folder and be done." Real job, and **already served**.
- **Recruiter-evaluator (the job that matters):** unchanged — the signal is the four-format ETL and its visible detection receipt, not the folder-picking mechanics. Recursive folder ingestion is table-stakes plumbing that reviewers assume works; it earns nothing extra when present but would cost credibility if it *didn't* work.

## Value

- **Zero net-new value from building anything**, because the capability exists. The only value on the table is **making users aware it exists** — the dropzone copy already hints at it ("one folder per exchange or a handful of loose CSVs, mixed is fine"), but "pick a parent folder and we'll scan the whole tree" is not stated in those words.
- Discoverability copy is table-stakes polish, not a differentiator. It prevents a user from tediously importing four folders one at a time when one parent pick would do.

## Fit

- **Phase fit:** none new. This landed with folder import + the smart-import reshape (Phase 11–12). It is post-Phase-12 territory at most.
- **Data policy:** no conflict — all parsing is in-browser.
- **ETL-showcase rule:** compatible and, if anything, reinforcing — pointing at a parent folder full of heterogeneous exchange exports and watching the "Detected as" receipt light up per file is a clean demonstration of the multi-format ETL.
- **Overlap with `smart-import-detection.md`:** substantial. That brief already covered the unified drop/pick target and the detection receipt; recursive folder scanning is the same intake surface viewed from a different angle. This is a footnote to that feature, not a separate one.

## Cost / risk

- **Effort to build the reshaped ask:** ~zero — it's done.
- **Effort for the honest action (verify + copy):** minimal. A test/manual verification that a nested parent folder ingests all subfolder CSVs, plus one line of copy on the folder affordance ("Pick a parent folder — every subfolder's CSVs get scanned"). Optionally reconcile the same wording into `RealModeEmptyState` and the README.
- **Risk:** the main risk is **inventing work** — shipping a "multi-folder import" feature under a banner that implies new capability when the substance already ships, or worse, attempting a Chromium-only `showDirectoryPicker()` path that fragments browser support for no user-visible gain. Avoid both.

## Recommendation — NO-GO on new build; fold into smart-import surface as verify + copy

The literal original request is not implementable in any browser, and the reshaped request is **already fully implemented and verified** end-to-end (webkitdirectory recursion + drag-drop entry-walk → ETL over every enumerated file). Building a "feature" here would misrepresent finished work as new. The smallest honest action:

1. **Confirm and record the behavior** — a quick manual/automated check that a parent folder with per-exchange subfolders ingests all nested CSVs (the code path says it does; make it a documented, tested guarantee so it doesn't silently regress).
2. **Close the discoverability gap** — add one line to the folder affordance (and mirror into `RealModeEmptyState` / README) telling users they can point at a **parent** folder and have the whole tree scanned. This is the entire delta between "supported" and "known to users."

Treat this as a copy/verification footnote to `smart-import-detection.md`, not a standalone build. If Javier wants the *native multi-folder dialog* specifically, the answer is a firm no-go on browser-platform grounds — steer to the parent-folder pattern, which achieves the same outcome.

## Handoff notes (only if Javier approves the copy/verify action)

- **ux-designer:** No new pattern. One micro-copy change on the "…or add a whole folder" affordance in `ImportDropzone.tsx` to name the parent-folder-scan behavior, kept consistent with the Phase-12 import copy. Do not add a second control.
- **app-developer:** No ETL, normalizer, or component-structure changes. Scope is (a) a verification test asserting a nested `webkitRelativePath` set (e.g. `exports/Strike/strike.csv`, `exports/Coinbase/coinbase.csv`) all reach `normalizeFiles` and get detected, and (b) the copy tweak in `ImportDropzone.tsx` plus optional mirror in `RealModeEmptyState.tsx` / README. Preserve the existing recursion (`readEntry`, `webkitdirectory`) and unrecognized-file handling.
- **Do not** attempt `showDirectoryPicker()` or any Chromium-only path — it fragments support with no gain over the existing webkitdirectory recursion.

# Feature brief — Smart import detection (unified drop/select target)

**Status:** Gate review (PM intake) · **Recommendation: RESHAPE** · Awaiting Javier's approval

## Feature

A single import target that inspects whatever the user provides — one CSV, several CSVs, a folder, several folders, or a mix of exchanges — auto-detects each file's source exchange and format, and routes it through the right ETL path with no up-front declaration of intent ("is this a file or a folder? which exchange?").

## The critical finding: most of this already ships

Before scoping anything, the honest status: **the app already does the intelligent part of this proposal.**

- **Exchange/format auto-detection is done.** `pipeline.ts#detectExchange` sniffs each file's header signature (`headerTokens`) and routes it to the correct normalizer (Strike / Coinbase / Cash App / Swan), skipping preamble rows. The user never picks an exchange today.
- **File-vs-folder is already unified on drag-and-drop.** `ImportDropzone.ingestDrop` walks dropped entries with the FileSystem entry API — loose files, folders, nested folders, and mixes all flow through the same code path with zero user choice. Folders are flattened; each file keeps its relative path.
- **The detection result is already surfaced**, which is what protects the ETL story — see the tension section.

The **only** place the user still "declares intent" is the *click-to-browse* fallback: the **Choose files or folder** button opens a two-item menu (Files… / Folder…). That menu exists because of a hard browser constraint, not a design gap: a native `<input>` cannot offer both loose-file selection and folder selection in one dialog — `webkitdirectory` forces folder-only. So the literal proposal ("the user shouldn't have to pick") is ~90% already built; the residual is one small, browser-constrained menu.

## What it is not

- Not a new detection engine — header-signature detection already exists and works.
- Not a change to any normalizer or the ledger schema.
- Not content-sniffing beyond the header (no ML, no fuzzy column matching, no confidence scoring). Detection stays deterministic and first-match-wins.
- Not a way to eliminate the browse dialog's file/folder distinction entirely — that is a browser limitation we can soften, not remove.
- Not multi-format support beyond the four exchanges.

## Job to be done

- **Investor persona:** "Let me hand the app my exports however they sit on disk and get a dashboard — don't make me think about plumbing." Real job, but largely already served by drag-and-drop.
- **Recruiter-evaluator (the job that matters):** "Show me the app makes a smart, correct decision about heterogeneous inputs without hand-holding." This is served by the *detection receipt*, not by removing a menu.

## Value

- **Table-stakes polish, not a differentiator.** Collapsing the Files…/Folder… menu removes one click for keyboard/click-to-browse users. Marginal. The drag-drop path — which most reviewers will try first — already has zero friction.
- The higher-value move hiding inside this proposal is **making the auto-detection more legible as a "look how smart the ETL is" moment**, which is a differentiator and is cheap because the data already exists (`stats.files[].exchange` / `recognized`, rendered in `ImportSummary`'s "Detected as" column).

## Fit

- **Phase fit:** none new. Folder import + unified drop already landed in **Phase 11–12**. This is post-Phase-12 polish, not a roadmap phase.
- **Data policy:** no conflict — parsing stays in-browser, no real data committed.
- **ETL-showcase rule:** compatible *if reshaped correctly* — see below. Done wrong, "invisible magic" could bury the four-format story; done right, it amplifies it.

## Cost / risk

- **Effort:** small. Consolidating the browse menu into one primary control (default to the multi-file picker, demote folder to a secondary affordance) plus copy that tells users drag-drop takes anything is a few hours of UI work. No ETL changes.
- **Risk — the real one:** framing this as "smart import detection" oversells a change that's mostly shipped, and could tempt a build that *hides* detection to feel magical. That would undercut the headline skill. Also: header-token detection is first-match-wins with no ambiguity/near-miss messaging — if a reshape touches detection at all, don't quietly swallow unrecognized files (the current "Unrecognized" row is a feature, keep it loud).

## The tension, resolved: does auto-detection showcase or hide the ETL?

**Position: it showcases it — because detection is already surfaced as a visible receipt, and that must stay the anchor of this feature.** The `ImportSummary` "By file → Detected as" table already turns invisible sniffing into an on-screen artifact: *this file was recognized as Coinbase, that one as Swan, this one is unrecognized.* That receipt is exactly what makes a recruiter think "the ETL is doing real work across four formats," and it's the opposite of invisible magic. So the answer to the a/b tension is: **auto-detection helps the story specifically because we render the decision, not despite it.**

The failure mode to avoid is a reshape that smooths the intake so much the four-format narrative disappears into a spinner. Guard against it by making the detection receipt *more* prominent, not less.

## Recommendation — RESHAPE

Don't build "smart import detection" as a new capability — it's already the app's behavior, and shipping it under that banner would misrepresent finished work as new. **Reshape to two small, honest moves:**

1. **Unify the browse control (the only genuine gap).** Replace the Files…/Folder… menu with a single primary **Add exchange files** button that opens the multi-file picker (the common case: a handful of loose CSVs), and demote folder selection to a quiet secondary link ("…or add a whole folder"). Keep drag-and-drop as the truly-unified path and say so in the dropzone copy ("Drop files or folders — we'll figure out the rest"). This honors the proposal's intent (stop making the user declare file-vs-folder) within the browser's constraints.
2. **Elevate the detection receipt as the showcase.** Make the "Detected as" outcome the hero of the post-import moment — e.g. a one-line "Recognized N files across M exchanges; K unrecognized" summary leading into the existing table — so the auto-routing reads as intelligence, keeping the ETL front-and-center. Keep the loud "Unrecognized" state.

Net: a modest, truthful UX polish that removes the last bit of "which button?" friction and turns the existing detection into a stronger recruiter signal — without inventing an engine that already exists or hiding the four-format story.

## Handoff notes (only after Javier approves)

- **ux-designer:** Design the single-primary-button + secondary-folder-link pattern and the elevated detection summary. Reconcile with the README/Phase-12 copy that currently names the "Choose files or folder" control by name (README line ~123, `RealModeEmptyState` step 2, `ImportDropzone` headline). Do not remove the folder capability — only re-rank its prominence.
- **app-developer:** No ETL/normalizer changes expected. Work is confined to `ImportDropzone.tsx` (collapse the menu; keep both `<input>`s, one hidden behind the secondary affordance) and the import-summary surface (`ImportSummary.tsx` / where `commitFiles` toasts). Preserve the existing unrecognized-file handling and the drag-drop entry-walking path. Update README + `RealModeEmptyState` copy to match the new control.
- **Do not** add fuzzy/confidence-based detection or content-sniffing beyond headers under this brief — that's a separate proposal if ever wanted.

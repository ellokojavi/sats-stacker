# Design spec — Smart import detection (reshaped)

**Companion to:** `smart-import-detection.md` (approved brief, RESHAPE)
**Author:** ux-designer · **Status:** ready for `app-developer`
**Scope guard:** Two moves only — (1) unify the browse control, (2) elevate the detection receipt. No ETL, normalizer, schema, or detection-logic changes. Folder capability is re-ranked, never removed. Do not add confidence/fuzzy detection.

All colors below are existing tokens from `tailwind.config.ts` (`night #0d0f12`, `panel #14181d`, `edge #232830`, `bitcoin #f7931a`, `up #16c784`, `down #ea3943`, `ink #e6e8eb`, `muted #8a8f99`, `faint #6b7280`). No new tokens, no new design language.

---

## Move 1 — Unify the browse control (`ImportDropzone.tsx`)

### Intent

Drag-and-drop is already the one true unified path (loose files, folders, mixes — `ingestDrop`/`readEntry`). The click-to-browse fallback is the only place the user still declares "file vs folder." Reshape it so the **common case is one primary button** and folder is a **quiet secondary link** — without deleting the folder `<input>`.

### What is removed

- The toggle menu entirely: `menuOpen` state, `menuRef`, the outside-click/Escape `useEffect` (lines ~102, ~105, ~110–126), the `role="menu"` popover and its two `menuitem` buttons (lines ~200–240), and the `aria-haspopup`/`aria-expanded` attributes.

### What stays

- Both hidden `<input>`s exactly as-is: `fileInputRef` (multi-file, `accept=".csv,text/csv" multiple`) and `folderInputRef` (`webkitdirectory`). Lines ~241–258 unchanged.
- `ingestList`, `ingestDrop`, `readEntry`, `busy` — unchanged.
- The dropzone `<div>` drag handlers and border-state logic (lines ~180–194) — unchanged except the drag copy (see below).

### New control layout

Inside the dropzone, replacing the `menuRef` block, stack two affordances centered:

```
[  Add exchange files  ]        ← primary button, opens fileInputRef (multi-file)
   …or add a whole folder        ← secondary text link, opens folderInputRef
```

**Primary button** (brand-accent filled — bitcoin is already the app's accent, so this introduces no new language; it just promotes the existing button):

```
className="rounded-md bg-bitcoin px-3.5 py-1.5 text-[12px] font-medium
           text-night hover:bg-bitcoin/90 disabled:opacity-50
           focus-visible:outline-none focus-visible:ring-2
           focus-visible:ring-bitcoin/40 focus-visible:ring-offset-2
           focus-visible:ring-offset-panel"
onClick={() => fileInputRef.current?.click()}
disabled={busy}
```
- Label: `busy ? "Reading…" : "Add exchange files"`.
- `text-night` (not `text-ink`) on the orange fill — see contrast note below.

**Secondary folder link** (`<button type="button">` styled as a link, ~8px below the primary):

```
className="mt-2 text-[11px] text-muted underline decoration-edge underline-offset-2
           hover:text-ink disabled:opacity-50
           focus-visible:outline-none focus-visible:ring-2
           focus-visible:ring-bitcoin/40 rounded"
onClick={() => folderInputRef.current?.click()}
disabled={busy}
```
- Label: `…or add a whole folder` (literal leading ellipsis character `…`, not three dots).
- It is a real `<button>` (keyboard/AT get button semantics), visually a quiet underlined link. Do not use an `<a>` (no href).

### Copy strings

| Slot | Mode | String |
|---|---|---|
| Dropzone headline | `replace` | `Drop files or folders — we'll figure out the rest` |
| Dropzone headline | `append` | `Drop more files or folders — we'll add them to your pool` |
| Dropzone sub-line | both | `Strike, Coinbase, Cash App, Swan — one folder per exchange or a handful of loose CSVs, mixed is fine` |
| Primary button | — | `Add exchange files` (busy: `Reading…`) |
| Secondary link | — | `…or add a whole folder` |

The headline now explicitly promises the unified drop path ("we'll figure out the rest"), which is the brief's ask. Keep the existing `text-[13px] text-ink` headline and `text-[11px] text-muted` sub-line classes (lines ~195–199).

### States

| State | Primary button | Secondary link | Dropzone border |
|---|---|---|---|
| Default | `bg-bitcoin text-night` | `text-muted` underlined | `border-edge` (dashed) |
| Hover | `hover:bg-bitcoin/90` | `hover:text-ink` | unchanged |
| Focus (keyboard) | `ring-2 ring-bitcoin/40` + `ring-offset-2 ring-offset-panel` | `ring-2 ring-bitcoin/40` | n/a (div not focusable) |
| Dragging (file over zone) | unchanged | unchanged | `border-bitcoin bg-bitcoin/5` (existing) |
| Busy (`Reading…`) | `disabled:opacity-50`, label `Reading…` | `disabled:opacity-50` | unchanged |

Drag-over visual (`border-bitcoin bg-bitcoin/5`) is already implemented — keep it; it is the signal that drop is the truly-unified path.

### Focus order

1. Primary "Add exchange files" button
2. Secondary "…or add a whole folder" link

The dropzone `<div>` is not in the tab order (drag-drop is a pointer-only enhancement; keyboard users are fully served by the two controls). No `tabIndex` needed. Removing the menu also removes a focus trap and the Escape/outside-click listeners — a net a11y simplification.

---

## Move 2 — Elevate the detection receipt (`ImportSummary.tsx`)

### Intent

The "By file → Detected as" table is the artifact that makes a recruiter think "the ETL is doing real work across four formats." Promote it from a quiet table under an uppercase-muted `h3` to a **one-line spoken result** that leads into the table. This is the "look how smart the ETL is" moment — keep the Unrecognized state loud.

### The receipt line

Add, directly above the existing `By file` `<h3>` (line ~140), a lead sentence built from data already on `stats.files[]`:

- `recognizedCount = stats.files.filter(f => f.recognized).length`
- `unrecognizedCount = stats.files.length - recognizedCount`
- `exchangeCount = stats.byExchange.length` (already computed for the "Sources" stat)

Rendered (wrap in a `role="status"` region so assistive tech announces the outcome when the panel appears):

```
<p role="status" className="text-[13px] text-ink">
  Recognized <span className="font-medium text-up">{recognizedCount} file{recognizedCount === 1 ? "" : "s"}</span>
  {" "}across <span className="font-medium text-ink">{exchangeCount} exchange{exchangeCount === 1 ? "" : "s"}</span>
  {unrecognizedCount > 0
    ? <> · <span className="font-medium text-down">{unrecognizedCount} unrecognized</span></>
    : <> · <span className="text-up">all recognized</span></>}
</p>
```

Placement: it replaces the visual weight of the current `By file` header. Keep the existing uppercase `By file` `<h3>` beneath it as a quiet table caption (or demote it to `text-faint`); the receipt sentence is now the section's headline. The `Clear unrecognized` button (lines ~143–151) stays where it is, right-aligned on the header row.

### Recognized vs unrecognized visual treatment

- **Recognized count** → `text-up` (green), `font-medium`. Reads as "correct, verified."
- **Exchange count** → `text-ink`, `font-medium`. Neutral emphasis (it is a count, not a pass/fail).
- **Unrecognized count** → `text-down` (red), `font-medium`, and always spelled out ("N unrecognized") so it never relies on color alone. This mirrors the existing red `Unrecognized` badge in the table (lines ~185–189) — consistent, and it keeps the failure state loud per the brief.
- When `unrecognizedCount === 0`, append `· all recognized` in `text-up` — a clean, positive close rather than a dangling clause.

The existing per-row table (recognized → `text-ink` + edge badge; unrecognized → `text-faint` row + red `Unrecognized` badge + remove ✕) is unchanged. The receipt is a summary *of* that table, not a replacement.

### Do not

- Do not hide, spinner-over, or auto-dismiss the table. The four-format story lives in the per-file rows; the receipt points at them.
- Do not soften or drop the `Unrecognized` badge, the red row treatment, or the remove/`Clear unrecognized` affordances.

---

## Accessibility notes

- **Contrast (all against their real backgrounds):**
  - Primary button: `night #0d0f12` text on `bitcoin #f7931a` ≈ **8.3:1** (passes AA/AAA). `ink` on bitcoin would be ~1.8:1 and must not be used — that is why the label is `text-night`.
  - Secondary link `muted #8a8f99` on `panel #14181d` ≈ **5.2:1** (passes AA). Underline gives a non-color affordance for "this is clickable."
  - Receipt `up #16c784` on `panel` ≈ **8.2:1** (passes). `down #ea3943` on `panel` ≈ **4.4:1** — marginal vs the 4.5:1 AA line, so keep the unrecognized count `font-medium` and always paired with the word "unrecognized" (never color-only). This matches the contrast the existing `Unrecognized` badge already ships at, so it is consistent, not a regression.
- **Semantics:** secondary folder affordance is a `<button>`, not an anchor (no navigation). Receipt is a `<p role="status">` so the recognized/unrecognized outcome is announced politely on import without stealing focus.
- **No color-only meaning:** recognized/unrecognized are conveyed by word + count, with color as reinforcement.
- **Focus visibility:** both controls get a `ring-bitcoin/40` focus-visible ring, matching the app's existing focus treatment (`.time-machine-range:focus-visible` in `globals.css` uses the same `rgba(247,147,26,0.4)`).

---

## Entry-copy sync (`RealModeEmptyState.tsx`)

The empty-state currently names the old control indirectly. Update step 2 (line ~39) to name the new primary:

- **Before:** `2. Drop the files above — Strike, Coinbase, Cash App and Swan are recognized automatically.`
- **After:** `2. Drop the files above, or use Add exchange files — Strike, Coinbase, Cash App and Swan are recognized automatically.`

Everything else in `RealModeEmptyState` (bitcoin badge, "parsed right here in your browser," the `data/private/` filesystem note, "go back to demo data") is unchanged.

---

## Per-file punch list (each item = one commit)

| # | File | Change | Screenshot refresh? |
|---|---|---|---|
| 1 | `ImportDropzone.tsx` | Remove the menu: delete `menuOpen`/`menuRef`, the outside-click/Escape `useEffect`, the popover + `Files…`/`Folder…` menuitems, and `aria-haspopup`/`aria-expanded`. Leave both hidden `<input>`s intact. | Yes (hero import UI) |
| 2 | `ImportDropzone.tsx` | Add primary `Add exchange files` button (bitcoin fill, `text-night`, busy→`Reading…`, focus ring) wired to `fileInputRef`. | Yes |
| 3 | `ImportDropzone.tsx` | Add secondary `…or add a whole folder` underlined link-button wired to `folderInputRef`, `disabled={busy}`, focus ring. | Yes |
| 4 | `ImportDropzone.tsx` | Update `headline` copy (both modes) + sub-line to the strings in the table above. | Yes |
| 5 | `ImportSummary.tsx` | Add the `role="status"` receipt line above the `By file` header; compute `recognizedCount`/`unrecognizedCount`; color counts `up`/`ink`/`down`; demote the existing `By file` `<h3>` to a quiet caption. | Yes (import summary UI) |
| 6 | `RealModeEmptyState.tsx` | Update step-2 copy to name `Add exchange files`. | Yes (empty-state UI) |
| 7 | `README.md` | Sync the ~line 123 reference from `Choose files or folder` to `Add exchange files` (+ folder as secondary). | No (docs only) |

Commits 1–4 can land together as one logical control swap if preferred, but they are separable. Commit 5 is independent of 1–4. Commit 7 is pure docs.

### Screenshot refresh required

The hero/import screenshots change and must be regenerated: (a) the Real-mode empty state showing the new single primary button + folder link + new dropzone copy, and (b) the import-summary panel showing the new detection receipt line. Any README/demo media that shows the old two-item `Choose files or folder` menu or the pre-receipt import summary is now stale and should be recaptured after commits 1–6 land.

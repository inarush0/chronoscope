# Behavioural parity checklist

This repo has no automated tests. This document is the parity mechanism for the
Go-binary migration: walk it against the **old build** (SvelteKit, `main`) and
the **new build** (vanilla-TS + Go binary), and compare answers item by item.

It describes the app **as it behaves today**, not as it ought to behave. Where
today's behaviour is arguably a bug, it is recorded under
[Known quirks](#known-quirks--preserve-as-is) and must be reproduced, not fixed.
Fixing anything here belongs to the post-port reshape, never to the port.

Screenshot diffing was considered and rejected: WebGL canvas output varies with
GPU and antialiasing settings, so it yields false diffs. Every check below is
therefore phrased so a human gets an unambiguous yes/no by eye.

> Derived by reading the source, not by walking a running build. The first pass
> against the old build is also this checklist's own proof-read: if a stated
> expectation doesn't match what `main` actually does, correct **this file**
> before porting anything, because from that point on it is the spec.

## Setup

| | Old build | New build |
| --- | --- | --- |
| Run | `bun run dev` | (per the port tickets) |
| Data | `dataset/chronoscope.sqlite` via `+page.server.ts` | embedded JSON, `fetch`ed |

Run both side by side, in the **same browser at the same window size** — several
checks below are pixel-threshold dependent (LOD switch, gap labels), so a
different viewport width legitimately changes the answer on both builds.

Facts about the shipped dataset, true of both builds:

- 1,181 events, 88 of which are intervals (have an `end`); the rest are instants.
- Full extent 4004 BCE – 62 CE, so the initial view (5% padding each side) runs
  **4208 BCE – 266 CE**.
- 217 distinct categories, of which **only 4 have colours**: Primeval History
  (indigo), Abraham (amber), Jacob (green), Joseph (rust). The other 213 —
  1,123 events — render in the default slate `#7777aa`. This is current
  behaviour: a port that colours more categories has **failed** parity.
- Every event has both a `description` and a `reference` in `meta`.

## 1. Startup

- [ ] **1.1** App loads with the toolbar (`Chronoscope`, Reset View, Zoom to
      Selection, theme icon) and the timeline filling the rest of the window.
- [ ] **1.2** Initial view spans **4208 BCE – 266 CE** (verify via 3.2 below —
      hover the leftmost and rightmost density bins and read the tooltip range).
- [ ] **1.3** The app opens in **LOD A** (density bars, no individual dots).
- [ ] **1.4** A horizontal spine line sits **2/3 of the way down** the canvas,
      spanning the full width.
- [ ] **1.5** No inspector panel is shown until something is selected.

## 2. Pan and zoom

- [ ] **2.1 Cursor-anchored zoom.** Put the cursor over a distinctive feature
      (a tall bin, or a specific event in LOD B). Wheel up several notches: the
      feature stays **under the cursor**, and does not creep left or right.
- [ ] **2.2** Wheel down from the same position: the feature again stays put.
      Zoom in 10 notches then out 10 notches — the view returns to where it
      started (zoom is exactly 1.12× per notch, symmetric).
- [ ] **2.3** Zoom anchored at the **far left edge** and at the **far right
      edge** of the canvas: still anchored, no drift toward centre.
- [ ] **2.4 Drift-free pan.** Press and drag left across the canvas, then drag
      back to the exact starting x **without releasing**: the view returns to
      exactly where it began (pan recomputes from the pointerdown origin rather
      than accumulating per-move deltas).
- [ ] **2.5** Cursor becomes `grabbing` while dragging and reverts on release.
- [ ] **2.6** Panning is horizontal only — vertical mouse movement changes
      nothing.
- [ ] **2.7** Page scroll never happens over the canvas (wheel is
      `preventDefault`ed).
- [ ] **2.8** Zooming out far past the dataset works and just leaves empty
      canvas — there are no clamps or bounds on the view range.
- [ ] **2.9** Interaction stays smooth (~60fps, no stutter) while dragging fast
      in both LOD A and LOD B.

## 3. LOD A (density bins)

LOD A is active when `canvas width ÷ visible event count < 40px`. On a
1,400px-wide canvas that means **35 or more** visible events.

- [ ] **3.1** Bars sit on a **24px pitch** and are drawn 22px wide (1px inset
      each side), rest **on** the spine and grow upward, and the tallest bar in
      view is 60px — the scale is relative to the busiest visible bin, so the
      tallest bar stays 60px as you pan.
- [ ] **3.2 Bin tooltip.** Hover a bar: a tooltip appears offset **+14px right,
      −12px up** from the cursor, containing, in order — `N events` (singular
      `1 event` for a bin of one), the bin's year range as
      `4004 BCE – 3900 BCE`, up to **three** category rows sorted by descending
      count (name italic left, count right), and the hint line
      `Click to select · Zoom to Selection to drill in`.
- [ ] **3.3** Hovering a **gap between bars** (an empty bin) shows no tooltip.
- [ ] **3.4** Tooltip appears when hovering **anywhere above the spine** in that
      bin's column, not only over the bar itself; it disappears below the spine
      (more than 8px under it) and on leaving the canvas.
- [ ] **3.5 Dominant-category colour.** Bins in the earliest region (Primeval
      History) are indigo; bins in the Abraham/Jacob/Joseph region show amber /
      green / rust; the great majority of bins across the rest of the timeline
      are the default slate. Bar alpha is 0.75 when unselected.
- [ ] **3.6 Bin selection.** Single-click a bar: it becomes fully opaque with a
      **white 1.5px outline**. No inspector opens (bins are not events). Click
      an empty column: the selection clears.
- [ ] **3.7 Double-click to drill in.** Double-click a bar: the view zooms to
      the extent of that bin's events' **start times** (not the column's
      nominal range, and not their end times), plus 20% padding each side. The
      events that were in that bar are spread across the new view, not crushed
      into one corner.
- [ ] **3.8** Double-clicking a bin whose events all share one start time zooms
      to the column's own time range instead (fallback — no extent to zoom to).
- [ ] **3.9** Selecting a bin then pressing **Zoom to Selection** does the same
      thing as double-clicking it.

## 4. LOD A ↔ B switching

- [ ] **4.1** Zoom in slowly from the initial view: at the moment fewer than
      `width ÷ 40` events are visible, the display switches **in one frame**
      from bars to individual dots and interval bars. There is no transition,
      blend, or intermediate state.
- [ ] **4.2** Zoom back out across the same point: it switches back to bars, at
      the same threshold, with no hysteresis or flicker.
- [ ] **4.3** Hovering during the switch never shows both tooltip kinds at once.
- [ ] **4.4** Zoom into an **empty stretch** of the timeline (zero visible
      events, e.g. the 726-year gap after "The Line of Cain and the Song of
      Lamech" at 3800 BCE): the app shows **LOD B** — empty canvas plus spine,
      not a bin view.

## 5. LOD B (individual events)

- [ ] **5.1 Instants** render as a 3px dot 18px above the spine, joined to the
      spine by a 1px stem.
- [ ] **5.2 Intervals** render as an 8px-tall bar whose bottom edge is 34px
      above the spine — clearly **above** the dots' row — with stems dropping
      from each end down to the spine.
- [ ] **5.3** A very short interval still renders at a **3px minimum width**,
      and in that case draws only its left stem, not both.
- [ ] **5.4** Dots are drawn **on top of** interval bars where they overlap.
- [ ] **5.5** Interval bars are clipped at the canvas edges: pan so a long
      interval (e.g. "Ehud Defeats Moab", 1287–1207 BCE, 80 years) runs off both
      sides — the bar still fills the canvas width, with no stem visible.
- [ ] **5.6** Unselected events draw at alpha 0.8; the selected one at 1.0 with
      a white 1.5px outline (a ring around a dot, a 1px-inflated rectangle
      around a bar).
- [ ] **5.7** Colours follow the same 4-category map as LOD A; almost everything
      is slate.

## 6. Gap indicators (LOD B only)

- [ ] **6.1** A faint 1px horizontal line sits **20px below the spine** between
      each pair of consecutive events, spanning the distance between them.
- [ ] **6.2** A centred year label (`430 yrs`, `1 yr`, `<1 yr`; thousands
      comma-grouped) appears only when the gap is **wider than 48px**. Zoom
      slowly so a gap crosses 48px in both directions: the label appears and
      disappears at the same width, while the line itself stays.
- [ ] **6.3** Labels are monospace, ~9px, faint (opacity 0.4), and sit just
      below the line.
- [ ] **6.4** Gap lines and labels are **absent entirely in LOD A**.
- [ ] **6.5** Both line and label are click-through — clicking where a label is
      still selects the event underneath, if any.
- [ ] **6.6** Gaps between events that are both off-screen do not render; the
      gap spanning the viewport (both endpoints off-screen on opposite sides)
      **does**, drawn full-width.

## 7. Selection

- [ ] **7.1 Click to select.** In LOD B, click a dot or bar: it gains the white
      outline and the inspector opens.
- [ ] **7.2 Click threshold.** Press, move **less than 4px horizontally**, and
      release: it counts as a click and selects. Press, drag more than 4px, and
      release over an event: it pans and selects **nothing**.
- [ ] **7.3** Click empty canvas: the selection clears and the inspector closes.
- [ ] **7.4 Hit tolerance** is 8px around the drawn geometry — clicking just
      beside a dot still hits it. Clicking well below the spine (>8px) or well
      above the bar row hits nothing.
- [ ] **7.5** Where an instant and an interval overlap, the **instant wins** —
      instants are hit-tested first.
- [ ] **7.6** Clicking in LOD A never opens the inspector (see 3.6).
- [ ] **7.7** Selecting a new event while one is already selected swaps the
      highlight and swaps the inspector contents; only ever one is highlighted.
- [ ] **7.8** A selected event stays selected and highlighted through pan and
      zoom, including panning it off-screen and back.

## 8. Inspector

- [ ] **8.1** The panel is 300px wide, on the **right**, with a left border; the
      timeline canvas shrinks to fit and re-renders at the new width (the
      spine stays full-width, content is not stretched or squashed).
- [ ] **8.2** Contents, top to bottom: category badge (uppercase, pill, tinted
      to the category colour — `Event` if the event has no category), close ×
      button, title, date, reference row with a 📖 icon, description paragraph.
- [ ] **8.3 Date formatting.** An instant shows one year (`4004 BCE`); an
      interval shows `1287 BCE – 1207 BCE`. Years ≤ 0 render `N BCE`, years > 0
      render `N CE` — check an event either side of the boundary (e.g. one in
      the Passion group vs. any Genesis event).
- [ ] **8.4 Badge colour** matches the event's colour on the canvas for all four
      coloured categories, and is slate for everything else.
- [ ] **8.5** The × button closes the panel. Check what the **canvas selection**
      does on close and confirm the port matches (see quirk Q3).
- [ ] **8.6** Long titles and descriptions wrap; the panel scrolls if the
      content exceeds the window height.

## 9. BibleGateway reference tagging

- [ ] **9.1** With an event selected, the reference text (`Genesis 1:1-31`) is
      rendered by BGLinks as an **underlined link** in the panel's accent
      colour, not as plain text.
- [ ] **9.2** Hovering it opens the BibleGateway pop-over with NRSVUE text.
- [ ] **9.3 Re-tagging on change.** Select a **second** event without closing
      the panel: the new reference is *also* linked. This is the check that
      matters — `linkVerses()` must be re-run on every selection change, not
      only at page load.
- [ ] **9.4** No verse text is stored in the app's own data — the passage text
      only ever arrives from BibleGateway's script (see the comment in
      `index.html`; this is a licensing constraint, not a preference).

## 10. Theme

- [ ] **10.1 System detection.** With the OS in dark mode, a fresh load starts
      dark (near-black canvas `#13131f`, dark toolbar); in light mode it starts
      light (`#f5f5f5`).
- [ ] **10.2** Changing the OS setting **while the app is open** flips the theme
      live, canvas included.
- [ ] **10.3 Manual toggle.** The icon button flips the theme; the icon shows a
      sun in dark mode and a moon in light mode.
- [ ] **10.4** After a manual toggle, later OS theme changes are **ignored** —
      the manual choice wins for the rest of the session.
- [ ] **10.5** The theme choice does **not** survive a reload (nothing is
      persisted); a fresh load returns to the system theme.
- [ ] **10.6** The canvas background and spine colour change together with the
      DOM chrome — no frame where one is light and the other dark.

## 11. Reset View / Zoom to Selection

- [ ] **11.1 Reset View** returns to the initial 4208 BCE – 266 CE view from any
      pan/zoom position, and back into LOD A.
- [ ] **11.2** Reset View does **not** clear the current selection (the event
      stays highlighted and the inspector stays open).
- [ ] **11.3 Zoom to Selection, event.** Select an instant, press it: the view
      centres on that event. Padding is 5% of the *current* view span (an
      instant has no span of its own), so the resulting zoom level depends on
      where you were when you pressed it — press it twice in a row and it zooms
      in further each time.
- [ ] **11.4 Zoom to Selection, interval.** Select "Ehud Defeats Moab": the view
      covers the interval plus 50% of its length on each side.
- [ ] **11.5 Zoom to Selection, bin.** See 3.9.
- [ ] **11.6** With nothing selected, Zoom to Selection does **nothing** — no
      movement, no error.

## 12. Resize

- [ ] **12.1** Resizing the window re-renders at the new size with no stretching
      or blurring; the spine stays at 2/3 height and full width.
- [ ] **12.2** The visible **time range is preserved** across a resize — the
      same years stay at the left and right edges; content is not re-scaled.
- [ ] **12.3** Narrowing the window enough (fewer px per event) flips LOD B → A
      without any other interaction, and widening flips it back.
- [ ] **12.4** Opening/closing the inspector counts as a resize and behaves the
      same way.
- [ ] **12.5** On a HiDPI display the canvas is crisp (rendered at
      `devicePixelRatio`), and dragging the window between a Retina and a
      non-Retina display keeps it crisp.

## Known quirks — preserve as-is

Reproduce these; do not fix them during the port.

- **Q1 — the click threshold is horizontal-only, but the hit test is not.**
  `pointerup` compares `offsetX` alone, so a drag of any vertical distance with
  <4px horizontal movement still registers as a *click*. What that click hits is
  then resolved at the **release** point, not the press point, so a long
  vertical drag clicks empty canvas and **clears** the selection. Check: press
  on an event and release without moving — it selects; press on an event, drag
  straight down 100px and release — the selection clears and the inspector
  closes.

  > Corrected on 2026-08-30 while porting the shell (#13). The original entry
  > claimed the vertical drag still selected the event, which
  > `TimelineController.handleClick(e.offsetX, e.offsetY)` does not do. The
  > controller is byte-identical between `main` and the port, so this is a
  > mis-reading in this document, not a behavioural difference.
- **Q2 — double-click also fires a single-click first.** A double-click on a bin
  runs the click handler (selecting the bin) and then the `dblclick` handler
  (zooming). Visible as a brief selection outline before the zoom.
- **Q3 — closing the inspector doesn't deselect on the canvas.** The × clears
  the app-level selection state, but the controller keeps its `selectedId`, so
  the event stays outlined and Zoom to Selection still targets it. Confirm the
  port reproduces this exactly.
- **Q4 — `pointerleave` cancels the pan without restoring the cursor.** If a
  drag ends by leaving the canvas, `isPanning` clears but the `grabbing` cursor
  is not reset.
- **Q5 — the bin tooltip hint under-sells the interaction.** It says "Zoom to
  Selection to drill in" without mentioning that double-click does the same.
  The text is part of parity; leave it alone.
- **Q6 — category colours are declared twice**, once as Pixi hex numbers in
  `TimelineController.ts` and once as CSS strings in `Inspector.svelte`. They
  agree today. Keep them agreeing; unifying them is a reshape decision.

## Out of parity scope

Not features of the current app — a port must not add them, and their absence is
not a parity failure:

- **No tick marks or tick labels are rendered anywhere.** `getTicks()`,
  `formatTickLabel()`, and the `TickMark` type exist on the controller but are
  **never called**: no caller in `Timeline.svelte` or `+page.svelte` renders a
  time axis. The only date text on screen is the bin tooltip's year range and
  the inspector's date line, both via `formatYear`, both already covered above.
  Whether to build a real axis is a decision for the controller reshape, not for
  the port.
- **No playhead and no scrubbing.** Neither exists in the current controller.
- **No `?dataset=` switching.** One dataset is embedded; multi-dataset support
  is out of scope for the whole migration.
- **No keyboard interaction** of any kind, and no focus states on the canvas.
- **No persistence** — no saved view, selection, or theme across reloads.

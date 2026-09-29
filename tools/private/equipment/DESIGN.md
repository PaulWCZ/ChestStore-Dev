# Equipment — design

## Name and personality

**Equipment** (French: *Matériel*). **Sturdy, orderly, friendly.** The tool
crib of a workshop: steel shelves, printed labels, a strip of safety tape —
and nothing frightening.

## Tokens

Defined once in `app/tokens.css` (light, and dark by the system's choice).
Ratios computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text);
the audit (`lab/chest-dev/audit.mjs`, axe-core) passes on every screen,
light and dark.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f2ee` warm off-white | `#14181b` | page |
| `--surface` | `#ffffff` | `#1d2226` | cards, labels, fields |
| `--ink` | `#1b1f22` | `#eef1f3` | text — 14.8:1 on `--bg` / 14.1:1 on `--surface` |
| `--ink-2` | `#56606a` steel grey | `#a9b4bd` | secondary text — 5.7:1 / 7.6:1 |
| `--steel` | `#2e3d48` | `#222b32` | the header bar, toasts — white text 11.2:1 / 14.4:1 |
| `--accent` | `#c2410c` utility orange | `#ff8a4c` | the one action — white 5.2:1 / dark ink 7.1:1 |
| `--tag` | `#f06a1f` | `#ff8a4c` | asset-tag tape, safety stripe — ink 5.4:1 / 7.1:1 |
| `--focus` | `#1f6fb2` | `#8cc2f0` | focus ring — 4.7:1 on `--bg` |
| status stamps | stock `#1e7a45`/`#e1f2e7` 4.6:1, in use `#245a86`/`#e0ebf5` 6.0:1, repair `#9a4a00`/`#fdebd8` 5.4:1, lost `#b3261e`/`#fbe3e1` 5.4:1, retired `#5b636a`/`#e9e9e7` 5.0:1 | light tints on dark tints, 7.1–7.8:1 | |

Type: **IBM Plex Sans** (variable) for everything people read, **IBM Plex
Mono** for what is printed or stamped — asset tags, serial numbers, section
headings, status stamps (OFL-1.1, self-hosted in `public/fonts/`). 16 px
body. Spacing 4, 8, 12, 16, 24, 32, 48 px. Radii 4, 6, 10 px (labels are
nearly square). Shadows: a label's thin drop. Motion: 120 and 240 ms, none
with reduced motion.

## Components

- **Header**: steel bar, the mark, tabs (the current one underlined in
  orange), search; under it a **safety-tape stripe**. On a phone the tabs
  become a bottom row of icons with words.
- **Asset tag**: monospaced black on orange tape with a notched end — the
  label printed on the thing.
- **Status stamp**: uppercase monospaced ink stamp, square corners, dashed
  when retired.
- **Item line**: a label-like row (icon, name, tag, category, serial;
  stamp; holder with face; warranty/renewal in orange when ending); a card
  on a phone.
- **Item header / label card**: 1.5 px ink border, a dashed tear line under
  the tag strip — a printed label.
- **Bins** (stock per category) with a steel edge; **panels** for what needs
  attention (orange top edge when it is a warning).
- **Printed label**: QR, company, tag, name, "Scan to see or report" — the
  same drawing on screen and on the A4 sheet (print CSS, 3 × 7).
- Buttons (primary orange, quiet, link, small), fields, segmented choice,
  people picker, dialog (native `<dialog>`), "More" menu, toast with *Undo*,
  empty states with one action. 44 px targets; 3 px focus ring.

- **Receipt band** — a strip with a left rule under the holder: orange
  tape and soft orange while it waits for "I received it", stock-green
  once confirmed; the card of My equipment waiting for it wears the same
  orange outline and a *To confirm* stamp.
- **Printed forms** (handover and return sheets) — plain black on white
  paper, IBM Plex, a rule under the head, a table of items, the rules in a
  box, two signature boxes; the steel bar and the tape never print.
- **Scan box** — the inventory's one wide monospaced field that keeps the
  focus for a barcode scanner, with a progress meter above it.

## Icon

`chest/icon.svg`: an orange asset tag with its hole and three printed lines,
on a steel square. No letters; readable at 24 px on light and dark tiles.

## Why

People open this tool for a few seconds: to hand over a laptop, to check
who has the projector, on the day someone leaves. The world it borrows —
labels, stamps, tape, steel shelves — is the one they already know from the
physical stock cupboard, so every screen reads as "the inventory" at a
glance. Orange marks the one action and the tags; everything else is calm
steel and paper. It avoids Tasks' yellow and the Chest portal's black and
white.

```json showcase
{
  "adjectives": ["sturdy", "orderly", "friendly"],
  "colors": [
    { "name": "Paper", "value": "#f4f2ee" },
    { "name": "Steel", "value": "#2e3d48" },
    { "name": "Utility orange", "value": "#c2410c" },
    { "name": "Tag tape", "value": "#f06a1f" },
    { "name": "Ink", "value": "#1b1f22" }
  ],
  "fonts": { "display": { "family": "IBM Plex Sans Variable", "file": "public/fonts/ibm-plex-sans-latin-wght-normal.woff2", "weight": 650 }, "body": { "family": "IBM Plex Mono", "file": "public/fonts/ibm-plex-mono-latin-400-normal.woff2", "weight": 400 } },
  "specimen": "EQ-0042 · MacBook Pro 14″ — with Inès since 9 Oct."
}
```

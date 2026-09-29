# Equipment — design

## Name and personality

**Equipment** (French: *Matériel*). **Sturdy, orderly, friendly.** The tool
crib of a workshop: steel shelves, printed labels, a strip of safety tape —
and nothing frightening.

## The identity is a theme

"Tool crib" is a theme of the store's UI kit: `defineTheme` in
`lib/theme.ts`, value for value the kit's catalogue theme `labels`
(`test/theme.test.ts` holds the two equal), checked against every pair of
the token contract (WCAG AA, light and dark). A company may give Equipment
another look — a catalogue theme or its brand — and the tool follows: its
stylesheets name only contract tokens, and its own tokens
(`app/tokens.css`) are made of them:

| Tool token | Made of | Use |
|---|---|---|
| `--steel`, `--steel-ink`, `--steel-2` | the contract's region of its own colour: `--inverse`, `--inverse-ink`, `--inverse-ink-2` (kit 0.2.2) — dark in both modes; Tool crib's steel `#2e3d48` (dark `#222b32`), a catalogue theme's own band, a brand's deep shade | the header bar |
| `--steel-line` | `--inverse-line` (measured with `--inverse-ink` on it) | hovered and current tab, the search well |
| `--tag`, `--tag-ink` | `--accent`, `--accent-ink` | asset-tag tape, the safety stripe, the mark's tag (the tape is now `#c2410c` with white text; it was `#f06a1f` with ink) |
| `--crib-icon` | `--ink` (dark: `--ink-2`) | the drawings in bins, lines and cards |
| `--shadow-label` | the look's `--overlay`, mixed | a label's lift |
| `--paper`, `--paper-ink`, `--paper-ink-2` | the system's `Canvas`, `CanvasText` (and a dark grey mixed from them) in `color-scheme: light` | printed forms and QR labels: black on white in every look, on screen and on paper |

Statuses are the kit's `StatusBadge` (a shape or dot and a word) inked as
stamps: in stock `--ok`, in repair and low stock `--wait`, lost `--danger`,
in use slot 1 of the categorical palette (blue), retired and cancelled
slot 8 (steel, dashed). Field borders are `--line-strong` (the old
`#d9d5cc` was 1.4:1, under WCAG 1.4.11's 3:1).

What changes in another look, by the look's choice: the header is the
look's ink (a light look) or its quiet ground (a dark look); where a look's
action colour is its ink (Chest, Blueprint), the safety stripe becomes a
plain band and the mark's tag keeps only its thin edge.

Type: **IBM Plex Sans** (variable) for everything people read, **IBM Plex
Mono** for what is printed or stamped — asset tags, serial numbers, section
headings, status stamps (OFL-1.1, self-hosted in `public/fonts/`). 16 px
body. Spacing 4, 8, 12, 16, 24, 32, 48 px. Radii 4, 6, 10 px (labels are
nearly square). Shadows: a label's thin drop. Motion: 120 and 240 ms, none
with reduced motion.

## Components

- **Header**: the kit's `AppShell` as the steel bar — the mark (or the
  company's logo in brand mode), labelled tabs (the current one underlined
  in orange), the search, the member; under it a **safety-tape stripe**.
  On a phone the tabs take a row of their own, icons above words.
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
- Buttons (primary orange, quiet, link, small) and fields are the tool's;
  segmented choice, people picker, date fields, dialogs and `Confirm`,
  the "More" menu, toasts with *Undo*, filter chips, search boxes, the
  file picker, empty states, avatars are the UI kit's, restyled only where
  the tool crib needs it (stamps, the steel bar). 44 px targets; 3 px focus
  ring.

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
    { "name": "Steel", "value": "#1b1f22" },
    { "name": "Utility orange", "value": "#c2410c" },
        { "name": "Ink", "value": "#1b1f22" }
  ],
  "fonts": { "display": { "family": "IBM Plex Sans Variable", "file": "public/fonts/ibm-plex-sans-latin-wght-normal.woff2", "weight": 650 }, "body": { "family": "IBM Plex Mono", "file": "public/fonts/ibm-plex-mono-latin-400-normal.woff2", "weight": 400 } },
  "specimen": "EQ-0042 · MacBook Pro 14″ — with Inès since 9 Oct."
}
```

# Tasks — design

## Name and personality

**Tasks** (French: *Tâches*). Bright, sturdy, playful — a workshop wall of
cards, not a spreadsheet.

## Tokens

The identity is a **theme of the UI kit**: "Workshop" (French *Atelier*),
defined with `defineTheme` in `lib/theme.ts` — the very source of the kit
catalogue's `workshop` theme (`test/theme.test.ts` holds the two equal and
checks every contrast pair of `ui/tokens/CONTRACT.md`, light and dark). The
company may give Tasks another look (a catalogue theme, its brand); the CSS
names **only contract tokens**, so every screen follows. `app/tokens.css`
holds the tool's own tokens, defined from contract tokens: the column
width, and the board and label colours by name.

| Contract token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fff8e7` paper | `#161512` | page |
| `--surface` | `#ffffff` | `#201f1b` | cards, fields |
| `--ink` | `#151515` | `#f4efe3` | text — 17.3:1 on paper; 15.9:1 dark |
| `--ink-2` | `#5b574e` | `#b9b2a3` | secondary text |
| `--line-strong` | `#151515` | `#f4efe3` | the 2 px ink outlines of cards, lanes, fields |
| `--line` | `#e6dcc4` | `#3a372f` | hairlines (table rows, a description's box) |
| `--accent` / `--accent-ink` / `--accent-line` | `#ffd84d` sun / ink / ink | sun / ink / sun | the main action, the current section |
| `--accent-text` | `#1f4bff` | `#8fa8ff` | links (was `--link`) |
| `--danger` | `#c2290f` | `#ff8c73` | errors, delete |
| `--shadow-1` / `--shadow-2` | hard 3 px / 5 px ink offset | black | resting / lifted |

**Board and label colours** are slots of the theme's categorical palette
(`app/tokens.css`): sky 1, leaf 2, tomato 3, grape 4, berry 5, sea 6, sun 7,
slate 8 — in Workshop the slots' soft grounds are exactly the old fills
(grape is `#b9a3ff`, slate `#c3cad2`), always with ink on them. Nine names
for eight slots: **sand shares slate's slot** (existing sand boards and
labels keep their name; the pickers offer eight). At night a slot's soft
ground is a dark tint with the slot's own colour as text (measured by the
kit), which replaces the old 35 % tint. Due chips: late = slot 3, today =
slot 7, done = slot 2 (each also said in words); a done column wears the
"ok" state's soft ground; a mention is the marker (`--highlight`).

**Type**: *Space Grotesk* (display: headings, board and column names) and
*Inter* (everything else), both OFL-1.1, self-hosted in `public/fonts/`.
16 px body. **Shape**: 2 px ink outlines, radii 6/10/14 px, a hard offset
shadow (3 px, 5 px when lifted) — no blur. **Space**: 4, 8, 12, 16, 24, 32,
48. **Motion**: 120 and 220 ms, none with reduced motion; a card lifts on
hover and tilts while dragged.

## Components

From the UI kit (`@argentic/chest-ui/components`, restyled with Workshop's
ink edges in `app/globals.css`): the app shell (labelled sections, a row of
their own on a phone), the card search box ("/"), toasts with an *Undo*
that tells the truth, dialogs and the *Confirm* of "Delete for good", the
people picker (card, step, new board, settings), date fields, the file
picker, the column menu, avatars, empty states and the no-access page.
The tool's own: buttons (sun primary, quiet, danger, small), icon buttons,
fields and selects, choice cards (radio), swatches, chips (label, due late
/ today / done), board tiles, task rows with a round tick, lanes and cards
(normal, done, dragging, overlay), a side panel for a card (full screen on
a phone) led by a leaf-green *Mark done* button, the label pop-over, a sortable and groupable table (list view), a month grid
(calendar view; on a phone, a list of the days that hold cards), a lock
pill in the header of a private board, column chips above the board on a
phone.

## Icon

`chest/icon.svg`: a white card with a tick, on a sun square outlined in ink
with a hard shadow — the tool's shape language in 48 units. The header's
mark (`components/mark.tsx`) is the same drawing in the look's accent and
the ink measured on it; in brand mode the company's logo stands before it. No letters;
readable at 24 px on light and dark tiles (the ink outline carries it on
dark).

## Why

A task board is handled all day, often on a phone: big targets, bold
outlines and flat colours make every card easy to grab and every state
readable at a glance (late is tomato, today is sun, done is leaf and
struck). The playful shadows make it feel like moving paper cards, which
is exactly what a non-technical team expects from "a board".

```json showcase
{
  "adjectives": ["bright", "sturdy", "playful"],
  "colors": [
    { "name": "Paper", "value": "#fff8e7" },
    { "name": "Ink", "value": "#151515" },
    { "name": "Sun", "value": "#ffd84d" },
    { "name": "Tomato", "value": "#ff7a59" },
    { "name": "Grape", "value": "#b9a3ff" },
    { "name": "Leaf", "value": "#7bd05b" }
  ],
  "fonts": {
    "display": { "family": "Space Grotesk", "file": "public/fonts/space-grotesk-latin-wght-normal.woff2", "weight": 700 },
    "body": { "family": "Inter", "file": "public/fonts/inter-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Book the moving truck — due today"
}
```

# Tasks — design

## Name and personality

**Tasks** (French: *Tâches*). Bright, sturdy, playful — a workshop wall of
cards, not a spreadsheet.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fff8e7` paper | `#161512` | page |
| `--surface` | `#ffffff` | `#201f1b` | cards, fields |
| `--ink` | `#151515` | `#f4efe3` | text, outlines — 17.3:1 on paper; 15.9:1 dark |
| `--ink-2` | `#5b574e` | `#b9b2a3` | secondary text — 6.8:1 on paper; 7.8:1 dark |
| `--accent` | `#ffd84d` sun | same | the main action, current tab — ink on sun 13.2:1 |
| `--link` | `#1f4bff` | `#8fa8ff` | links, focus — 6.0:1 / 7.2:1 |
| `--danger` | `#c2290f` | `#ff8c73` | errors, delete — 5.8:1 / 7.3:1 |
| board colours | sun `#ffd84d`, tomato `#ff7a59`, berry `#f266a8`, grape `#9b7bff`, sky `#5bb4ff`, sea `#2fc6b5`, leaf `#7bd05b`, sand `#e9c79a`, slate `#9aa5b1` | same | always with ink text: 5.8:1 (grape) to 13.2:1 (sun) |
| `--head-bg` / `--head-ink` | the board's colour / ink | the colour at 35 % over `--surface` / `--ink` | a board's header and its cards' panels: full colour by day, a tint at night (the full sun yellow glared); light ink on every tint ≥ 5.3:1 |

**Type**: *Space Grotesk* (display: headings, board and column names) and
*Inter* (everything else), both OFL-1.1, self-hosted in `public/fonts/`.
16 px body. **Shape**: 2 px ink outlines, radii 6/10/14 px, a hard offset
shadow (3 px, 5 px when lifted) — no blur. **Space**: 4, 8, 12, 16, 24, 32,
48. **Motion**: 120 and 220 ms, none with reduced motion; a card lifts on
hover and tilts while dragged.

## Components

Buttons (sun primary, quiet, danger, small), icon buttons, fields and
selects, choice cards (radio), swatches, chips (label, due late / today /
done), avatars and stacks, board tiles, task rows with a round tick, lanes
and cards (normal, done, dragging, overlay), a side panel for a card (full
screen on a phone) led by a leaf-green *Mark done* button, dialogs on
`<dialog>` that open on their first field, pop-over pickers, a people
picker (a ticked list, and groups), menus, toasts with *Undo*, empty states
with one action, a sortable and groupable table (list view), a month grid
(calendar view; on a phone, a list of the days that hold cards), a lock
pill in the header of a private board, column chips above the board on a
phone.

## Icon

`chest/icon.svg`: a white card with a tick, on a sun square outlined in ink
with a hard shadow — the tool's shape language in 48 units. No letters;
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
    { "name": "Grape", "value": "#9b7bff" },
    { "name": "Leaf", "value": "#7bd05b" }
  ],
  "fonts": {
    "display": { "family": "Space Grotesk", "file": "public/fonts/space-grotesk-latin-wght-normal.woff2", "weight": 700 },
    "body": { "family": "Inter", "file": "public/fonts/inter-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Book the moving truck — due today"
}
```

# Rooms — design

## Name and personality

**Rooms** (French: *Salles*). Calm, precise, friendly — an architect's
blueprint of the office, drawn in navy ink on pale drafting paper, where
the only warm colour is *you* (your desk, your meetings) and what someone
else holds.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice — the dark
theme is the classic blueprint: deep blue paper, pale lines). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f7fc` drafting paper, with a 24 px grid and a 120 px major grid | `#0b1a30` | page |
| `--surface` / `--surface-2` | `#ffffff` / `#e8f0f9` | `#102440` / `#16304f` | cards, fields / hover, others' bookings |
| `--ink` | `#0f2447` navy | `#e8f0fb` | text, strong lines — 14.3:1 on paper; 15.2:1 dark |
| `--ink-2` | `#4a5d7e` | `#a9bcd8` | secondary text — 6.2:1 on paper, 5.8:1 on surface-2; 8.1:1 dark |
| `--line` | `#c3d3e8` | `#2b4668` | thin drafting lines (never carries text) |
| `--action` | `#0f2447` (white on it 15.4:1) | `#e8f0fb` (paper on it 15.2:1) | the one action colour: buttons, selected choices, the current day |
| `--accent` | `#c2410c` orange (white on it 5.2:1) | `#ff8a4c` (paper on it 7.5:1) | **yours or taken**: my desk, my meetings, the "now" line, today |
| `--accent-text` | `#b93d0b` (5.6:1 on white, 4.9:1 on accent-soft) | `#ff8a4c` (6.7:1 on surface, 5.8:1 on accent-soft) | orange words |
| `--accent-soft` | `#fdebe0` (navy on it 13.3:1) | `#3a2a26` | hatching of a taken desk, my booking in a list |
| `--link` | `#1f5fbf` (6.1:1) | `#8cb8ff` (7.7:1) | links, focus ring |
| `--danger` | `#b3261e` (6.5:1) | `#ff8a80` (6.8:1) | errors, remove |

**Type**: *Albert Sans* (variable, OFL-1.1) for everything people read —
a clean geometric-grotesque with a technical flavour that stays friendly;
*DM Mono* (OFL-1.1) for the drawing's annotations: desk numbers, times,
day names and the small uppercase legends ("THIS WEEK", "FIRST FLOOR"),
like the lettering on a plan. Both self-hosted in `public/fonts/`; tabular
figures for times. 16 px body.

**Shape**: thin 1 px lines, dashed for what is free (a free desk, a free
slot), solid for what is held; small radii (4/6/10 px); no shadows except
under dialogs and toasts. **Space**: 4, 8, 12, 16, 24, 32, 48. **Motion**:
120 and 220 ms (hover, toasts), none with reduced motion. The rooms' grid:
one quarter hour is 14 px; hours are full lines, quarters faint ones.

## Components

Day strip (links, today in orange, the chosen day inked), segmented choices
(*Office / Remote / Off*, *whole day / morning / afternoon*), filter chips,
day cards (a navy edge when at the office), avatar stacks (mine ringed in
orange), desk tiles (free: dashed; mine: solid orange; taken: orange
hatching with the holder's face; given: pale blue), the rooms grid (rooms as
columns, bookings as blocks — mine orange —, a drag selection outlined in
orange, the past hatched, a "now" line), room cards with free-slot chips
(phone), dialogs on `<dialog>` (a bottom sheet on a phone), a people picker,
rows, panels, toasts with *Undo*, empty states with one action. After the
critique: the *Find a free room* panel (three selects, equipment chips,
free rooms as dashed chips), desk tiles that say what they offer in words
("Screen · Dock +1") and a pale "not open yet" state, a lock and "Sales
only" in orange for places kept for a team, avatar stacks side by side
(three faces, then "+n"), the usual-week form (four-way segmented rows), and
a bar per working day for how full the office is.

## Icon

`chest/icon.svg`: a floor plan in white ink — a room with two wall
stubs — on a navy tile crossed by faint blueprint lines, and an orange dot:
you, at your place. No letters; readable at 24 px on light tiles (navy
square) and dark ones (white plan, orange dot).

## Why

People open Rooms for a few seconds, often on a phone, to answer "where"
questions. A plan is the most familiar picture of *where*: the blueprint
look makes the office readable at a glance and gives the tool a calm,
orderly identity unlike any other in the store (not the Chest's black and
white). One warm colour for "you / taken" means a single look at a day, a
desk plan or the rooms' grid tells what is yours, what is taken and what is
free — without reading.

```json showcase
{
  "adjectives": ["calm", "precise", "friendly"],
  "colors": [
    { "name": "Paper", "value": "#f3f7fc" },
    { "name": "Navy ink", "value": "#0f2447" },
    { "name": "Line", "value": "#c3d3e8" },
    { "name": "Pale blue", "value": "#e8f0f9" },
    { "name": "You / taken", "value": "#c2410c" },
    { "name": "Blueprint night", "value": "#0b1a30" }
  ],
  "fonts": {
    "display": { "family": "Albert Sans", "file": "public/fonts/albert-sans-latin-wght-normal.woff2", "weight": 650 },
    "body": { "family": "DM Mono", "file": "public/fonts/dm-mono-latin-500-normal.woff2", "weight": 500 }
  },
  "specimen": "D-04 · Thursday 09:30–10:00 · Atlas"
}
```

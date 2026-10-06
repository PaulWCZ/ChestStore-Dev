# Rooms — design

## Name and personality

**Rooms** (French: *Salles*). Calm, precise, friendly — an architect's
blueprint of the office, drawn in navy ink on pale drafting paper, where
the only warm colour is *you* (your desk, your meetings) and what someone
else holds.

## Tokens: the identity is a theme

Rooms' look is **Blueprint**, a theme of the UI kit (`@argentic/chest-ui`),
defined with `defineTheme` in **`src/theme.ts`** — every colour of the tool
is there, nowhere else — and identical to the catalogue's `blueprint` (a
test holds them equal). `checkTheme` measures every pair of the token
contract (`ui/tokens/CONTRACT.md`) in light and dark: WCAG AA for text, 3:1
for lines and controls that must be seen. The dark scheme is the classic
blueprint: deep blue paper, pale lines.

| Contract token | Light | Dark | Use in Rooms |
|---|---|---|---|
| `--bg` | `#f3f7fc` drafting paper, with a 24 px grid and a 120 px major grid | `#0b1a30` | page |
| `--surface` / `--surface-2` | `#ffffff` / `#e8f0f9` | `#102440` / `#16304f` | cards, fields / hover, others' bookings |
| `--ink` / `--ink-2` | `#0f2447` navy / `#4a5d7e` | `#e8f0fb` / `#a9bcd8` | text / secondary text |
| `--line` / `--line-strong` | `#c3d3e8` / `#0f2447` | `#2b4668` / `#e8f0fb` | hairlines / field and chip edges, the header's rule |
| `--accent` (+ `-ink`, `-line`) | `#0f2447` navy | `#e8f0fb` | the one action colour: buttons, selected choices, the current day |
| `--accent-text` | `#1f5fbf` | `#8cb8ff` | links |
| `--cat-3` (solid / soft / ink) | `#c2410c` / `#fdebe0` / `#b93d0b` | `#ff8a4c` / `#3a2a26` / `#ff8a4c` | **yours or taken** (the signal orange) |
| `--danger` | `#b3261e` | `#ff8a80` | errors, delete |

`src/tokens.css` holds only Rooms' own names, each defined from contract
tokens: `--mine` / `--mine-ink` (a filled "mine": the slot-3 ink as ground,
the surface as text), `--mine-soft` / `--mine-text`, `--mine-line` (the
"now" line, a selection: 3:1), `--grid` / `--grid-major` (the paper's grid,
decoration: `color-mix` of `--accent-text`), `--slot` (a quarter hour of
the rooms' grid). The stylesheets name no colour (`test/theme.test.ts`).

**Looks.** A company may dress Rooms in another theme of the catalogue, or
in its own brand, from its Chest: the same pages, the same words, the same
features, every pair still measured. Orange stays "yours" wherever slot 3
is an orange (in Workshop its ink is black: "mine" is then a black tile).
In brand mode the company's logo stands where the Rooms mark is.

**Type**: *Albert Sans* (variable, OFL-1.1) for everything people read —
a clean geometric-grotesque with a technical flavour that stays friendly;
*DM Mono* (OFL-1.1) for the drawing's annotations: desk numbers, times,
day names and the small uppercase legends ("THIS WEEK", "FIRST FLOOR"),
like the lettering on a plan. Both self-hosted in `public/fonts/`; tabular
figures for times. 16 px body.

**Shape**: thin 1 px lines, dashed for what is free (a free desk, a free
slot), solid for what is held; small radii (4/6/10 px); no shadows except
under dialogs and toasts (the theme's `--shadow-1/2`). **Space**: 4, 8, 12, 16, 24, 32, 48. **Motion**:
120 and 220 ms (hover, toasts), none with reduced motion. The rooms' grid:
one quarter hour is 14 px; hours are full lines, quarters faint ones.

## Components

The shared pieces are the kit's (`@argentic/chest-ui/components`, restyled
in `src/styles.css` only where Blueprint needs it: a navy rule under the
header, mono capitals on the day tiles): the shell with its labelled tabs,
toasts, dialogs and the in-page Confirm, the people picker, date fields and
24-hour time lists, the day strip, tabs and segmented choices, filters and
search box, avatars and stacks, empty states. Rooms' own:

Day strip (links, today in orange, the chosen day inked), segmented choices
(*Office / Remote / Off*, *whole day / morning / afternoon*), the kit's
filter chips (a desk's features, several at once; one scrolling line on a
phone), chips square or round with the theme (`--radius-chip`),
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
(the kit's, which no longer overlap at the small size; four places, the last one "+n" when more come), the usual-week form (four-way segmented rows), and
a bar per working day for how full the office is. The export's period is
the kit's range of days ("From", "To", and how many days).

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

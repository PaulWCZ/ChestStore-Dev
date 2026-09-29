# Forms — design

## Name and personality

**Forms** (French: *Formulaires*). A conversation on paper: lavender mist,
aubergine ink, a berry that says "this is the one thing to do", and a
marigold dot of warmth. **Warm, lively, clear.** The builder is a tidy
desk; the respondent's page is the show — big serif questions, one at a
time, keys to press, a seal when it is sent.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f3fa` lavender mist | `#16121f` | page |
| `--surface` | `#ffffff` | `#201a2c` | cards, panels |
| `--surface-2` | `#eeebf6` | `#2a2338` | tracks, quiet fills |
| `--ink` | `#1d1631` aubergine ink | `#f3effa` | text — 15.8:1 on mist; 16.3:1 dark |
| `--ink-2` | `#574d6b` | `#bdb3cf` | secondary — 7.1:1 on mist, 6.7:1 on `--surface-2`, 7.8:1 on white; 9.2:1 / 7.5:1 dark |
| `--accent` | `#b0124f` berry | `#ff8fb8` | the main action, the current tab, bars — white on berry 6.9:1, berry on mist 6.3:1; dark 8.7:1 |
| `--accent-soft` | `#fbe3ec` | `#4a1f33` | chosen cards, the folded corner — ink on it 14.3:1 |
| `--highlight` | `#f6c945` marigold | same | the mark's dot, stars in the summary, the "to answer" edge (never text) |
| `--ok` / `--warn` / `--danger` | `#1f7a4d` / `#7a4f00` / `#b3261e` | `#6fd6a0` / `#ffd27a` / `#ff8a80` | states — 4.7:1, 6.5:1 on their tints; danger 6.5:1 on white |
| `--form`, `--form-ink`, `--form-soft` | per form colour | per form colour | the respondent's page |
| `--font-display` | DM Serif Display | | titles, questions, big numbers |
| `--font-body` | DM Sans (variable) | | everything else |
| `--radius-*` | 8 / 12 / 20 / 28 px, pills | | soft cards, pill buttons, square-ish answer keys |
| `--fast`, `--slow` | 140 / 320 ms | 0 with reduced motion | |

**A form's colour.** Six, each checked (text colour on its page ground, and
its button's text): berry `#b0124f` 6.2:1 on `#fdf0f5`, white on it 6.9:1;
indigo `#3d3fc4` 6.9:1 / 7.8:1; teal `#0b6b6b` 5.8:1 / 6.3:1; tangerine
`#b3470b` 5.1:1 / 5.5:1; forest `#2c6a31` 6.0:1 / 6.5:1; ink `#1d1631`
15.6:1 / 17.3:1. In dark mode each has a light tint on a deep ground
(8.2:1 to 14.7:1). A free colour picker was refused on purpose: every
colour a company can choose is readable.

## Components

- **Form cards** (home): white cards with a folded berry corner, a status
  pill whose dot changes shape (filled open, ring draft, square closed —
  never colour alone), the answers count and a "new" badge.
- **Question cards** (builder): a coloured type icon (each family its
  tint), the number, the title; click to open the card in place: title,
  help, the kind's settings, *Required*, *Show only if…* on a berry tint,
  and a row of quiet icon buttons. *Add a question* opens a grid of the 14
  kinds with a hint each.
- **Page rules**: a dashed box under a page, "After this page: go to the
  next page", rules as sentences — *If* [question] [is] [value] *go to*
  [page].
- **The device**: the live preview in a dark phone-like frame beside the
  builder, the real respondent component.
- **The respondent's page**: the form's colour as a soft ground with a
  large faint glow, the question in the serif at 24–36 px with its number
  and an arrow, answers as outlined pills with a key letter (A, B, C…),
  filled when chosen; stars; a 0–10 row of cells (two rows on a phone);
  a dashed drop zone for files; a thin progress bar on top; up/down
  buttons and "3 of 8" at the bottom right; the thank-you seal.
- **Choice cards** (settings): who answers and how it looks, as big
  radio cards with an icon or a drawing of the layout; six colour dots.
- **Summary cards**: horizontal bars with count and percent written, the
  top answer bold; the average in the serif; the NPS as a number, a split
  bar and a legend with words and numbers.
- Toasts at the bottom with *Undo*; erasing a person's answers asks for a
  typed word.

## Icon

`chest/icon.svg`: a berry card with a folded corner holding two answers —
an empty circle and a marigold one chosen. No text; readable at 24 px on a
light or dark tile. `app/icon.svg` (the favicon) is the same drawing.

## Why

People fill in forms from someone else's link, often on a phone, often
unwillingly. Typeform proved that one calm question at a time, in a
generous serif, makes them finish; Tally proved that the builder must feel
like writing. The serif gives each form a voice (an invitation, not an
admin screen), the berry marks the one thing to press, the lavender keeps
the builder quiet around the preview. It looks like nothing else in the
store (no other tool uses a serif display on a pastel ground with keyed
pills) and nothing like the Chest's black-and-white portal.

## Showcase

```json showcase
{
  "adjectives": ["warm", "lively", "clear"],
  "colors": [
    { "name": "Lavender mist", "value": "#f5f3fa" },
    { "name": "Aubergine ink", "value": "#1d1631" },
    { "name": "Berry", "value": "#b0124f" },
    { "name": "Blush", "value": "#fbe3ec" },
    { "name": "Marigold", "value": "#f6c945" }
  ],
  "fonts": {
    "display": { "family": "DM Serif Display", "file": "public/fonts/dm-serif-display-latin-400-normal.woff2", "weight": 400 },
    "body": { "family": "DM Sans", "file": "public/fonts/dm-sans-latin-wght-normal.woff2", "weight": 450 }
  },
  "specimen": "How likely are you to recommend us? 0 · 1 · 2 … 10"
}
```

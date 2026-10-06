# Forms — design

## Name and personality

**Forms** (French: *Formulaires*). A conversation on paper: lavender mist,
aubergine ink, a berry that says "this is the one thing to do", and a
marigold dot of warmth. **Warm, lively, clear.** The builder is a tidy
desk; the respondent's page is the show — big serif questions, one at a
time, keys to press, a seal when it is sent.

## Tokens — the identity is a theme

Forms' identity is a theme of the UI kit's contract, **"Invitation"** —
the catalogue's 20th theme since 0.2.2 (`src/lib/theme.ts` is
`identityOf("forms")`, one source): every colour lives there, light and dark,
checked by `checkTheme` and `checkPalette` (`test/theme.test.ts`). The CSS
names only contract tokens (`--bg`, `--ink`, `--accent`, `--cat-5-ink`…)
and Forms' own tokens, made of them (`src/tokens.css`). The company may
give Forms another look in its Chest — a catalogue theme or its brand —
and everything below follows.

| Contract token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f3fa` lavender mist | `#16121f` | page |
| `--surface` | `#ffffff` | `#201a2c` | cards, panels |
| `--ink` / `--ink-2` | `#1d1631` aubergine / `#574d6b` | `#f3effa` / `#bdb3cf` | text |
| `--line-strong` | `#8b80a3` | `#7a6f96` | field borders — the old `#b9b0cf` was 2.1:1 on white, now 3:1 or more (WCAG 1.4.11) |
| `--accent` | `#b0124f` berry | `#ff8fb8` | the main action, the current tab, bars |
| `--accent-soft` | `#fbe3ec` | `#4a1f33` | chosen cards, the folded corner |
| `--highlight` | `#f6c945` marigold | derived (dark, it carries light text) | the marker |
| `--cat-5`… | berry, indigo (1), teal (6), tangerine (3), forest (2), ink (8) | their light tints | **a form's colours** and the kinds of questions |
| `--font-display` / `--font-body` | DM Serif Display / DM Sans | | titles and questions / everything else |
| `--radius-*` | 8 / 12 / 20 px | | soft cards, pill buttons |

Forms' own tokens (`src/tokens.css`): `--text-hero` and `--text-q` (the big
serif sizes, from the theme's scale), `--radius-xl`, `--radius-round`
(pills, square in a square theme), `--shadow-card`, `--marigold` (the
mark's dot, the summary's stars: the marker, or the ochre slot in dark
mode), `--kind-*` (the builder's question kinds on the palette's slots),
and **a form's colour** `--form`, `--form-ink`, `--form-text`,
`--form-line`, `--form-soft`, `--form-ground`.

**A form's colour.** Six, each a family of the categorical palette, set in
Forms' identity to the exact colours it always had (text on its page
ground, and its button's text): berry `#b0124f` on `#fdf0f5`, indigo
`#3d3fc4` on `#f1f1fd`, teal `#0b6b6b` on `#eef8f7`, tangerine `#b3470b`
on `#fff4ec` (5.1:1, the lowest), forest `#2c6a31` on `#f0f7ee`, ink
`#1d1631` on `#f3f2f6`; in dark mode a light tint on a deep ground. In any
other look a colour is that look's shade of the family on its surface,
and berry — the default — is the look's action colour: the company's
brand wins on its public pages unless the author chose another colour. A
free colour picker was refused on purpose: every colour a company can
choose is readable, in every look (measured in the tests).

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
- The kit's shell, toasts with *Undo* (deleting a question, a page, an
  answer, a form), dialogs, date fields, file picker, table, filters and
  badges, in the look of the page; erasing a person's answers asks in the
  kit's `Confirm`. In brand mode the company's logo stands beside the
  mark.

## Icon

`chest/icon.svg`: a berry card with a folded corner holding two answers —
an empty circle and a marigold one chosen. No text; readable at 24 px on a
light or dark tile. `public/assets/icon.svg` (the favicon) is the same drawing.

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

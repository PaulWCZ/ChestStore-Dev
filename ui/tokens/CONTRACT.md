# The token contract

Every theme — a tool's own identity, one of the catalogue, a company's
brand — defines **these CSS custom properties and no others**, in light and
dark. A tool styles itself **only** with them (and with its own tokens
derived from them, below). Then any tool wears any theme, and stays
readable in all of them, because every theme is checked against the pairs
listed here (`checkTheme` in `src/contract.ts`; the kit's tests hold every
catalogue theme and thousands of random brands to zero failures).

The list the code checks is `colorTokens`, `effectTokens` and
`staticTokens` in `src/contract.ts`; this page explains them. It was
derived from the seventeen tools' `app/tokens.css` (inventory of
2026-09-28): the names most tools already shared (`--bg`, `--surface`,
`--ink`, `--accent`…) kept their meaning.

## Colours (light and dark)

"On" says which pairs are measured. Text pairs need **4.5:1**, the things
that must be seen without being text (a field's border, the focus ring, a
button's edge, a chart's colour) **3:1** (WCAG 2.2, 1.4.3 and 1.4.11).

### Grounds and text

| Token | What it is for | Must reach |
|---|---|---|
| `--bg` | the page | — |
| `--surface` | cards, fields, menus, dialogs | — |
| `--surface-2` | a quiet fill: hover, a secondary area, a track | — |
| `--ink` | text | 4.5:1 on `--bg`, `--surface`, `--surface-2`, `--accent-soft`, `--highlight` |
| `--ink-2` | secondary text: dates, help, counts | 4.5:1 on `--bg`, `--surface`, `--surface-2` |
| `--line` | decorative hairlines (between rows, around cards) | — (never the only sign of anything) |
| `--line-strong` | lines that must be seen: field borders, a divider that carries meaning | 3:1 on `--bg`, `--surface` |

`--ink` on `--bg` is also the **inverse** pair (a toast: `--ink` ground,
`--bg` text): contrast is symmetric, so it needs no token of its own.

### The one action colour

| Token | What it is for | Must reach |
|---|---|---|
| `--accent` | the fill of the main action (one per screen) | — |
| `--accent-ink` | text and icons on `--accent` | 4.5:1 on `--accent` |
| `--accent-line` | the edge of an accent-filled control (the accent itself, or ink when the accent is too light to be seen on white — Workshop's yellow) | 3:1 on `--bg`, `--surface` |
| `--accent-soft` | a tinted ground: selected row, current tab, a chip | — |
| `--accent-text` | links and accent-coloured text | 4.5:1 on `--bg`, `--surface`, `--accent-soft` |

### States

Three states, each with a colour for text and icons, a soft ground for a
banner or a badge, and the text on that ground. **A state is never told by
colour alone**: an icon or a shape, and a word, always go with it (WCAG
1.4.1) — the "Chest" theme shows why: its states have no colour at all.

| Token | What it is for | Must reach |
|---|---|---|
| `--ok`, `--ok-soft`, `--ok-ink` | done, approved, up | `--ok` 4.5:1 on `--bg` and `--surface`; `--ok-ink` 4.5:1 on `--ok-soft` |
| `--wait`, `--wait-soft`, `--wait-ink` | waiting, due soon, a warning | same |
| `--danger`, `--danger-soft`, `--danger-ink` | errors, refused, late, destructive actions | same |

A **filled** state button (a red "Refuse"): ground `--danger`, text
`--surface`. The pair is the one measured above (contrast is symmetric),
so it needs no token of its own.

### Focus and marker

| Token | What it is for | Must reach |
|---|---|---|
| `--focus` | the keyboard focus ring (`outline: 3px solid var(--focus)`) | 3:1 on `--bg`, `--surface` |
| `--highlight` | the marker pen: a search hit, what asks for you | `--ink` 4.5:1 on it |

### The categorical palette: `--cat-N`, `--cat-N-soft`, `--cat-N-ink` (N = 1 to 8)

Labels, leave kinds, booking types, project colours, pipeline stages,
chart series: many tools need **several colours that mean nothing but
"different"**.

| Token | What it is for | Must reach |
|---|---|---|
| `--cat-N` | the category's colour: a dot, a bar, a spine, a chart series | 3:1 on `--surface`, `--bg` |
| `--cat-N-soft` | a chip's or a calendar cell's ground | — |
| `--cat-N-ink` | the label on `--cat-N-soft` (and on `--surface`) | 4.5:1 on `--cat-N-soft`, `--surface` |

The eight slots are **the same families in every theme, in the same
order**: 1 blue, 2 green, 3 orange, 4 violet, 5 pink, 6 teal, 7 ochre,
8 slate. A tool maps its categories to slots once ("holiday → 1, sick →
5"), and a holiday stays bluish in any theme; each theme tunes the shades
(its own hues within the family, its chroma) so they sit in its identity.
The Chest theme is the one exception: its eight slots are warm greys (the
portal has no colour), so there a category is told by its label only —
which every tool must show anyway.

**Why a palette per theme, and not `color-mix()` in the tool.** The two
were weighed:

- `color-mix(in oklab, var(--accent) 20%, var(--surface))` is free and
  follows any theme, but its contrast is not known until it is rendered:
  a tint that reads on Library's cream fails on Instrument's dark green,
  and a label's text on it cannot be guaranteed. Every tool would need its
  own checks, for every theme, forever.
- A palette each theme provides is **checked once, where the theme is
  made** — `defineTheme` and `deriveTheme` generate the missing slots in
  OKLCH against the theme's own surfaces, and `checkTheme` measures all 24
  tokens in both modes. A tool then uses them with no check of its own.

So: categories come from the palette; `color-mix()` is allowed only for
decoration that carries no text and no meaning (below).

## Effects (light and dark)

| Token | What it is for |
|---|---|
| `--overlay` | the veil behind a dialog, `rgb(r g b / a)` |
| `--shadow-1` | resting elevation (a card), `none` allowed |
| `--shadow-2` | raised elevation (a menu, a dialog, a toast) |

## The rest (the same in both modes)

| Token | What it is for |
|---|---|
| `--font-display` | headings |
| `--font-body` | everything else |
| `--font-mono` | code, and figures that must line up |
| `--font-accent` | a wordmark or an italic accent (the display font unless the theme says) |
| `--display-weight` | headings' weight (400 in a theme whose hierarchy is size alone) |
| `--display-tracking` | headings' letter spacing (em) |
| `--weight-strong` | the weight of emphasis: `strong`, a selected tab, a total |
| `--text-xs` `--text-s` `--text-m` `--text-l` `--text-xl` `--text-2xl` | the type scale (rem; `--text-m` is the body, 15 px at least) |
| `--leading` | the body's line height |
| `--space-1` `--space-2` `--space-3` `--space-4` `--space-5` `--space-6` `--space-7` `--space-8` | the spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 72 by default |
| `--radius-s` `--radius-m` `--radius-l` | corners: small controls, cards, big panels |
| `--radius-pill` | 999 px: pills, avatars, counters |
| `--border-width` | the width of lines (1 px, 2 px in Workshop and High contrast) |
| `--control-h` | 44 px: the smallest target — **no theme changes it** |
| `--ease` `--fast` `--slow` | motion; both durations are 0 ms when the person asks for reduced motion |

The stylesheet (`themeCss`) also sets `color-scheme`, `font-synthesis:
none` for a theme that asks it, and, when the person's system asks for
more contrast (`prefers-contrast: more`), makes `--ink-2` as dark as
`--ink` and every `--line` a `--line-strong`.

## Light-only themes

A theme may have no dark mode (`modes: "light"`): the Chest theme, because
the portal's sheet has none. Its dark scheme is its light one, the page
says `color-scheme: light`, and the stylesheet has no dark block. A tool
does nothing special: its pages simply stay light.

## A tool's own tokens

A tool keeps names of its own for what is its business alone (Leave's
kinds, a calendar's weekend, Timesheets' dark instrument panel). They are
**defined from contract tokens**, never from a colour:

```css
/* app/tokens.css of a tool */
:root {
  /* text-bearing: an alias of a measured pair */
  --kind-holiday: var(--cat-1-soft);
  --kind-holiday-ink: var(--cat-1-ink);
  --today: var(--accent-text);
  /* decoration only (no text on it, no meaning of its own) */
  --weekend: color-mix(in oklab, var(--surface-2) 60%, var(--bg));
  --grid: color-mix(in oklab, var(--line) 50%, transparent);
}
```

Rules:

1. **Anything with text on it or in it** is an alias of a contract pair
   (`var(--cat-3-soft)` with `var(--cat-3-ink)`, `var(--ink)` on
   `var(--highlight)`): its contrast was measured with the theme.
2. **Decoration** (a grid, a weekend shade, a contour line, a confetti)
   may use `color-mix(in oklab, …)` of contract tokens — **oklab, not
   oklch** (0.2.1). A near-neutral colour (a white `--surface`, a grey
   `--line`) has no real hue, and in OKLCH the browser interpolates
   whatever hue its rounding left (Chrome: `color-mix(in oklch, #2b59c3
   20%, white)` swings through pink or blue). OKLab mixes the same
   perceptual lightness with no hue to swing; `in srgb` is also safe.
3. **Never a literal colour** in a tool's CSS: it would not follow the
   theme. A tool's own identity is a theme (`defineTheme`), not a
   stylesheet.
4. A tool that needs a region in the "other" mode (Timesheets' panel is
   dark in light mode) uses the inverse pair (`--ink` ground, `--bg`
   text): in dark mode that panel becomes light — accepted, it is the
   theme's call.

## What a theme may change, and what it may not

A theme changes **the look**: colours, fonts, weights, tracking, the type
scale (body 15 px at least), spacing, corners, line width, shadows,
motion's speed. It never changes **layout, wording or accessibility**: the
44 px targets, the focus ring's presence, the contrast pairs above, the
order of things on a page, what a button says, and the fact that a state
or a category always has a word with it. A theme that would break one of
these is refused by `validateTheme` or `checkTheme`.

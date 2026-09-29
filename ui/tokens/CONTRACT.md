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

### A region of its own colour (0.2.2)

A band that keeps its colour whatever the page does — Equipment's steel
header bar, Timesheets' instrument panel, Goals' dark map margin. Before
0.2.2 such a region used the inverse pair (`--ink` ground, `--bg` text),
which turns light on a dark page and becomes plain black in a theme whose
ink is black (the steel bar "collapsed to ink" in Chest and Blueprint).
Now each theme says what its region is:

| Token | What it is for | Must reach |
|---|---|---|
| `--inverse` | the region's ground | — |
| `--inverse-ink` | text and icons in it; its focus ring (`outline-color: var(--inverse-ink)`) | 4.5:1 on `--inverse` and `--inverse-line` |
| `--inverse-ink-2` | secondary text in it (a role, a count) | 4.5:1 on `--inverse` |
| `--inverse-line` | a quiet fill or hairline in it: a hover, the current item, a field's well | — (text on it is `--inverse-ink`, measured) |
| `--inverse-signal` | the tool's signal in it (0.2.3): the current tab's rule, a running clock's mark, a filled button there (Timesheets' lime Start, Goals' marker) | 4.5:1 on `--inverse` and `--inverse-line` |
| `--inverse-signal-ink` | text and icons on `--inverse-signal` (0.2.3) | 4.5:1 on `--inverse-signal` |

When a theme does not set them, `defineTheme` derives them: in light mode
the ink as a ground (the old inverse pair), in dark mode a band a little
darker than the page, with the page's text — dark in both modes. Tool
crib (steel), Instrument (ink-green panel) and Trail map (forest margin)
set their own; a brand's is its main colour's deep shade. Nothing else of
the page goes on `--inverse`: a main button there keeps `--accent` and
`--accent-ink` (their edge, `--accent-line`, is measured on `--bg` and
`--surface` only — give it a `--inverse-ink` outline if the accent is
close to the band's colour).

**The signal on the band (0.2.3).** `--highlight` is not a colour for
the band: it is a marker pen with `--ink` on it, so in a dark look it is a
*dark* ground, and on a dark band it vanishes (Timesheets' Start button and
current tab, Goals' current tab: 1.3:1 to 2.6:1 on the band in the catalogue's dark schemes). A tool's
signature accent on its band is `--inverse-signal`, with
`--inverse-signal-ink` for words on its fill. By default it is the theme's
marker pen when that reads on the band (most light schemes), else the
marker's hue and chroma made as light as the band needs; its ink is the
band itself. Instrument pins its electric lime (`#c6ff3a`, ink `#0d1f19`)
in both modes. A theme made by hand for 0.2.2 without them stays valid:
`validateTheme` accepts their absence, and `checkTheme` and `themeCss` use
the defaults.

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

`checkPalette(theme)` holds a theme to its families (0.2.1): in each
mode, a slot's colour, soft ground and label keep a hue within 35° of
their family's (`categoryFamilies`: 255, 150, 55, 305, 355, 195, 88,
250), and the colour and label of slots 1 to 7 keep a chroma of 0.03 at
least — a label in plain black loses the category a tool paints with it
(Workshop's did, until 0.2.1). Slot 8 is a grey of any tint.

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
| `--font-read` | long text a person reads through — an article, a wiki page, a long description (0.2.2; the body font unless the theme says: Library reads in Newsreader, Letterpress in Libre Caslon Text). Never a display face: Barlow Semi Condensed, Fredoka or Young Serif make headings, not pages |
| `--display-weight` | headings' weight (400 in a theme whose hierarchy is size alone) |
| `--display-tracking` | headings' letter spacing (em) |
| `--weight-strong` | the weight of emphasis: `strong`, a selected tab, a total |
| `--text-xs` `--text-s` `--text-m` `--text-l` `--text-xl` `--text-2xl` | the type scale (rem; `--text-m` is the body, 15 px at least) |
| `--leading` | the body's line height |
| `--space-1` `--space-2` `--space-3` `--space-4` `--space-5` `--space-6` `--space-7` `--space-8` | the spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 72 by default |
| `--radius-s` `--radius-m` `--radius-l` | corners: small controls, cards, big panels |
| `--radius-pill` | 999 px: pills, avatars |
| `--radius-chip` | badges, chips, counters, filter chips (0.2.2): a pill in a theme with rounded corners, the small radius in a square one (Chest: 0; a "sharp" brand: 2 px); a theme may set it (`radius.chip`); a store tool's identity sets it in the catalogue itself, so its own copy stays equal (Sales desk: 3 px, CRM's square badges, 0.2.3) |
| `--border-width` | the width of lines (1 px, 2 px in Workshop and High contrast) |
| `--control-h` | 44 px: the smallest target — **no theme changes it** |
| `--field-pad-x` | the space between a field's edge and its text (0.2.2; `--space-3` unless the theme says, `fieldPad`): a tool's own fields and the kit's line up |
| `--ease` `--fast` `--slow` | motion; both durations are 0 ms when the person asks for reduced motion |
| `--decor` | `1` or `0` (0.2.3): whether the tool's own decoration is drawn — graph paper, stripes, a sunset, contour lines. `0` in a company's brand (its pages are the company's, not the tool's), in the Chest's sheet and in High contrast; `1` elsewhere (a theme says `decor: false`). A tool puts its decoration on a layer that reads it: `opacity: var(--decor)` on a pattern's pseudo-element, or `color-mix(in oklab, var(--line) calc(var(--decor) * 40%), transparent)` for a pattern's colour. Never text or meaning: nothing is lost at 0 |

The stylesheet (`themeCss`) also sets `color-scheme`, `font-synthesis:
none` for a theme that asks it, and, when the person's system asks for
more contrast (`prefers-contrast: more`), makes `--ink-2` as dark as
`--ink` and every `--line` a `--line-strong`.

## Public pages (0.2.3)

A tool's public host — careers, a status page, a booking page, a contact
or public form — is seen by the company's customers and candidates, not
its team. It wears **the company's brand** when the Chest's choice is a
brand, and **the tool's own identity** otherwise: a catalogue theme is a
choice the company made for its team's pages (for all tools, or for one),
and the Chest's sheet never dresses a public page (brief/05). The tool
asks for it — `resolveTheme(await chest.theme(), identity, { surface:
"public" })` — and does nothing else; the team's pages keep `surface:
"team"` (the default).

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
4. A region of its own colour (a header bar, a panel) is `--inverse` with
   `--inverse-ink` (0.2.2), not the inverse pair: it stays dark in both
   modes and each theme picks its colour. The inverse pair (`--ink`
   ground, `--bg` text) is still measured and right for a toast.
5. **Recolouring a region: never from itself.** A tool that gives one
   region another action colour redefines `--accent` there — from a
   *contract* token, never from a tool token that is already
   `var(--accent)`:

   ```css
   /* loops: --brand-accent is var(--accent), so --accent is var(--accent) — the
      browser drops both (a cycle is "invalid at computed-value time") */
   :root { --brand-accent: var(--accent); }
   .form-page { --accent: var(--brand-accent); }

   /* safe: a region takes a slot of the palette, whose pairs are measured
      (--cat-3-ink reads at 4.5:1 on --surface, so --surface reads on it) */
   .form-page[data-colour="3"] { --accent: var(--cat-3-ink); --accent-ink: var(--surface); --accent-text: var(--cat-3-ink); --accent-soft: var(--cat-3-soft); --accent-line: var(--cat-3); }
   ```

   Custom properties resolve where they are used, so a token defined from
   `--accent` and then assigned back to `--accent` refers to itself. Keep
   the region's source in a token that never names `--accent` (a palette
   slot, or the tool's own value stored under another name), and use its
   measured pairs: `--cat-N` is 3:1 (a fill, a dot, an edge), `--cat-N-ink`
   4.5:1 on `--surface` and `--cat-N-soft` (words, or a filled button with
   `--surface` words).

## What a theme may change, and what it may not

A theme changes **the look**: colours, fonts, weights, tracking, the type
scale (body 15 px at least), spacing, corners, line width, shadows,
motion's speed. It never changes **layout, wording or accessibility**: the
44 px targets, the focus ring's presence, the contrast pairs above, the
order of things on a page, what a button says, and the fact that a state
or a category always has a word with it. A theme that would break one of
these is refused by `validateTheme` or `checkTheme`.

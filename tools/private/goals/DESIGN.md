# Goals — design

## Name and personality

**Goals** (French: *Objectifs*). Calm, sturdy, outdoorsy — a trail map for
the quarter: where the summit is, how far we climbed, who carries what.

## Tokens — the identity is a theme

Goals' identity, **Trail map**, is a theme of the store's UI kit
(`@argentic/chest-ui`): `defineTheme` in `lib/theme.ts` holds every colour,
font, corner and motion of the tool, light and dark, and the catalogue's
`trail` theme is the very same source (`test/theme.test.ts` holds them
equal and checks every contrast pair of the kit's contract, WCAG AA, in
both modes). The page's look is resolved per request (`currentLook()`:
the company's choice in its Chest, else Trail map) and written by
`<ThemeStyle>` in `app/layout.tsx`, one `<style>` with the page's nonce.
The CSS names only the contract's tokens; `app/tokens.css` holds Goals'
own few, defined from them:

| Goals' idea | Trail map (light / dark) | Token now |
|---|---|---|
| sand paper, forest ink | `#f3eee2`, `#17302a` / `#0f1715`, `#efe8d8` | `--bg`, `--ink` (and `--surface`, `--ink-2`) |
| the main button | `#1f4a3f` / `#e6dcc4` | `--accent`, `--accent-ink`, `--accent-line` |
| on track · at risk · off track | `#2e6b45` · `#8a5a00` · `#a8321f` | the states `--ok` · `--wait` · `--danger` (+ `-soft`, `-ink`) |
| the sunrise (check-in, the waiting list's edge) | `#bf4f1d` / `#f08a4b` | `--sunrise` = `--cat-3` (the palette's orange slot), `--sunrise-soft`/`-ink` its soft ground and label |
| the header, the map's dark margin | forest / its dark ground | `--top-bg`, `--top-ink`: the inverse pair (`--ink` ground, `--bg` text) in light mode; the page's ground with its ink in dark mode, so it stays dark |
| the current tab's mark | peach / the accent's edge | `--top-mark` = `--highlight` (4.5:1 on ink) / `--accent-line` |
| contour lines | — | `--contour`, `--top-contour`: `color-mix(in oklab, …)`, decoration only |
| the chart's line | — | `--accent-line` (3:1 on every ground) |

Field and control borders are `--line-strong` (3:1, WCAG 1.4.11; they
were the hairline `#d6ccb8`, 1.4:1).

**Looks.** The company may give Goals another look in its Chest — any
theme of the catalogue (Workshop, Magazine, Chest, High contrast…) or its
own brand (colours, fonts, corners, logo) — for all tools or Goals alone.
Every feature stays the same, and every text stays readable: states and
categories come from the theme, the header is its inverse pair, and in
brand mode the company's logo stands where Goals' mark is. The mark itself
is drawn with the look's tokens (sand = `--bg`, forest = `--ink`, the sun
= the palette's orange); in the Trail map it is the tile's drawing exactly.

**Confidence is never a colour alone**: a filled circle (on track), a
triangle (at risk), a square (off track), a dashed ring (no check-in yet),
always with its word; the chart's points take the same shapes. **Progress is
always written** as a percentage next to its bar. A bar takes its
confidence's colour (on track, at risk, off track; neutral ink without a
check-in, and for the company's overall bar), so a tree "all orange" no
longer hides what is at risk; the chip beside it keeps the word and shape.

**Type**: *Barlow Semi Condensed* 600 (display: titles, big numbers, small
uppercase map labels) — the lettering of trail signs — and *Work Sans*
(everything else), both OFL-1.1, self-hosted in `public/fonts/`; tabular
figures everywhere. 16 px body. **Shape**: 1 px lines, radii 6/10/14 px,
soft shadows; pills for confidence. **Space**: 4, 8, 12, 16, 24, 32, 48.
**Motion**: 120 and 260 ms (bars grow, toasts rise), none with reduced
motion.

## Components

The store's UI kit (`@argentic/chest-ui/components`) gives the shell and
the common pieces, restyled only where Goals' identity asks (the dark
header with its contour lines, in `app/globals.css`): the app shell with
labelled tabs (a row of their own on a phone), the toasts (*Undo* that
tells the truth; *Sent* for a reminder), dialogs that never lose what was
typed, `Confirm` before deleting an empty cycle, people pickers (owners,
who sees a confidential objective, the import's unknown owners, handing
over), date fields (a cycle's start and end), the file picker (the
import), filter chips (the cycle, how it goes — several at once — and the
team), menus, the check-ins' table, the empty states (on a small contour
map), avatars, the confidence badge (the kit's state badge with Goals'
shapes).

Goals' own: the cycle chip with its "time gone" line; buttons (forest
primary, the sunrise check-in on its soft ground, quiet, danger); the
check-in's segmented choices (confidence in the states' colours and
shapes — the kit's `Segmented` is neutral); choice cards (level, who sees
it); progress bar + percentage; tags; objective cards with key-result
rows; tree nodes with a dashed trail and fold buttons; the key result's
SVG chart; comments; retrospective.

## Icon

`chest/icon.svg`: a sand-coloured summit with a flag, the sunrise behind it,
two contour lines, on a deep forest tile. No letters; readable at 24 px on
light and dark tiles. The header's mark is the same drawing on sand.

## Why

Objectives are a climb: a summit chosen at the start of the quarter, a
trail, weekly steps. The map's calm (sand, forest, contour lines) keeps a
page full of numbers quiet, and the single warm sunrise colour draws the eye
to one thing: how far we are. Not a dashboard's traffic lights: shapes and
words say the confidence, so the page reads the same for colour-blind
people, in black and white, and to a screen reader.

```json showcase
{
  "adjectives": ["calm", "sturdy", "outdoorsy"],
  "colors": [
    { "name": "Sand", "value": "#f3eee2" },
    { "name": "Forest", "value": "#17302a" },
    { "name": "Sunrise", "value": "#bf4f1d" },
    { "name": "Moss", "value": "#2e6b45" },
    { "name": "Ochre", "value": "#8a5a00" },
    { "name": "Brick", "value": "#a8321f" }
  ],
  "fonts": {
    "display": { "family": "Barlow Semi Condensed", "file": "public/fonts/barlow-semi-condensed-latin-600-normal.woff2", "weight": 600 },
    "body": { "family": "Work Sans", "file": "public/fonts/work-sans-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Win 20 new customers in Lyon — 45%, at risk"
}
```

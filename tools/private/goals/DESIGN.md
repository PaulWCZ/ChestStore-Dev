# Goals — design

## Name and personality

**Goals** (French: *Objectifs*). Calm, sturdy, outdoorsy — a trail map for
the quarter: where the summit is, how far we climbed, who carries what.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text, 3:1 for
interface parts).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3eee2` sand paper | `#0f1715` | page |
| `--surface` | `#fbf9f3` | `#16211e` | cards, fields |
| `--ink` | `#17302a` deep forest | `#efe8d8` | text — 12.2:1 on sand; 14.9:1 dark |
| `--ink-2` | `#4c5f58` | `#a7b3ac` | secondary text — 5.9:1 / 7.6:1 |
| `--accent` / `--accent-ink` | `#1f4a3f` / `#f7f3e8` | `#e6dcc4` / `#16211e` | the main button — 9.0:1 / 12.1:1 |
| `--sunrise` | `#bf4f1d` | `#f08a4b` | progress bars, the check-in button, focus — 4.6:1 on surface; white on it 4.8:1; 6.7:1 dark |
| `--on` / `--on-soft` | `#2e6b45` / `#e0eee3` | `#6fc48e` / `#183124` | on track — 5.3:1 / 6.6:1 |
| `--risk` / `--risk-soft` | `#8a5a00` / `#f6e8c8` | `#e2b04a` / `#33290f` | at risk — 4.9:1 / 7.2:1 |
| `--off` / `--off-soft` | `#a8321f` / `#f7ddd6` | `#f0806a` / `#3a1c16` | off track, danger — 5.2:1 / 5.9:1 |
| `--top-bg` | `#17302a` | `#0b1210` | the header, the map's dark margin; its text 12.2:1, current tab `#f08a4b` 5.7:1 |
| `--contour`, `--top-contour` | `#d8ceb9`, `#2a463e` | `#1d2926`, `#1a2724` | contour lines, decoration only |

**Confidence is never a colour alone**: a filled circle (on track), a
triangle (at risk), a square (off track), a dashed ring (no check-in yet),
always with its word; the chart's points take the same shapes. **Progress is
always written** as a percentage next to its bar.

**Type**: *Barlow Semi Condensed* 600 (display: titles, big numbers, small
uppercase map labels) — the lettering of trail signs — and *Work Sans*
(everything else), both OFL-1.1, self-hosted in `public/fonts/`; tabular
figures everywhere. 16 px body. **Shape**: 1 px lines, radii 6/10/14 px,
soft shadows; pills for confidence. **Space**: 4, 8, 12, 16, 24, 32, 48.
**Motion**: 120 and 260 ms (bars grow, toasts rise), none with reduced
motion.

## Components

Header with contour lines and tabs; cycle chip with a "time gone" line;
buttons (forest primary, sunrise check-in, quiet, danger, small); fields,
selects, segmented choices (confidence with shapes), choice cards (level);
progress bar + percentage; confidence pill; tags (quiet, needs a new owner);
objective card with key-result rows; tree nodes with a dashed trail and
fold buttons; key-result card with the SVG chart, history and a table
alternative; comments; retrospective; dialogs on `<dialog>`; menus on
`<details>`; toasts with *Undo*; empty states on a small contour map.

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

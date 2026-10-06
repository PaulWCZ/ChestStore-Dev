# Status — design

## Name and personality

**Status** (French: *État des services*). **Calm, exact, trustworthy** —
a control room, not an alarm: when something breaks, the page is where
customers go to feel reassured, so it must look steady and speak plainly.

## Looks

The identity is a theme of the UI kit: **"Control room"** (`src/lib/theme.ts`,
`defineTheme`), the very same source as the catalogue's `control-room`
(the tests hold the two equal and to the kit's contract, WCAG AA, light
and dark). A company may give Status any other theme of the catalogue or
its own brand, in its Chest: the stylesheets name only the contract's
tokens (`ui/tokens/CONTRACT.md`) and the tool's own, defined from them
(`src/tokens.css`), so every page follows. Two things stay the identity's
own: **the five state colours**, in every look (they are meaning —
`src/lib/states.ts`, measured against every theme and hundreds of derived
brands), and, in its own look only, **the dark control-panel header**
(`[data-look="own"]` in `src/styles.css`: the contract's `--inverse`
band with its `--inverse-ink`, `--inverse-ink-2` and `--inverse-line`,
dark in light and dark mode alike). Any other look keeps the kit's
header, like every tool wearing it. Incident updates and post-mortems
read in the look's `--font-read`; chips and state pills take
`--radius-chip` (square in a square look); fields `--field-pad-x`.

## Tokens (`src/lib/theme.ts` for the look, `src/lib/states.ts` for the states)

A cool grey paper, near-black ink, white panels with hairlines. Colour is
kept for states only, and a state never rests on colour: each has its own
icon shape (a check in a circle, a wrench, a bar in a rounded square, an
exclamation in a triangle, a cross in an octagon) and its word. The five
state colours follow the Okabe–Ito palette (distinguishable with the
common colour-vision deficiencies), each with an "ink" twin for text and a
tint for banners.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#eef1f4` | `#0c1015` | page |
| `--surface` | `#ffffff` | `#141a21` | panels |
| `--ink` | `#0f1419` | `#e7ecf1` | text, primary buttons |
| `--ink-2` | `#4a5561` | `#9aa7b4` | secondary text |
| `--accent-text` | `#0b5cad` | `#7cb4ff` | links |
| `--s-operational` | `#0a7f58` | `#3fbf8a` | Operational |
| `--s-maintenance` | `#1f66c7` | `#5b9cf0` | Under maintenance |
| `--s-degraded` | `#a87700` | `#e0b33a` | Degraded performance |
| `--s-partial` | `#c95a0a` | `#f08a3c` | Partial outage |
| `--s-major` | `#c42d17` | `#f2665a` | Major outage |

Contrast (scripts/contrast.mjs): ink on paper 16.3:1; `--ink-2` on paper
6.7:1, on white 7.6:1; links on white 6.7:1. Field borders are the
kit's `--line-strong`, 3:1 (the former `#b4bec9` was 1.9:1).
State colours as graphics on white, all ≥ 3:1 (operational 5.0, maintenance
5.6, degraded 4.0, partial 4.2, major 5.6); their text twins on their tints
≥ 5.2:1 (degraded ink `#7d5800` on `#fbf3dc` 5.8:1, partial ink `#a54808`
on `#fdeee3` 5.2:1, operational ink on its tint 5.7:1). Dark: every state
ink on its tint ≥ 7.3:1; `--ink-2` on panels 7.1:1. The axe-core audit
(lab/chest-dev/audit.mjs) passes on every screen, light and dark.

**Type**: Red Hat Text (variable, OFL) for everything, tabular figures for
times; Red Hat Mono (variable, OFL) for the uptime percentages. Sizes
0.75 / 0.875 / 1 / 1.25 / 1.625 / 2.125 rem. **Spacing** 4, 8, 12, 16, 24,
32, 48, 72 px. **Radii** 4 / 6 / 10 px. **Shadows**: one hairline shadow on
panels, one for toasts and dialogs. **Motion**: 120/220 ms, none with
`prefers-reduced-motion`.

## Components

- **Banner**: the page's one sentence — tint, a 6 px edge and the state's
  icon at 40 px.
- **History bar**: 90 ticks (30 on a phone), 2 px apart; a dark tooltip on
  hover or focus (the day, its state, its incidents); a sentence and a
  table for screen readers.
- **Incident card**: a 5 px edge in the incident's worst colour, a step
  chip, and a timeline (dots on a hairline, the newest filled).
- **Rows**: past incidents, a 3 px coloured edge.
- **State label**: icon + word in the state's ink colour.
- **Buttons**: ink (primary), white with a line (quiet), link; green for
  *Resolve*; 44 px targets (small and link buttons included).
- **Team frame**: the kit's AppShell — five labelled sections (Now,
  History, Services, Checks, Settings; incidents belong to Now,
  subscribers to Settings), on a phone a row of their own; in the
  identity's look an ink bar, a control panel over the calm page.
- The kit's **toasts** (an *Undo* that says whether it worked),
  **dialogs** that keep typed text (resolving, reopening, finishing a
  maintenance), **Confirm** for what cannot be undone (deleting a
  heartbeat, erasing a subscriber), **DateField** and a 24-hour
  **TimeSelect**, **Menu**, **EmptyState**, **FilePicker**,
  **LanguageSwitch** (drawn as the identity's bordered pair).

## The company's brand, the badge, the banner

- **Brand** (chest.theme(), brand mode): the whole tool wears the brand
  theme the UI kit derives (AA guaranteed); the logo replaces the
  monogram and the mark, a 3 px rule of the brand's colour under the
  public header. The state colours never change.
- **Badge** (`/badge.svg`): two flat parts, ink label (the brand's colour
  when white reads on it at 4.5:1) and the state's dark twin (white text
  5.0–7.6:1), 20 px high, words fitted with `textLength`.
- **Banner** (`/embed`): one line, the state's colour as a 6 px left edge
  and a filled circle icon, the state in bold, what is happening beneath;
  system font (a frame on another site loads no font).
- **Menus**: rarer row actions in the kit's menu with words and icons
  (move, hide, team only, delete in red, with Undo) — never a row of
  look-alike icons.

## Icon

`chest/icon.svg`: a near-black rounded panel with a history bar of four
ticks — green, green, amber, green. Readable at 24 px on light and dark
tiles (a lighter hairline outlines the panel on dark ones); no text.

## Why

A status page is read when people are worried. Grey paper and black ink
are the quietest possible ground, so the one coloured band — the state —
is the first thing seen; the ticks borrow the heartbeat bar every status
page user knows, and the mono percentages give the page an instrument's
exactness. It must not look like the Chest portal (black and white Swiss,
no state colour), like Tasks (yellow, neo-brutalist) or like a marketing
page: it is the company's, with its name and monogram on top.

```json showcase
{
  "adjectives": ["calm", "exact", "trustworthy"],
  "colors": [
    { "name": "Paper", "value": "#eef1f4" },
    { "name": "Ink", "value": "#0f1419" },
    { "name": "Operational", "value": "#0a7f58" },
    { "name": "Maintenance", "value": "#1f66c7" },
    { "name": "Degraded", "value": "#a87700" },
    { "name": "Partial", "value": "#c95a0a" },
    { "name": "Major", "value": "#c42d17" }
  ],
  "fonts": {
    "display": { "family": "Red Hat Text", "file": "public/assets/fonts/red-hat-text-latin-wght-normal.woff2", "weight": 650 },
    "body": { "family": "Red Hat Mono", "file": "public/assets/fonts/red-hat-mono-latin-wght-normal.woff2", "weight": 500 }
  },
  "specimen": "All systems operational — 99.97% uptime"
}
```

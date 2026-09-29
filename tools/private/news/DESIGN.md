# News — design

## Name and personality

**News** (French: *Actualités*). Editorial, trustworthy, warm — the
company's own newspaper, not a social feed.

## Tokens

The identity is a **theme of the UI kit**: "Newsprint" (French *Papier
journal*), defined with `defineTheme` in `lib/theme.ts` — the very source of
the kit catalogue's `newsprint` theme (`test/theme.test.ts` holds the two
equal and checks every contrast pair of `ui/tokens/CONTRACT.md`, light and
dark). The company may give News another look (a catalogue theme, its
brand); the CSS names **only contract tokens**, so every screen follows.
`app/tokens.css` holds the tool's own tokens, defined from contract tokens:
the display sizes of the nameplate and the lead headline, `--rule` (the
black rules, `--line-strong`), and the heavier weights as steps above the
theme's (`--weight-plate` 900, `--weight-heavy` 800, `--weight-label` 800,
`--weight-bold` 700 in Newsprint; all 400 in a one-weight theme).

| Contract token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f3ea` newsprint | `#121110` | page, header |
| `--surface` | `#fffdf8` | `#1c1a17` | fields, reactions |
| `--ink` / `--line-strong` | `#16130f` | `#f3ede2` | text and the black rules — 16.7:1 / 16.2:1 |
| `--ink-2` | `#5c554b` | `#b8ae9e` | bylines, dates — 6.6:1 / 8.6:1 |
| `--line` | `#d9d0bf` | `#3a352e` | hairlines, field sides (never the only sign) |
| `--accent` / `--accent-text` / `--accent-line` | `#c4121a` press red | `#ff6f61` | kickers, Important, the main action, current section — white on red 6.1:1, ink on dark red 6.8:1 |
| `--highlight` | `#f2e3b8` marker pen | `#3b331c` | what asks for you (confirm), welcome card, search hits — ink on it 14.5:1 / 10.8:1 |
| `--ok` | `#1d6b3a` | `#6fcf8f` | confirmed, coming — 5.9:1 |
| `--danger` | derived | derived | errors, the Delete button |

**Type**: *Fraunces* (OFL-1.1, variable, with italics) for everything that
is a headline — the nameplate at 900, lead headlines at 800 with tight
tracking, the welcome line in italic, drop caps; *Libre Franklin* (OFL-1.1)
for reading and for the small uppercase labels (kickers, bylines, section
names, letter-spaced 0.1–0.14em). Body 16 px, article text 18 px / 1.7, in `--font-read` (the body face in Newsprint; a catalogue theme with a reading face of its own, such as Library, sets it).
Both self-hosted in `public/fonts/` (the kit writes their `@font-face` from `lib/theme.ts`).
**Shape**: square — 2 px radii, 2 px ink borders on boxes (event, readers),
1 px black rules between stories, a 4 px + 1 px double rule under the
nameplate. No shadows but the toast's. **Space**: 4, 8, 12, 16, 24, 32, 48,
72. **Motion**: 120 / 240 ms (a cover zooms 2 % on hover, toasts rise);
none with reduced motion.

## Components

Nameplate (date line, title, double rule), section tabs (uppercase, red
underline for the current one), the "asks you" strip (highlight, red edge),
stories (lead: picture 21:9 then a 56 px headline; others: 2 columns, small
picture beside on a phone), kickers and flags (kind in red, *Pinned*,
*Important* red block, *Read* green, *New* ink block), the agenda (date
blocks), article head (kicker, headline, byline row with tools), drop cap,
event box, confirm box, welcome card, reaction pills, readers panel with a
meter, comments, the composer (kind choice cards, headline field in serif,
a text editor that shows formatting as typed under a sticky icon toolbar —
pressed tools inverted to ink —, language tabs, side cards, a sticky action
bar whose red button says who will be told, with *Schedule…* beside it),
buttons (red primary, ink outline quiet, red outline danger, all 44 px),
the kit's components dressed as the paper (square toasts, empty states between rules, fields with a ruled bottom edge, faces on the marker pen). The search: a field in the topbar (a
magnifier button on a phone), a results list under a thick rule, the words
found struck with the marker pen (`<mark>`, `--highlight`, semi-bold), the
comments found indented under a hairline edge. The audience: an ink-grey
*For Sales* flag with a people icon, a highlight notice on the article,
"Who is it for?" radio cards in the composer with group checkboxes, a
name picker (ink-outlined pill chips) and a live count. The reach panel
(a big serif percentage, counts only), the earlier versions (a hairline-
edged list under a disclosure), the gallery (a grid of 4:3 pictures,
videos full width), replies indented under their comment with @mentions
in press red, the "going out in 10 s" notice with its Undo button.

## Icon

`chest/icon.svg`: a front page — the red nameplate bar, lines of text and a
black photo block on a newsprint sheet outlined in ink. No letters; the ink
outline and the paper carry it on a dark tile, the red bar at 24 px.

## Why

An intranet news board competes with the all-staff email: it must look like
something worth reading. A newspaper is the most familiar reading interface
there is — everyone knows the biggest headline matters most, that a red
label means *important*, that a date block is an event. The strong serif
gives the company's own news some weight; the plain sans and the generous
article text keep it easy for everyone, on a phone too. It is deliberately
nothing like the Chest's Swiss black-and-white nor Tasks' yellow cards:
warm paper, one red.

```json showcase
{
  "adjectives": ["editorial", "trustworthy", "warm"],
  "colors": [
    { "name": "Newsprint", "value": "#f7f3ea" },
    { "name": "Ink", "value": "#16130f" },
    { "name": "Press red", "value": "#c4121a" },
    { "name": "Marker", "value": "#f2e3b8" },
    { "name": "Confirmed", "value": "#1d6b3a" },
    { "name": "Byline", "value": "#5c554b" }
  ],
  "fonts": {
    "display": { "family": "Fraunces", "file": "public/fonts/fraunces-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Libre Franklin", "file": "public/fonts/libre-franklin-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "We are moving on 2 November"
}
```

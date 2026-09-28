# Wiki — design

## Name and personality

**Wiki** (French: *Wiki*). Calm, literate, trustworthy — a well-made
company handbook on good paper, not a software screen.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#faf6ee` warm paper | `#16140f` | page |
| `--paper-2` | `#f3eee2` | `#1c1a14` | sidebar, quiet fills |
| `--surface` | `#fffdf8` | `#211e18` | cards, fields, the version panel |
| `--ink` | `#23201a` | `#ece5d6` | text — 15.1:1 on paper; 14.7:1 dark |
| `--ink-2` | `#5d574b` | `#b3aa98` | secondary text — 6.7:1 on paper, 6.2:1 on the sidebar; 8.0:1 / 7.6:1 dark |
| `--accent` | `#1d5b43` deep green | `#8fcfae` | the main action, links, focus — 7.4:1 on paper; white on it 8.0:1; dark 10.3:1, its ink on it 9.1:1 |
| `--accent-soft` | `#e3ede5` | `#22362b` | notes, links to pages, current choices — accent on it 6.7:1 / 7.2:1 |
| `--marker` | `#f6e3a1` highlighter | `#5c4a14` | matched words in search, selection — ink on it 12.7:1 / 6.9:1 |
| `--added` / `--removed` | `#1d6b3a` on `#e3f0e2`, `#a93226` on `#f8e1dc` | `#9fdcad` on `#1f3524`, `#ff9b8a` on `#3d201b` | history — 5.5:1 / 5.3:1; 8.4:1 / 7.3:1 |
| `--danger` | `#a93226` | `#ff9b8a` | errors, delete — 6.1:1 / 9.0:1 |
| space colours | green `#2f6e4f`, blue `#2d5b8a`, plum `#7a3f6b`, rust `#a2502c`, ochre `#a0700f`, slate `#55616c` | lighter tints | a spine, a dot, list numbers — never the only carrier of text |

**Type**: *Newsreader* (OFL-1.1, variable, with italics) for everything one
reads — titles, headings, page text at 19 px with 1.7 leading on a 40 rem
measure (about 70 characters), excerpts, search results; *Source Sans 3*
(OFL-1.1) for the interface around it. Old-style figures in text, tabular
figures in tables, small uppercase labels ("kickers") letter-spaced. Both
self-hosted in `public/fonts/`. **Shape**: hairline rules instead of boxes,
radii 5/8/14 px, soft shadows only on what floats (menus, dialogs, hovered
cards). **Space**: 4, 8, 12, 16, 24, 32, 48, 72. **Motion**: 120 and 240 ms,
none with reduced motion.

## Components

The frame (a translucent header with the search; a paper sidebar with each
space's tree, drag targets drawn as a green line or a dashed box; a drawer
on phones), buttons (green primary, quiet, small, big, danger), menus,
dialogs on `<dialog>`, fields, choice cards, colour swatches, toasts with
*Undo*, notices (someone editing, your draft), the article (kicker,
display title, byline, table of contents on wide screens, "In this section"
and "Linked from"), the prose styles (headings, lists with coloured
markers, quotes with a spine, note boxes with a round sign — note, tip,
warning —, checklists, tables with an ink head rule, code, figures with
captions, a fleuron for dividers, links to pages as soft green chips), the
editor (sticky save bar with the draft's status, a toolbar that scrolls
sideways on phones, a title that is just large text), the history (a list
of versions, words taken out struck in red, put in underlined in green,
long unchanged runs folded), search results with a highlighter, a space's
table of contents numbered like chapters, empty states with one action.
The conversation under a page reads like margin notes: comments in paper
cards beside an avatar, the author and time in the interface sans, the
text as written (line breaks kept, addresses as green links), *Edit* and
*Remove* as quiet underlined words; a highlighted card when the bell opens
it. *Watch* is a quiet button that turns green and pressed (an eye, then a
tick). A page due for review gets one notice with an ochre spine (the
spaces' ochre) and its two answers. The *New page* dialog's "Start from" is
a row of choice cards, *Blank page* already chosen; a template carries a
small green "Template" pill under its title.

## Icon

`chest/icon.svg`: an open book on a deep green square, with an ochre
ribbon — the handbook, bookmarked. No letters; the pale pages carry it on
light and dark tiles alike, readable at 24 px.

## Why

A wiki is read far more than it is written, often by someone checking a
rule before asking a colleague. It should feel like a good book: a serif
set at a comfortable size and measure, quiet margins, headings that make
a policy scannable, nothing flashing. The interface stays in a small sober
sans so it never competes with the words. Green reads as calm and "settled",
the right register for policies people rely on; the warm paper and the
highlighter-yellow search marks keep the paper metaphor all the way.

```json showcase
{
  "adjectives": ["calm", "literate", "trustworthy"],
  "colors": [
    { "name": "Paper", "value": "#faf6ee" },
    { "name": "Ink", "value": "#23201a" },
    { "name": "Deep green", "value": "#1d5b43" },
    { "name": "Mint", "value": "#e3ede5" },
    { "name": "Highlighter", "value": "#f6e3a1" },
    { "name": "Ribbon", "value": "#e2a83c" }
  ],
  "fonts": {
    "display": { "family": "Newsreader", "file": "public/fonts/newsreader-latin-wght-normal.woff2", "weight": 560 },
    "body": { "family": "Source Sans 3", "file": "public/fonts/source-sans-3-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Holidays and time off — how to ask"
}
```

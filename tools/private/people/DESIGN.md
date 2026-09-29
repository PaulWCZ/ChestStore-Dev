# People — design

## Name and personality

**People** (French: *Équipe*). Warm, welcoming, personal — a portrait
gallery on a cream wall, not an HR database.

## A theme, and every other look

People's identity is a **theme of the UI kit** (`@argentic/chest-ui`):
`defineTheme` in `lib/theme.ts`, value for value the catalogue's
**"Portrait gallery"** (`gallery`; `test/theme.test.ts` holds the two equal
and checks every contrast pair of `ui/tokens/CONTRACT.md`, WCAG AA, light
and dark). It is the tool's own look by default; a company may instead give
People any theme of the catalogue, or its own brand (then its logo stands
where People's mark is), in its Chest — for all its tools or for People
alone. The features and the layout are the same in every look.

## Tokens

Colours, fonts, sizes, corners and motion: `lib/theme.ts` (the contract's
names: `--bg`, `--surface`, `--ink`, `--accent`, `--cat-N-soft`…). Written
into the page by `<ThemeStyle>` (app/layout.tsx, with the page's nonce).
The CSS names only contract tokens and the tool's own, in `app/tokens.css`,
each defined from contract tokens — never a colour:

| Tool token | From | Use |
|---|---|---|
| `--chosen` / `--chosen-ink` | `--ink` / `--bg` (the measured inverse pair; not the contract's `--inverse` band, which stays dark in both modes) | the deep plum: current tab, "This is you" badge, chosen option, language switch |
| `--radius-xl` | `--radius-l` + 8 px | the welcome cards |
| `--weight-medium` | halfway between 400 and `--weight-strong` | names in lists, labels (500 here, 400 in the Chest theme) |
| `--bar-in` / `--bar-out` | `--accent` / `--ink` | arrivals and departures on the numbers page |

The arches behind portraits are the **categorical palette's soft grounds**
(`lib/tint.ts`: slots 3 terracotta, 7 ochre, 2 sage, 4 plum, 5 rose, 6 teal —
exactly the old six tints in the gallery, and the same families in any
theme). Field borders are `--line-strong` (3:1 on the page; the old
`#d9c7b3` was 1.6:1 and is gone).

| Gallery (light / dark) | Value |
|---|---|
| cream `--bg` | `#fbf5ec` / `#1d1420` |
| deep plum `--ink` | `#3a1f3d` / `#f6ede4` |
| terracotta `--accent` | `#b4472a` / `#f08e6a` |
| blush `--accent-soft` | `#f7e3d6` / `#432a2b` |

**Type**: *Outfit* (variable, OFL-1.1, self-hosted in `public/fonts/`; the
kit writes its `@font-face`) for everything: geometric and friendly;
headings at the theme's display weight (600) with tight tracking, 17 px
body. Eyebrows are uppercase with wide tracking in `--accent-text`.
**Shape**: pills for buttons, tabs, the search field and chips; 24–32 px
radii for cards; portraits round, set in an *arch* of their team's colour —
the tool's signature. **Motion**: 140 and 260 ms; none with reduced motion.

**Paper.** The staff register (A4 landscape) and the HR record print in a
**neutral print style**, not in the look on screen: black on white (CSS
system colours `CanvasText` on `Canvas`, `color-scheme: light`), hairlines
in grey, no shadows, the look's fonts kept. A dark theme's light ink or a
brand's tinted grounds would print pale on white paper, and a register is
handed to a labour inspector: it must read the same whatever the company
chose. The shell, actions, toasts and upload fields are not printed.

## Components

From the kit (`@argentic/chest-ui/components`, dressed in the gallery by
`app/globals.css`): the **AppShell** (labelled tabs — rounded, the current
one in plum on a wide screen; on a phone the kit's one rule, a row of
labelled tabs under the header, where People had its own bottom bar), the
member chip (a link to one's profile), **Toasts** with a truthful Undo
(« Annuler l'action »), **Confirm** before deleting a checklist or a record
for good, **PeoplePicker** (managers, tutors, who a step is given to, whom
a checklist is for — arrivals first), **DateField** (every date but the
birthday's day and month), **SearchBox** (the directory, "/" to search),
**FilePicker** (the CSV import, a record's documents, with progress),
**DataTable** (the import plan, the register, the months), **EmptyState**,
**Avatar** (every small face), **StatusBadge** (arrival/departure, late
details, a cancelled hire), **Segmented**, **LanguageSwitch**,
**BrandMark**, **NoAccess**.

The tool's own: the **portrait in its arch** (directory cards, "Say hello",
the profile, the org chart — where the face is the point); the org chart
(cards joined by thin connectors; an indented list on a phone); checklist
steps with a round tick and a due pill; the "has left" card; HR's **sheet**
(a grid of fields saved cell by cell, sticky names — not a DataTable, which
is for reading); the record (lock banner, cards per part, a star for what
the register needs); stat tiles and thin bars with their figures.

## Icon

`chest/icon.svg` (= `app/icon.svg`, `components/mark.tsx`): two cream
portraits in a terracotta arch on a deep plum tile. No text; readable at
24 px on light and dark tiles (the plum tile carries its own contrast).

## Why

A directory is about people, so faces lead: big round portraits, each in
the arch of their team's colour, make the company read as a gallery of
colleagues — the first thing a newcomer wants to see. Cream and terracotta
are warm and domestic (a welcome, not an administration); the deep plum ink
is serious enough for HR checklists and keeps text contrast high. It is far
from the store's other identities: not Tasks' yellow neo-brutalism, not
Support's teal conversations, not the Chest portal's black-and-white Swiss
grid.

```json showcase
{
  "adjectives": ["warm", "welcoming", "personal"],
  "colors": [
    { "name": "Cream", "value": "#fbf5ec" },
    { "name": "Plum ink", "value": "#3a1f3d" },
    { "name": "Terracotta", "value": "#b4472a" },
    { "name": "Blush", "value": "#f7e3d6" },
    { "name": "Sage", "value": "#d8e5d0" },
    { "name": "Ochre", "value": "#f1e2b8" }
  ],
  "fonts": {
    "display": { "family": "Outfit", "file": "public/fonts/outfit-latin-wght-normal.woff2", "weight": 600 },
    "body": { "family": "Outfit", "file": "public/fonts/outfit-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Say hello to Nora — she started on Monday"
}
```

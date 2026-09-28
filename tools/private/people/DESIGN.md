# People — design

## Name and personality

**People** (French: *Équipe*). Warm, welcoming, personal — a portrait
gallery on a cream wall, not an HR database.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbf5ec` cream | `#1d1420` night plum | page |
| `--surface` | `#fffdf9` | `#281c2c` | cards, fields |
| `--surface-2` | `#f4ebdf` | `#332537` | chips, hovers |
| `--ink` | `#3a1f3d` deep plum | `#f6ede4` | text — 13.4:1 on cream; 15.5:1 dark |
| `--ink-2` | `#6b5169` | `#cbb8c8` | secondary text — 6.4:1 on cream, 5.9:1 on surface-2; 9.6:1 / 7.7:1 dark |
| `--accent` | `#b4472a` terracotta | `#f08e6a` | the main action, counts — white on it 5.4:1; dark ink `#2a1410` on it 7.3:1 |
| `--accent-text` | `#a3401f` | `#f08e6a` | eyebrows, links — 5.1:1 on `--accent-soft`, 5.0:1+ on cream; 5.5:1 / 7.5:1 dark |
| `--accent-soft` | `#f7e3d6` | `#432a2b` | "say hello", to-do banner, focus halo |
| `--plum` / `--plum-ink` | `#3a1f3d` / `#fbf5ec` | inverted | current tab, "you" badge, toasts — 13.4:1 |
| `--ok` on `--ok-soft` | `#2f6b4a` on `#dcebdf` | `#7fc79c` on `#22382b` | "Arrival" tag, done — 5.1:1 / 6.3:1 |
| `--danger` | `#b3261e` | `#ff9a8a` | errors, late — 6.0:1 on cream / 7.9:1 dark |
| `--tint-0…5` | terracotta, ochre, sage, plum, rose, teal pastels | deep versions | the arch behind a portrait, one per team (decorative, no text on them) |

**Type**: *Outfit* (variable, OFL-1.1, self-hosted in `public/fonts/`) for
everything: geometric and friendly; 650 for titles with tight tracking,
400–600 for text; 17 px body. Eyebrows are small caps-style uppercase with
wide tracking in terracotta. **Shape**: pills for buttons, tabs, fields'
search and chips; 24–32 px radii for cards; portraits are round, set in an
*arch* (round top, soft bottom corners) of their team's tint — the tool's
signature. **Space**: 4, 8, 12, 16, 24, 32, 48, 72. **Shadows**: soft and
warm (plum at 6–14 %), none in dark. **Motion**: 140 and 260 ms; cards rise
3 px on hover; none with reduced motion.

## Components

Pill buttons (terracotta primary, quiet outline, small, danger text), icon
buttons (44 px round), fields and selects (46 px, terracotta focus halo),
a big round search field, a chips input for "Ask me about", a switch (the
birthday opt-in), segmented radios, choice cards; portrait cards on a wall
(arch, name, title, team pill, office, topics, "New" / "This is you"
badges); the "Say hello" card; profile header with a large arch; the org
chart (cards joined by thin 1.5 px connectors with rounded elbows; on a
phone, an indented list with a thread down the side); checklist steps with
a round tick, who does it (small portrait, role) and a due pill (late /
today / date); progress meters; banners (to-do, warning, done); toasts in
plum with *Undo*; dashed empty states with one action.

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
    "display": { "family": "Outfit", "file": "public/fonts/outfit-latin-wght-normal.woff2", "weight": 650 },
    "body": { "family": "Outfit", "file": "public/fonts/outfit-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Say hello to Nora — she started on Monday"
}
```

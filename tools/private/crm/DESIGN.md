# Clients — design

## Name and personality

**Clients** (the same word in English and French). *Precise, dense, calm.*
A pro tool with a monospace touch — the feel of a trading desk or a
terminal, made plain enough for a salesperson between two meetings.

```json showcase
{
  "adjectives": ["precise", "dense", "calm"],
  "colors": [
    { "name": "Slate", "value": "#f4f6f9" },
    { "name": "Ink", "value": "#0f1722" },
    { "name": "Electric", "value": "#2152ff" },
    { "name": "Won", "value": "#1f9d55" },
    { "name": "Lost", "value": "#c4231c" },
    { "name": "Today", "value": "#9a5200" }
  ],
  "fonts": {
    "display": { "family": "IBM Plex Sans", "file": "public/fonts/ibm-plex-sans-latin-600-normal.woff2", "weight": 600 },
    "body": { "family": "IBM Plex Mono", "file": "public/fonts/ibm-plex-mono-latin-500-normal.woff2", "weight": 500 }
  },
  "specimen": "Head office fit-out — €48,500 · Proposal 50%"
}
```

## Tokens

Defined once in `app/tokens.css` (light, and dark under
`prefers-color-scheme`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f6f9` | `#0b0f15` | Page (cool slate) |
| `--surface` | `#ffffff` | `#121821` | Panels, rows, cards |
| `--surface-2` | `#eef1f5` | `#19212c` | Columns, headers, hovers |
| `--line` / `--line-strong` | `#d5dbe3` / `#aeb8c5` | `#263140` / `#3a4859` | Thin rules instead of shadows |
| `--ink` / `--ink-2` / `--muted` | `#0f1722` / `#3b4656` / `#5b6676` | `#e6ebf2` / `#b3bdca` / `#8d98a8` | Text |
| `--accent` | `#2152ff` | `#6f8cff` | What acts: buttons, links, current stage |
| `--won` / `--won-bar` | `#0f7a3d` / `#1f9d55` | `#4ade80` / `#22c55e` | Won |
| `--lost` | `#c4231c` | `#ff7b72` | Lost, late, delete |
| `--today` | `#9a5200` | `#f0b35a` | Due today |

Contrast (WCAG 2, `node scripts/contrast.mjs`), all AA for text:
ink on bg 16.6:1; muted on bg 5.4:1, on surface-2 5.1:1; accent on white
5.7:1, white on accent 5.7:1; accent-soft-ink on accent-soft 6.3:1; won on
won-soft 4.8:1; lost on lost-soft 5.0:1; today on white 5.9:1; dark ink on
won-bar 5.4:1; white on lost 5.8:1. Dark: ink on bg 16.0:1; muted on
surface 6.1:1, on surface-2 5.6:1; accent on surface 5.8:1; bg on accent
6.3:1; won on surface 10.2:1; lost on surface 7.1:1; bg on lost 7.6:1;
today on today-soft 8.7:1.

**Type**: IBM Plex Sans (400–700) for words; **IBM Plex Mono** (400–600,
`tabular-nums`) for every figure — amounts, dates, counts, column totals —
and for the small spaced capital labels (`.label-mono`: *NEXT STEP*,
*HISTORY*, *OWNER*) that give the tool its terminal touch. Both OFL-1.1,
self-hosted (`public/fonts/`). Sizes 12–36 px; body 15 px.

**Spacing** 4 · 8 · 12 · 16 · 24 · 32 · 48 px. **Radii** small: 3, 6,
10 px. **Shadows** almost none: hairlines separate; a shadow only for what
floats (menus, dialogs, a dragged deal). **Motion**: 120 ms, off with
`prefers-reduced-motion`. Every target is at least 40–44 px.

## Components

- **Buttons**: primary electric blue; *quiet* white with a strong hairline;
  *won* green, *danger* red; small (34 px) in dense places.
- **Stage path**: the deal's stages as arrow segments — past tinted, current
  solid blue, the others clickable (one click moves the deal).
- **Deal card**: title, company, amount in mono, close date, a dot for its
  next step (red late, amber today, blue planned, hollow none), owner's
  avatar; a blue left edge on mine; locked (not draggable) when not mine.
- **Columns**: stage name, count, total (mono), probability; a coloured top
  rule (blue open, green won, red lost).
- **Rows**: 56 px, name bold, details muted, figures in mono, owner avatar.
- **Next step box**: a coloured left edge by urgency; *Done* first.
- **Composer**: a field and four one-tap buttons (Call, Meeting, Email,
  Note).
- **Timeline**: a thin vertical rule, round icons tinted by kind, what
  people wrote in a bordered block, what the tool recorded as a sentence.
- **Dialog** (native `<dialog>`, full screen on a phone), **toast** with
  *Undo*, **empty states** with one action.
- **Phone**: a bottom bar (My day, Deals, Companies, Contacts) under the
  thumb; the board scrolls one column at a time.

## Icon

`chest/icon.svg` (and `app/icon.svg`, `components/mark.tsx`): three white
bars narrowing like a pipeline in an electric blue square, ending on a green
dot — a deal won. No text; readable at 24 px on light and dark tiles (the
blue square carries its own contrast).

## Why

Salespeople live in numbers — amounts, dates, how many, how late — and
their manager reads a pipeline like a dashboard. Mono figures line up in
columns and read at a glance; slate and ink stay calm for a tool open all
day; the single electric blue says "this acts", green and red say only won
and lost. It looks nothing like Tasks (yellow, neo-brutalist) nor the Chest
portal (black-and-white Swiss): it is a precise instrument, still with
plain words and one obvious action per screen.

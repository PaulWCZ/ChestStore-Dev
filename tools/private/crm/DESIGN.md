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
    "display": { "family": "IBM Plex Sans", "file": "public/fonts/ibm-plex-sans-latin-wght-normal.woff2", "weight": 600 },
    "body": { "family": "IBM Plex Mono", "file": "public/fonts/ibm-plex-mono-latin-500-normal.woff2", "weight": 500 }
  },
  "specimen": "Head office fit-out — €48,500 · Proposal 50%"
}
```

## Tokens — the identity is a theme

Clients' look is **"Sales desk"**, a theme of the UI kit's token contract
(`@argentic/chest-ui`, `ui/tokens/CONTRACT.md`): `defineTheme` in
`lib/theme.ts`, the very same source as the catalogue's `sales-desk` theme
(`test/theme.test.ts` holds the two equal, and every contrast pair of the
contract, light and dark). Every colour lives there; the CSS names only
contract tokens (`--bg`, `--surface`, `--ink`, `--ink-2`, `--accent`,
`--accent-text`, `--accent-line`, `--ok`/`--wait`/`--danger` and their
`-soft`/`-ink`, `--cat-1…8`, `--font-body`, `--font-mono`, `--radius-s/m/l`…).
`app/tokens.css` keeps the tool's own names, each defined from contract
tokens, never from a colour:

| Tool token | Is | Use |
|---|---|---|
| `--won`, `--won-soft`, `--won-ink` | `--ok` family | Won: badges, the Won button (with `--surface` text), the green top rule |
| `--lost`, `--lost-soft`, `--lost-ink`, `--late` | `--danger` family | Lost, late, delete |
| `--today`, `--today-soft`, `--today-ink` | `--wait` family | Due today, look-alike warnings |
| `--chart` | `--accent-line` | A single-series bar (pipeline, what should close): 3:1 in every theme, even where the accent is a light fill |
| `--chart-won`, `--chart-lost` | `--cat-2`, `--cat-5` | The Team page's won months and lost reasons (categorical slots: green, pink-red in every theme) |
| `--accent-hover`, `--surface-3` | `color-mix()` of contract tokens | Decoration only (a button under the pointer, a closed stage) |
| `--header` | 60 px | What sticks under the header |

Stage colours on the board follow the contract too: open stages' top rule
is `--accent-line`, Won `--ok`, Lost `--danger` — always with their icon
and name. Field borders are `--line-strong` (3:1: the old `#aeb8c5`
hairline was 1.9:1 and is gone).

The company may give Clients any other look in its Chest — a catalogue
theme, or its own brand (then its logo stands where the mark is,
`BrandMark`) — with the same features; the look is resolved on the server
(`currentLook`) and written as one `<style>` with the page's nonce
(`app/layout.tsx`). Screens: `docs/screens/*-chest-*`, `*-theme-*`,
`*-brand-*`.

**Type**: IBM Plex Sans (400–700) for words; **IBM Plex Mono** (400–600,
`tabular-nums`) for every figure — amounts, dates, counts, column totals —
and for the small spaced capital labels (`.label-mono`: *NEXT STEP*,
*HISTORY*, *OWNER*) that give the tool its terminal touch. Both OFL-1.1,
self-hosted (`public/fonts/`, the kit writes their `@font-face` from the
theme). Sizes 12–36 px; body 15 px.

**Spacing** 4 · 8 · 12 · 16 · 24 · 32 · 48 px. **Radii** small: 3, 6,
10 px. **Shadows** almost none: hairlines separate; a shadow only for what
floats (menus, dialogs, a dragged deal). **Motion**: 120 ms, off with
`prefers-reduced-motion`. Every target is 44 px (`--control-h`), small
buttons 36 px in dense places.

## Components

- **Buttons**: primary electric blue; *quiet* white with a strong hairline;
  *won* green, *danger* red; small (34 px) in dense places.
- **Stage path**: the deal's stages as arrow segments — past tinted, current
  solid blue, the others clickable (one click moves the deal). On a phone it
  becomes a plain "Stage" list (arrows cut off at 390 px). *Won* is solid
  green only at the last open stage; before, it is an outline.
- **Deal card**: title, company, amount in mono, close date, a dot for its
  next step (red late, amber today, blue planned, hollow none), owner's
  avatar; a blue left edge on mine; locked (not draggable) when not mine.
  A one-line legend of the dots sits under the board's filter.
- **Columns**: stage name, count, total (mono), probability; a coloured top
  rule (blue open, green won, red lost).
- **Rows**: 56 px, name bold, details muted, figures in mono, owner avatar;
  a 44 px checkbox column for those who may change them; a sticky bar with
  a blue hairline appears when rows are ticked (give, tag, delete). Lists
  come 100 a page ("101–200 of 2,500", previous / next).
- **Picker** of records (a company, a contact): a field that searches the
  server as one types, each option a name and a muted detail, "+ New
  company “…”" last — the tool's own (it creates records), with the kit's
  keys (`listKey`), list classes and `useFloat` (the list is placed over a
  dialog's edge). People (owners) use the kit's `PeoplePicker`, `clearable`
  where a record may have no owner.
- **Next step box**: a coloured left edge by the soonest step's urgency;
  each open step with its *Done*; "Plan another step" as a link.
- **Composer**: a field and four one-tap outline buttons that say what they
  do (*Log a call*, *Log a meeting*, *Log an email*, *Add a note*) — never a
  second blue "Call" next to the one that dials.
- **Details and files**: side panels on each record — the team's own fields
  as a hairline list, files with size, author and a download icon.
- **Team report**: plain tables with a thin bar beside the figure, month
  columns of won value in green, lost reasons in red bars — no chart
  library, the same bars as *My day*.
- **Timeline**: a thin vertical rule, round icons tinted by kind, what
  people wrote in a bordered block, what the tool recorded as a sentence.
- From the UI kit, in Sales desk's precision (`app/globals.css` restyles a
  few `ck-` classes: square-cut badges, mono spaced capitals in table
  headers): the **shell** (sections as labelled tabs; a row of their own
  under the header on a phone), **toasts** with an Undo that tells the
  truth, **dialogs** that ask before losing what was typed, **Confirm** for
  what cannot be undone, **DateField** and **TimeSelect**, **DataTable**,
  **SearchBox** ("/"), **Segmented** (Board / List, its link variant:
  each view is an address), **Tabs** (settings),
  **Menu** ("More"), **FilePicker**, **StatusBadge**, **Avatar**,
  **EmptyState**, **NoAccess**.
- **Phone**: the sections under the header, the search under them; the
  board scrolls one column at a time.

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

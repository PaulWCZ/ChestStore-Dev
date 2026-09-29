# Timesheets — design

## Name and personality

**Timesheets** in English, **Temps** in French — short, and said the same
way by everyone who ever filled one. *Precise, calm, luminous.* A
stopwatch: a deep ink-green instrument panel, a cool paper page, one lime
signal that lights up only when time is running. It is the catalogue
theme **Instrument** of the UI kit; the company may choose another look.

## The identity is a theme

Timesheets' look is the UI kit's catalogue theme **Instrument**
(`@argentic/chest-ui`, `identityOf("timesheets")` in `lib/theme.ts`): one
source, so the tool's own look and the look a company picks from the
catalogue are the same, checked against every pair of the kit's contract
(WCAG AA, light and dark) by `test/theme.test.ts`. A company may give the
tool another look in its Chest — any theme of the catalogue, or its own
brand (its colours, fonts, corners and logo) — with the same features:
the stylesheets name only the contract's tokens (`ui/tokens/CONTRACT.md`)
and the tool's own tokens, which are defined from them.

Instrument's values (light / dark): paper `--bg` `#eef1ec` / `#08130f`,
`--surface` `#ffffff` / `#0e1c17`; `--ink` `#0d1f19` / `#e3eee8`;
`--accent` `#0f5b43` / `#8fe3bd`; `--line-strong` `#7a8e84` / `#4e6d5f`
(3:1 on paper and white); `--highlight` `#e4f9b0` / `#2c3d10`; the project
colours are its categorical palette.

**The tool's own tokens** (`app/tokens.css`, all from contract tokens):

| Token | From | Use |
|---|---|---|
| `--panel`, `--panel-ink` | `--inverse`, `--inverse-ink` (kit 0.2.2) | The instrument panel: header, timer, the report's total tile, the chosen chip and day; its text and its focus ring |
| `--panel-ink-2` | `--inverse-ink-2` | Secondary text on the panel (a measured pair) |
| `--panel-line`, `--panel-field-line` | `--inverse-line`; `color-mix` of `--inverse-ink` into `--inverse` | The panel's hairline (decoration); a field's edge on the panel |
| `--signal`, `--signal-ink` | `--highlight`, `--ink` | today's pill in the grid, the toasts' edge, a *Start* off the panel — never text on the panel |
| `--panel-signal`, `--panel-signal-ink` | `--inverse-signal`, `--inverse-signal-ink` (kit 0.2.3) | on the panel: *Start*/*Stop*, the current tab's rule, the running clock's glow and rule, the mark's hand — measured on the panel in every look and mode (Instrument's lime in both) |
| `--today`, `--chosen` | `color-mix` of `--highlight` and `--surface`; `--surface-2` | Today's column; the row under the pointer, open forms |
| `--billable`, `--other` | `--accent-line`, `--cat-8` | Chart bars (3:1 on the card) |
| `--w-body`, `--w-semi`, `--w-bold` | computed from `--weight-strong` | Instrument's 500 / 650 / 750, and 400 in a theme that forbids synthetic bold (Chest) |
| `.c-sky` … `.c-indigo` → `--c` | `--cat-1` … `--cat-8` | Project colours: sky 1, olive 2, coral 3, violet 4, rose 5, teal 6, amber 7, slate 8 (stored as "indigo", named *Slate*) |

The panel is the theme's region of its own colour (`--inverse`, kit
0.2.2): Instrument's deep ink-green in both modes (`#0c231b` light,
`#050d0a` dark), a brand's deep shade, the ink (or a band darker than the
page) in the other themes — it no longer turns light in a dark look. The
signal is the theme's marker pen: Instrument's electric lime `#c6ff3a` in
light (kit 0.2.1), a dark olive ground in dark. Since the marker is a dark
ground in a dark look, text on the panel is `--inverse-ink` (the running
clock glows lime around it); the lime stays for grounds with ink on them
(*Start*, today) and for rules. A company logo on the panel is its
dark-ground variant (`BrandMark ground="dark"`).

**Type**: Manrope (OFL, variable 200–800) for words — a geometric grotesk,
weights 500 to 800; **Martian Mono** (OFL, variable) for every number, with
tabular figures, so columns of hours line up like a ruler. Labels are small
capitals with wide tracking. Sizes 12 / 14 / 16 / 20 / 28 / 36 px.

**Space** 4-8-12-16-24-32-48; **radii** 4 / 8 / 12 (chips follow the theme: `--radius-chip`, pills in Instrument);
**shadows** almost none — hairlines do the work; **motion** 120/240 ms, the
running swatch beats every 2 s (off with `prefers-reduced-motion`).

## Components

- **Timer line** — note, project picker, clock, *Start* (lime); running: the
  clock brightens and glows lime, a lime rule under the panel, *Stop* and a quiet *Discard*.
- **Week grid** — a table with a ruler of tick marks under the day names,
  mono cells you type in, today in a lime pill, locked days hatched, totals
  in a grey foot; rows removed with ×.
- **Day list** — entries with a colour bar, project · task, client, note,
  mono duration and timer span; pencil and bin; inline form.
- **Day strip** (phone) — seven day keys with their totals; the chosen one
  dark with a lime underline.
- **Chips and segmented controls** (reports), **tiles** (total in lime on the
  panel), **bars** (billable accent, non-billable grey), **budget meters**
  (accent → warn at 80 % → danger over).
- **Buttons** — primary (accent), quiet (outlined), link, signal (lime);
  44 px targets. **Toasts** are the kit's (the inverse pair, *Undo* that
  says whether it worked), with the signal on their edge.
- **The kit's components** — the shell (header as the panel, labelled tabs,
  a row of their own on a phone), toasts, dialog and confirm, date fields,
  the file picker, tables (the team's weeks, the report's breakdown),
  segmented choices, badges, avatars, empty states: styled by
  `@argentic/chest-ui/components.css`, dressed here with the instrument's
  small-capital labels.
- **Project picker** — a field one types into (a combobox): the list drops
  under it, each line a colour dot, project · task and the client in grey;
  the active line has an accent edge.
- **Week standing** — a bar above the grid: *Send my week* (accent) when
  open; soft accent when sent or approved (with a check); warn-soft when
  sent back, the manager's word quoted in ink.
- **Cell note** — a small note icon in the cell's corner (shown on hover or
  focus, always in accent when there is a note); a popover card with a
  textarea.
- **Team table** — the kit's DataTable: people × weeks, mono hours with a
  state badge under them (a shape and a word): approved (ok), sent (info),
  sent back (wait), short (danger).
- **Money tiles** — amount, cost, margin (danger when negative) beside the
  hours.

## Icon

`chest/icon.svg`: a stopwatch — a light ring and crown on an ink-green
tile, a lime hand at a quarter past. No text; readable at 24 px on light
and dark tiles.

## Why

Time tracking is measuring. The people who use it every day — designers,
developers, consultants, the office manager who invoices — need to read
numbers fast and trust them: hence the mono figures, the ruler, the quiet
paper. The dark panel on top holds the one thing that moves (the running
clock) and makes it impossible to miss that a timer is running — the lime
is only ever used for that and for starting it. It looks like neither the
Chest's black-and-white portal nor Tasks' yellow boards.

```json showcase
{
  "adjectives": ["precise", "calm", "luminous"],
  "colors": [
    { "name": "Panel", "value": "#0c231b" },
    { "name": "Signal", "value": "#c6ff3a" },
    { "name": "Paper", "value": "#eef1ec" },
    { "name": "Accent", "value": "#0f5b43" },
    { "name": "Ink", "value": "#0d1f19" },
    { "name": "Coral", "value": "#d9542c" }
  ],
  "fonts": {
    "display": { "family": "Manrope Variable", "file": "public/fonts/manrope-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Martian Mono Variable", "file": "public/fonts/martian-mono-latin-wght-normal.woff2", "weight": 500 }
  },
  "specimen": "Site vitrine · Design — 1:30"
}
```

# Timesheets — design

## Name and personality

**Timesheets** in English, **Temps** in French — short, and said the same
way by everyone who ever filled one. *Precise, calm, luminous.* A
stopwatch: a deep ink-green instrument panel, a cool paper page, one lime
signal that lights up only when time is running.

## Tokens

Defined once in `app/tokens.css` (light, and dark with the system).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--panel` | `#0c231b` | `#050d0a` | Header and timer (dark in both modes) |
| `--panel-2` | `#14342a` | `#0d1f18` | The timer line |
| `--panel-ink` / `--panel-ink-2` | `#e9f3ed` / `#a9c2b6` | same | Text on the panel |
| `--signal` | `#c6ff3a` | `#c6ff3a` | Running clock, *Start*/*Stop*, today, current tab |
| `--bg` / `--surface` | `#eef1ec` / `#ffffff` | `#08130f` / `#0e1c17` | Paper |
| `--ink` / `--ink-2` | `#0d1f19` / `#4a5d55` | `#e3eee8` / `#9db3a8` | Text |
| `--accent` | `#0f5b43` | `#8fe3bd` | Buttons, links, billable bars |
| `--line` / `--line-strong` | `#cfd8d1` / `#7a8e84` | `#213a30` / `#4e6d5f` | Hairlines / field borders |
| `--warn`, `--danger` | `#8a5a00`, `#b42318` | `#f3c46b`, `#ff8f84` | Locked period, budgets near/over |
| `--c-teal` … `--c-olive` | 8 project colours | lighter in dark | Swatches, entry bars |

Contrast (WCAG 2, `scripts/contrast.mjs`): ink on paper 15.0:1; ink-2 on
paper 6.2:1, on white 7.0:1; white on accent 8.1:1; accent on paper 7.1:1;
panel ink on panel 14.6:1, panel ink-2 on panel-2 7.1:1; signal ink on
signal 14.0:1, signal on panel 14.0:1; warn on its soft 5.2:1; danger on
white 6.6:1. Dark: ink 15.9:1, ink-2 on surface 7.9:1, accent-ink on accent
11.3:1, danger 8.0:1. Field borders 3.5:1 (light), 3.1:1 (dark). The studio's
axe audit passes on every screen, light and dark.

**Type**: Manrope (OFL, variable 200–800) for words — a geometric grotesk,
weights 500 to 800; **Martian Mono** (OFL, variable) for every number, with
tabular figures, so columns of hours line up like a ruler. Labels are small
capitals with wide tracking. Sizes 12 / 14 / 16 / 20 / 28 / 36 px.

**Space** 4-8-12-16-24-32-48; **radii** 4 / 8 / 12 (pills for chips);
**shadows** almost none — hairlines do the work; **motion** 120/240 ms, the
running swatch beats every 2 s (off with `prefers-reduced-motion`).

## Components

- **Timer line** — note, project picker, clock, *Start* (lime); running: the
  clock glows lime, a lime rule under the panel, *Stop* and a quiet *Discard*.
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
  44 px targets. **Toasts** on the panel with a lime edge and *Undo*.
- **Empty states** — dashed card, one sentence, one action.
- **Project picker** — a field one types into (a combobox): the list drops
  under it, each line a colour dot, project · task and the client in grey;
  the active line has an accent edge.
- **Week standing** — a bar above the grid: *Send my week* (accent) when
  open; soft accent when sent or approved (with a check); warn-soft when
  sent back, the manager's word quoted in ink.
- **Cell note** — a small note icon in the cell's corner (shown on hover or
  focus, always in accent when there is a note); a popover card with a
  textarea.
- **Team table** — people × weeks, mono hours with a small state under
  them: approved/sent in accent, sent back in warn, short in danger.
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

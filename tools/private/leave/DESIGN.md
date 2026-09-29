# Leave — design

## Name and personality

**Leave** (French: *Congés*). Soft, calm, friendly — a postcard from the
seaside, not an HR form. Time off is good news: the tool should feel like
it.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f7fb` sky mist | `#0f1720` night sea | page |
| `--surface` | `#ffffff` | `#17212c` | cards, fields |
| `--ink` | `#1d2b3a` deep navy | `#eaf1f8` | text — 13.4:1 on mist |
| `--ink-2` | `#4b5b6e` | `#a9b8c8` | secondary text — 6.5:1 on mist, 6.9:1 on white; 8.9:1 dark |
| `--accent` | `#2366a8` sea | `#8cc4f5` | the main action, links, focus — white on sea 5.9:1; navy on light sea 8.4:1 |
| `--sun` | `#ff9e6e` | same | the mark, the counts on tabs (dark brown text 7.8:1) |
| `--wait` / `--wait-soft` | `#7a5600` on `#fdf0c7` | `#f5d77a` on `#3a3014` | "Waiting" — 5.9:1 / 9.2:1 |
| `--ok` / `--ok-soft` | `#1b7a4b` on `#d8f3e5` | `#7fdcaa` on `#173a2a` | "Approved", balance after — 4.6:1 / 7.6:1 |
| `--danger` / `--danger-soft` | `#b42318` on `#fde4e1` | `#ff9b8f` on `#3d1c1a` | "Refused", errors — 5.4:1 / 7.5:1 |
| `--holiday` | `#fff1e8`, ink `#8a3a10` | `#2c1f18`, `#ffd2ba` | public holidays — 7.1:1 / 11.5:1 |
| kinds of leave | sky `#d6e9fb`/`#174a7c`, mint `#cff0e0`/`#125c3e`, peach `#ffe0cf`/`#8a3a10`, lilac `#e6e0fb`/`#4a3a8f`, sun `#fdefb8`/`#6e5200`, rose `#fbd9e3`/`#8c2346`, sand `#efe7da`/`#5b4b34`, sea `#cdeff0`/`#0f5a5e`, away `#dde3ea`/`#36475a` | deep fills with pale inks | each fill with its own ink: 6.2:1 to 7.4:1 light, 8.3:1 to 10:1 dark |

**Type**: *Nunito* (display: headings, big numbers, buttons — rounded
terminals, weight 800–900) and *Nunito Sans* (body), both OFL-1.1,
self-hosted in `public/fonts/`. 16 px body. **Shape**: radii 10 / 14 / 20 /
28 px and pills; soft blurred shadows, never hard ones; 1.5 px lines.
**Space**: 4, 8, 12, 16, 24, 32, 48. **Motion**: 140 and 260 ms, eased; none
with reduced motion.

## Components

Pill buttons (sea primary, big, quiet, small, danger), round icon buttons,
fields and selects, segmented controls (whole day / morning / afternoon),
kind cards (radio, a dot when chosen), kind chips (solid when approved,
striped and dashed when waiting), status pills, balance cards (a big
rounded number), the hero (greeting, a sun over the sea), a peach banner
("2 requests wait for your answer"), request rows, answer cards, a timeline
of what happened, the month grid (sticky names and days, bars that join
across days, half-day halves, shaded week-ends and holidays, today ringed),
the absence cards by week for phones, rest days hatched in a part-timer's
row, tables for people and history (computed "End of the year" lines in
italics on grey), week-day toggles (pill checkboxes Mon–Sun), HR's
first-run checklist (a sea-bordered card with round ticks), the import's
mapping box (the "waiting" yellow: something to answer), settings panels,
the bottom tab bar on phones, dialogs on `<dialog>`, toasts with *Undo*,
empty states.

## Icon

`chest/icon.svg`: a sun setting over a calm sea on a pale sky square —
holidays in one picture, no letters. Readable at 24 px: the deep blue sea
carries it on a light tile, the pale sky square on a dark one.

## Why

Asking for time off is a small anxious moment ("how many do I have? will
they say yes?"), answered by the number first: big, calm, rounded figures
and pastel cards make the balance the first thing read. The calendar is the
one dense screen, so it stays crisp: one colour per kind, stripes for
"not yet", neutral grey when a colleague may not know why. The palette —
sky, peach, mint, a low sun — is the holiday itself; it is far from the
Chest portal's black-and-white and from Tasks' ink-outlined yellow.

```json showcase
{
  "adjectives": ["soft", "calm", "friendly"],
  "colors": [
    { "name": "Sky mist", "value": "#f3f7fb" },
    { "name": "Navy", "value": "#1d2b3a" },
    { "name": "Sea", "value": "#2366a8" },
    { "name": "Sky", "value": "#d6e9fb" },
    { "name": "Peach", "value": "#ffe0cf" },
    { "name": "Mint", "value": "#cff0e0" },
    { "name": "Sun", "value": "#ff9e6e" }
  ],
  "fonts": {
    "display": { "family": "Nunito", "file": "public/fonts/nunito-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Nunito Sans", "file": "public/fonts/nunito-sans-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "7.25 days of paid leave left"
}
```

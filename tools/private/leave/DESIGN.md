# Leave — design

## Name and personality

**Leave** (French: *Congés*). Soft, calm, friendly — a postcard from the
seaside, not an HR form. Time off is good news: the tool should feel like
it.

## Its identity is a theme: "Seaside"

Leave's look is a theme of the UI kit (`@argentic/chest-ui`): **every
colour, font, corner and speed is in `lib/theme.ts`** (`defineTheme`),
checked against every pair of the kit's contract (`ui/tokens/CONTRACT.md`,
WCAG AA, light and dark) by `test/theme.test.ts`, and held equal, value for
value, to the catalogue's "Seaside" theme — a company that picks Seaside
for all its tools gets exactly Leave's own look.

The company may give Leave another look in its Chest (a catalogue theme,
or its own brand): the pages then wear it with the same features. So the
CSS names **only contract tokens** (`--bg`, `--surface`, `--ink`,
`--accent`, `--cat-N-soft`…) and Leave's own tokens in `app/tokens.css`,
which are defined from them, never from a colour (the test checks it).

| In the Seaside theme | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f7fb` sky mist | `#0f1720` night sea | page |
| `--surface` | `#ffffff` | `#17212c` | cards, fields |
| `--ink` / `--ink-2` | `#1d2b3a` / `#4b5b6e` | `#eaf1f8` / `#a9b8c8` | text, secondary text |
| `--accent` | `#2366a8` sea | `#8cc4f5` | the main action, links, focus |
| `--line-strong` | `#818b96` (derived) | `#647486` (derived) | field borders — Leave's old `#b8c8da` (1.6:1) failed WCAG 1.4.11's 3:1; the kit derives one that passes |
| states | wait `#7a5600` on `#fdf0c7`, ok `#1b7a4b` on `#d8f3e5`, danger `#b42318` on `#fde4e1` | the pale inks on deep grounds | badges (always a shape and a word) |
| categorical slots 1–8 | the kinds' fills and inks: sky `#d6e9fb`/`#174a7c`, mint `#cff0e0`/`#125c3e`, peach `#ffe0cf`/`#8a3a10`, lilac `#e6e0fb`/`#4a3a8f`, rose `#fbd9e3`/`#8c2346`, sea `#cdeff0`/`#0f5a5e`, sun `#fdefb8`/`#6e5200`, sand `#efe7da`/`#5b4b34` | deep fills with pale inks | kinds of leave |

**Leave's own tokens** (`app/tokens.css`):

| Token | From | Use |
|---|---|---|
| `.k-sky` … `.k-sand` → `--k`, `--k-ink`, `--k-line` | slot N's `--cat-N-soft`, `--cat-N-ink`, `--cat-N` (sky 1, mint 2, peach 3, lilac 4, rose 5, sea 6, sun 7, sand 8: the slots' families in every theme) | a kind's chip, card, balance and calendar bar — a kind keeps its colour family whatever the look, and stays AA |
| `.k-away` | `--surface-2`, `--ink-2`, `--line-strong` | a colleague's leave (the kind is not theirs to know) |
| `--holiday`, `--holiday-ink` | a mix of slot 3's soft ground and the surface; slot 3's ink | public holidays in the calendar |
| `--weekend` | a mix of `--surface-2` and `--surface` (decoration) | week-ends in the calendar |
| `--count`, `--count-ink` | slot 3's ink, `--surface` | the waiting count on the approvals tab |
| `--radius-xl` | `--radius-l` + 8 px | the big rounded cards |

In the "Chest" theme the categorical slots are warm greys (the portal has
no colour): a kind is then told by its label, which every chip and card
carries; the calendar's bars say who and what in their title and for
screen readers.

**Type**: *Nunito* (display: headings, big numbers, buttons — weight 800,
`--display-weight`) and *Nunito Sans* (body), both OFL-1.1, self-hosted in
`public/fonts/` (the kit writes the `@font-face`). **Shape**: radii 10 /
14 / 20 (+28 for the big cards) and pills; soft shadows. **Motion**: 140
and 260 ms, eased; none with reduced motion.

## Components

From the kit (`@argentic/chest-ui/components`, restyled only where the
identity asks: pill tabs in a tray on a wide screen, peach initials):
the app shell with labelled tabs (a row under the header on a phone),
toasts with an *Undo* that tells the truth, the dialog that keeps typed
text, date fields (typed in the reader's language or chosen on a
calendar), the people picker (who a request is for, a person's approver),
segmented controls (whole day / morning / afternoon), the people table,
filters (whose absences), tabs, status badges, avatars, empty states, the
file picker (imports), the no-access page, the language switch.

Leave's own: pill buttons (sea primary, big, quiet, small, danger), kind
cards (radio, a dot when chosen), kind chips (solid when approved, striped
and dashed when waiting), balance cards (a big rounded number), the hero
(greeting, a sun over the sea), a peach banner ("2 requests wait for your
answer"), request rows, answer cards, a timeline of what happened, the
month grid (sticky names and days, bars that join across days, half-day
halves, shaded week-ends and holidays, today ringed), the absence cards by
week for phones, rest days hatched in a part-timer's row, the balance
history table (computed "End of the year" lines in italics — its own:
the kit's table has no row styles), week-day toggles, HR's first-run
checklist, the import's mapping box, settings panels.

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

# Booking — design

## Name and personality

**Booking** (French: *Rendez-vous*). An appointment card: warm paper,
plum ink, a stamp of mint when a time is free and when it is yours.
Polite and quick — a visitor books in three clicks and three fields.

## Tokens

The identity is a **theme of the UI kit** (`@argentic/chest-ui`):
`defineTheme` in `lib/theme.ts`, identical to the catalogue's
"Appointment card" (`appointment`; `test/theme.test.ts` holds them equal
and checks every contrast pair of the kit's contract, light and dark).
Every colour lives there; the CSS names only contract tokens, so the
company may give Booking any other look (see README, "Looks").

| Contract token | Light | Dark | Use in Booking |
|---|---|---|---|
| `--bg` | `#fbf7f1` paper | `#17121b` | page |
| `--surface` | `#ffffff` | `#211a27` | cards, the booking sheet |
| `--ink` / `--ink-2` | `#24172e` plum ink / `#5f5268` | `#f4eef8` / `#bcaec6` | text, secondary text |
| `--accent` | `#5b2a86` plum | `#cfaef2` | the main action, the page's ticket |
| `--accent-soft` | `#f0e7f8` | `#37284a` | soft buttons, chosen choices |
| `--ok` (+ `-soft`, `-ink`) | `#0b6e55` mint ink | `#7fdcbc` | what is free: days, times, a calendar read well |
| `--wait` (+ `-soft`, `-ink`) | `#974503` apricot | `#f5b271` | today's mark and tag, notices |
| `--danger` (+ `-soft`, `-ink`) | `#b3261e` | `#ff8a80` | cancelling, erasing |
| `--cat-1` … `--cat-8` | sky, leaf, tomato, grape, berry, sea, sun, slate | lighter in dark | a booking type's edge and swatch (never text) |
| `--line-strong` | derived by the kit (3:1) | | field borders (the old `#cbbdae` was under 3:1) |
| `--font-display` / `--font-body` | Young Serif / Figtree | | titles, times, the month / everything else |
| `--radius-s/m/l` | 8 / 14 / 22 px, pills | | soft cards, round days, pill buttons |

Booking's own tokens (`app/tokens.css`) are aliases of those: `--free*` →
`--ok*`, `--today*` → `--wait*`, `--c-<colour>` → `--cat-N` (a type keeps
its family in every look), `--edge` (1.5 px, or the theme's thicker line)
and the mark's mint (a `color-mix`, decoration only).

## Components

- **The ticket**: the host's page link on the agenda, plum with two
  punched holes — the one thing to share.
- **The agenda**: days in small capitals (*Tomorrow* tagged), meetings as
  rows with the time large in the serif and the type's colour as a left
  edge.
- **The booking sheet**: what on the left (on a paper gradient, dashed
  tear line), when on the right: round days (mint when free, filled when
  chosen, an apricot dot for today) and mint time buttons.
- **The stamp**: the guest's page opens on a round mint stamp (a red one
  when cancelled) and a large serif title.
- **Question cards**: on a type's form, each of the host's questions is a
  sand card (number, up, down, remove), its answer kind a plain select;
  guests answer choices and yes/no with the same outlined pills as the
  form's other choices.
- Buttons are pills; cancelling a meeting is a red link that asks for a
  word first; deleting a type or erasing a guest asks in the kit's
  `Confirm` (never the browser's box); the kit's toasts at the bottom
  confirm (and never offer Undo once a guest was emailed).
- The shell, tabs, the "Mine / Everyone" switch of the bookings (the
  kit's `Segmented`, as links), the on/off switches (a type, the email
  setting: the kit's `Switch`), date fields, time lists, file picker,
  empty states, avatars and badges are the kit's components; tags take
  the theme's `--radius-chip`, restyled lightly by
  `app/globals.css` ("The kit's components, fitted to Booking's pages").

## Icon

`components/mark.tsx` draws the card in the look's colours (accent card,
ink rings, a mint tick). `chest/icon.svg`: a plum calendar card with two rings and a mint tick in a
circle. `app/icon.svg` is the same, smaller.

## Why

Calendly's pages are cold and generic; a small company's customer meets a
person. The serif and the paper make the page feel like the company's own
appointment card, the mint makes "free" readable at a glance (and is never
the only signal: free days are also buttons, taken ones are disabled).

## Showcase

```json showcase
{
  "adjectives": ["polite", "quick", "warm"],
  "colors": [
    { "name": "Paper", "value": "#fbf7f1" },
    { "name": "Plum ink", "value": "#24172e" },
    { "name": "Plum", "value": "#5b2a86" },
    { "name": "Mint", "value": "#0b6e55" },
    { "name": "Apricot", "value": "#974503" }
  ],
  "fonts": {
    "display": { "family": "Young Serif", "file": "public/fonts/young-serif-latin-400-normal.woff2", "weight": 400 },
    "body": { "family": "Figtree", "file": "public/fonts/figtree-latin-wght-normal.woff2", "weight": 450 }
  },
  "specimen": "Tuesday 29 September at 10:00 — you are booked."
}
```

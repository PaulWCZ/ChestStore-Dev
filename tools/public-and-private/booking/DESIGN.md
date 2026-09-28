# Booking — design

## Name and personality

**Booking** (French: *Rendez-vous*). An appointment card: warm paper,
plum ink, a stamp of mint when a time is free and when it is yours.
Polite and quick — a visitor books in three clicks and three fields.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbf7f1` paper | `#17121b` | page |
| `--surface` | `#ffffff` | `#211a27` | cards, the booking sheet |
| `--ink` | `#24172e` plum ink | `#f4eef8` | text — 15.9:1 on paper; 16.2:1 dark |
| `--ink-2` | `#5f5268` | `#bcaec6` | secondary — 6.8:1 on paper, 6.3:1 on `--surface-2`; 8.1:1 / 7.2:1 dark |
| `--accent` | `#5b2a86` plum | `#cfaef2` | the main action, the page's ticket — white on plum 9.9:1; dark 9.2:1 |
| `--accent-soft` | `#f0e7f8` | `#37284a` | current tab, soft buttons — accent on it 8.3:1; 7.0:1 |
| `--free` | `#0b6e55` mint ink | `#7fdcbc` | free days and times — 6.2:1 on white; on `--free-soft` 5.3:1; dark 7.6:1 |
| `--today` | `#974503` apricot | `#f5b271` | today's mark and tag — 5.6:1 on its tint; 6.9:1 dark |
| `--danger` | `#b3261e` | `#ff8a80` | cancel — 5.4:1 on its tint; 6.2:1 dark |
| `--c-sky` … `--c-slate` | eight colours | lighter in dark | a booking type's edge and swatch (never text) |
| `--font-display` | Young Serif | | titles, times in the agenda, the month |
| `--font-body` | Figtree | | everything else |
| `--radius-*` | 8 / 14 / 22 px, pills | | soft cards, round days, pill buttons |

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
- Buttons are pills; a destructive action is a red link that asks for a
  word first; toasts at the bottom confirm.

## Icon

`chest/icon.svg`: a plum calendar card with two rings and a mint tick in a
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

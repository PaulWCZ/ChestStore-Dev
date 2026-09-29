# Hiring — design

## Name and personality

**Hiring** (*Recrutement*). **Confident, editorial, welcoming.** The public
pages must feel like the company's own careers magazine — not a SaaS form;
the team's pages are the same paper and ink, denser and calm.

## Tokens (`app/tokens.css`)

| Token | Light | Dark | Use | Contrast |
|---|---|---|---|---|
| `--paper` | `#f6f0e4` warm cream | `#10133a` night cobalt | the page | — |
| `--card` | `#fffaf1` | `#181c4a` | surfaces | — |
| `--ink` | `#1a1a2e` | `#f6f0e4` | text | 15.0:1 / 15.7:1 |
| `--ink-2` | `#5b5a6e` | `#a9a8bf` | secondary text | 5.9:1 on paper, 6.4:1 on card / 7.7:1, 6.9:1 |
| `--cobalt` | `#1c2b8f` | `#9fb0ff` | the brand, the main action | 10.3:1 / 8.6:1 (cream on cobalt 10.3:1) |
| `--tomato` | `#c93a1e` | `#ff8a6b` | kickers, index numbers, "new" | 4.5:1 on paper, 4.9:1 on card / 7.7:1 |
| `--tomato-bright` | `#e5553a` | `#ff8a6b` | shapes, the careers card's button (ink on it 4.6:1) | — |
| `--line-strong` | `#8d8474` | `#6d72a8` | field borders | 3.6:1 / 3.6:1 (UI ≥ 3:1) |
| `--ok` / `--danger` | `#1d6b43` / `#b0281a` | `#7fd6a2` / `#ff9a8a` | hired, strong yes / rejected, no | 6.2:1, 6.4:1 on card |

Checked with `node scripts/contrast.mjs` and by the studio's axe audit
(WCAG 2.1 AA, every screen, light and dark: passing).

**Type**: *Bricolage Grotesque* (display — characterful, slightly quirky,
800 for the big words, tight tracking) and *Instrument Sans* (body — clean,
open). Both OFL-1.1, self-hosted (`public/fonts/`). Display sizes up to
5.6 rem on the careers page; the team's pages cap at 2.75 rem.

**Space** 4–72 px; **radii** 6/10/18 px and pills for buttons and facts;
**shadows** barely there (a cobalt offset shadow on the application card:
the one printed flourish); **motion** 120/240 ms, none with
`prefers-reduced-motion`.

### The company's accent (careers pages only)

Settings → *Colour* replaces the cobalt on the careers pages with one of
six accents, each checked with `scripts/contrast.mjs` (text on paper, the
button's words on it, text on its soft tint), light and dark:

| Accent | Light (on paper #f6f0e4 / words on it / on soft) | Dark (on paper #10133a / #10133a on it / on soft) |
|---|---|---|
| Cobalt (default) | the tool's own | the tool's own |
| Forest | #1f5c3a 6.98 / 6.98 / 6.47 | #86d6a6 10.36 / 10.36 / 7.27 |
| Plum | #6b2a5e 8.74 / 8.74 / 7.79 | #e3a6d6 9.09 / 9.09 / 7.57 |
| Tomato | #a8321b 5.90 / 6.69 (white) / 5.48 | #ff9a80 8.66 / 8.66 / 7.17 |
| Ocean | #0b5a73 6.79 / 6.79 / 6.31 | #7fcbe3 9.82 / 9.82 / 7.17 |
| Graphite | #2b2b2b 12.48 / 12.48 / 10.96 | #e6e2da 13.82 / 13.82 / 10.42 |

The team's pages keep the cobalt: the accent is the company's voice to
candidates, the tool keeps its own for the team.

## Components

Pill buttons (cobalt / quiet outline / danger / link), fields with a 1.5 px
border, *facts* pills with tomato icons, the careers **table of contents**
(tomato index numbers, rows that turn cobalt on hover), the cobalt **apply
card**, the **dropzone** for the CV, job cards with a **pipeline strip**,
board **lanes** and candidate cards (rating star, days in stage, "New"
chip), the **1–4 scale** and recommendation pills of feedback, a timeline,
toasts with *Undo*, native `<dialog>`s.

## Icon

`chest/icon.svg`: an open cobalt doorway with a tomato figure stepping in —
"welcome in". Readable at 24 px on light and dark tiles; no text. The
careers page's hero repeats the doorway, large.

## Why

Candidates judge a company by its careers page: a confident magazine look
(big type, cream paper, one bold colour) makes a 20-person workshop look
like a place worth joining, which a generic job-board widget never does.
The team's side keeps the same paper and ink so the tool feels like one
place, but trades display type for density: a recruiter scans a board
between two interviews. Cobalt and tomato are far from the Chest portal's
black-and-white and from the other store tools (Tasks' yellow brutalism,
Support's teal, Booking's plum).

```json showcase
{
  "adjectives": ["confident", "editorial", "welcoming"],
  "colors": [
    { "name": "Cream paper", "value": "#f6f0e4" },
    { "name": "Ink", "value": "#1a1a2e" },
    { "name": "Cobalt", "value": "#1c2b8f" },
    { "name": "Tomato", "value": "#e5553a" },
    { "name": "Leaf", "value": "#1d6b43" }
  ],
  "fonts": {
    "display": { "family": "Bricolage Grotesque", "file": "public/fonts/bricolage-grotesque-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Instrument Sans", "file": "public/fonts/instrument-sans-latin-wght-normal.woff2", "weight": 450 }
  },
  "specimen": "Join Atelier Martin — Senior furniture designer, Lyon."
}
```

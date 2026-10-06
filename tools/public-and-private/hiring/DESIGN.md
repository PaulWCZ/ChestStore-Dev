# Hiring — design

## Name and personality

**Hiring** (*Recrutement*). **Confident, editorial, welcoming.** The public
pages must feel like the company's own careers magazine — not a SaaS form;
the team's pages are the same paper and ink, denser and calm.

## Tokens: the identity is a theme (`src/theme.ts`)

Hiring's identity is *Magazine*, a theme of the UI kit's token contract
(`@argentic/chest-ui`, `ui/tokens/CONTRACT.md`): the catalogue's `magazine`
theme itself, imported in `src/theme.ts` (`identityOf("hiring")`). The
careers page's other accents are made from its source, kept there and held
equal to the catalogue's by a test (kit 0.2.2: the old copy still had the
plum dark slot 3 that 0.2.1 made an orange). Every colour lives there;
`src/tokens.css` holds only Hiring's own tokens, each defined from contract
tokens (tomato is categorical slot 3; the careers headline size; pill
radius that follows the theme's corners, for buttons; heavier magazine
lines). Chips and counters take the theme's `--radius-chip`, fields the
theme's `--field-pad-x`, and the job ad's text (`.prose`) the theme's
reading face, `--font-read`. The company may give Hiring
another look in its Chest (README, *Looks*): the same pages then wear it.

| Contract token | Light | Dark | Hiring's use |
|---|---|---|---|
| `--bg` | `#f6f0e4` warm cream | `#10133a` night cobalt | the page |
| `--surface` | `#fffaf1` | `#181c4a` | cards, fields |
| `--ink` / `--ink-2` | `#1a1a2e` / `#5b5a6e` | `#f6f0e4` / `#a9a8bf` | text |
| `--accent` / `--accent-ink` | `#1c2b8f` / `#f6f0e4` | `#9fb0ff` / `#10133a` | cobalt: the brand, the main action |
| `--cat-3` / `-soft` / `-ink` | `#c93a1e` / `#fde3da` / `#7a2410` | `#ff8a6b` / `#3d1f33` / `#ffc2b1` | tomato: shapes, index numbers / "new" chips / kickers |
| `--line-strong` | `#8d8474` | `#6d72a8` | field borders (≥ 3:1, checked by `checkTheme`) |
| `--ok` / `--danger` | `#1d6b43` / `#b0281a` | `#7fd6a2` / `#ff9a8a` | hired, yes / rejected, no |

Every pair of the contract is measured by `checkTheme` (test/theme.test.ts)
and the studio's axe audit runs in the own look, a catalogue theme, the
Chest theme and a brand, light and dark.

**Type**: *Bricolage Grotesque* (display — characterful, slightly quirky,
800 for the big words, tight tracking) and *Instrument Sans* (body — clean,
open). Both OFL-1.1, self-hosted (`public/assets/fonts/`). Display sizes up to
5.6 rem on the careers page; the team's pages cap at 2.75 rem.

**Space** 4–72 px; **radii** 6/10/18 px and pills for buttons and facts;
**shadows** barely there (a cobalt offset shadow on the application card:
the one printed flourish); **motion** 120/240 ms, none with
`prefers-reduced-motion`.

### The company's accent (careers pages only)

Settings → *Colour* replaces the cobalt on the careers pages with one of
six accents (cobalt, forest, plum, tomato, ocean, graphite). Each is a
whole theme — the identity with another accent, light and dark — in
`src/theme.ts` (`accentThemes`), checked against the contract like the
identity, and applied to the careers pages only through a class-scoped
style (`accentCss`). Only while Hiring wears its own look: a catalogue
theme or the company's brand, chosen in the Chest, wins.

## Components

From the UI kit (`@argentic/chest-ui/components`, styled by the contract):
the shell with labelled tabs (a row of their own on a phone), the search
box ("/"), toasts whose *Undo* tells the truth and turn into "sent" once an
email left, dialogs that ask before losing what was typed, `Confirm` for
the irreversible (erase, a job deleted, an interview called off), the
people picker, the date field and time list, the file picker, empty
states, avatars, status badges, the segmented Write/Preview, the language
switch, the no-access page. Hiring's own: pill buttons (cobalt / quiet
outline / danger / link), fields with a 1.5 px border, *facts* pills with
tomato icons, the careers **table of contents** (tomato index numbers, rows
that turn cobalt on hover), the cobalt **apply card**, job cards with a
**pipeline strip**, board **lanes** and candidate cards (rating star, days
in stage), the **1–4 scale** and recommendation pills of feedback, a
timeline.

## Icon

`chest/icon.svg`: an open cobalt doorway (drawn in the look's tokens in the
header, `src/components/mark.tsx`; replaced by the company's logo in brand mode) with a tomato figure stepping in —
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
    "display": { "family": "Bricolage Grotesque", "file": "public/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Instrument Sans", "file": "public/assets/fonts/instrument-sans-latin-wght-normal.woff2", "weight": 450 }
  },
  "specimen": "Join Atelier Martin — Senior furniture designer, Lyon."
}
```

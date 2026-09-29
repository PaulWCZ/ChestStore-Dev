# Support — design

## Name and personality

**Support** (French: *Support*). Calm, warm, legible — a conversation, not
a queue.

## Tokens — the identity is a theme

Support's look, "Calm counter", is a theme of the UI kit
(`@argentic/chest-ui`, vendored in `vendor/`): `defineTheme` in
`lib/theme.ts`, identical to the catalogue's `counter` (the tests hold
them equal) and checked against every pair of the kit's token contract
(WCAG AA, light and dark). Every colour lives there; the stylesheets name
only the contract's tokens and Support's own few in `app/tokens.css`,
defined from them — so the company may give Support any theme of the
catalogue, or its own brand, from its Chest, and every screen keeps
working (README, "Looks").

| Token (contract) | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f7f6` mint paper | `#0f1c1c` | page |
| `--surface` | `#ffffff` | `#172726` | cards, the customer's bubbles |
| `--ink` | `#12302f` deep teal | `#e6f2f0` | text — 13.1:1 on paper; 15.2:1 dark |
| `--ink-2` | `#4a6361` | `#a7c1be` | secondary — 6.0:1 on paper; 8.1:1 dark |
| `--line-strong` | `#7f8d8a` | `#668481` | field borders — 3:1 or more (the old `--line` borders were 1.3:1: fixed with the migration) |
| `--accent` | `#0b6e69` teal | `#5fd3c8` | the main action — white on teal 6.1:1; dark 9.7:1 |
| `--accent-soft` | `#ddefec` | `#1e3a37` | the team's bubbles, tags — ink 11.6:1; dark ink 10.2:1 |
| `--highlight` | `#fff1b8` butter | `#2f2a14` | internal notes (dashed), "someone is on it" |
| `--cat-3-soft` / `--cat-3-ink` | `#ffd9cf` coral / `#773a00` | `#3b2a26` / `#f28e42` | a customer waiting too long |
| `--danger` | `#b3261e` | `#ff9a85` | spam, erase — 6.5:1; 7.5:1 |

Support's own tokens (`app/tokens.css`): `--customer`, `--customer-ink`,
`--customer-line` (the categorical slot 3, orange in every theme),
`--note` (`--highlight`) and `--note-line` (slot 7, ochre), and
`--radius-round` (pill buttons, square in a square theme). On a ground
other than the page's (a team bubble, a note, a notice) the secondary text
is `--ink`: the contract measures `--ink-2` only on the page's grounds.

**Type**: *Atkinson Hyperlegible* (OFL-1.1, the Braille Institute's face
designed to tell letters apart), 17 px body, 700 for headings and actions,
self-hosted in `public/fonts/` (the kit writes the `@font-face`). **Shape**: pill buttons, 14/22 px radii,
bubbles with one sharp corner toward their speaker. **Motion**: 120/220 ms,
none with reduced motion.

## Components

The kit's, in Support's shape: the app shell (Support's sections — Inbox,
Reports, Settings — as labelled tabs; on a phone a row of their own), the
toasts (Undo that says whether it worked; "Answer sent." never offers one),
the dialog (keyboard sheet, "Save this view"), `Confirm` before erasing a
customer's data, the people picker (who has a ticket, a rule's person),
the date field (days off), the file picker (the form, a follow-up, the
answer box — there a quiet line), the filter chips and the search box
(`/`), the badges (a ticket's state and priority: a shape and a word),
the link tabs of the reports' periods, their tables, avatars, empty
states, the language switch of the public pages, the company's logo in
brand mode.

Support's own: beside the page, the column of folders and saved views
with counts (on a phone, a row of labelled chips that slides sideways
above the inbox — never a menu); ticket rows; conversation bubbles (the
customer in calm white on the left, the team in its pale tint on the
right, notes on the marker's butter and dashed, automatic replies dashed
and grey; the coral is kept for a wait that is too long); the answer box
with its two tabs (the note tab turns it yellow); the saved-replies menu
(the kit's menu, each reply with the start of its text as its second
line); the side card (from, assigned, priority, tags, status, other
requests, merge); the "someone else is on it" banner; the public card
form and the success box with *Copy the link*. Urgent rows keep a red
inner edge. Ticking rows raises a bar (accent outline) with the actions
for all of them. An email that did not arrive: a notice outlined in
`--danger` above the thread. Reports: figures in cards.

## Icon

`chest/icon.svg`: two speech bubbles on teal — the customer's (coral) and
the team's answer (white). No letters; readable at 24 px.

## Why

Support is read all day by agents and once, in a hurry, by an upset
customer. Atkinson Hyperlegible and high contrast make both easy; colour
says who speaks (white customer, teal team, yellow private note) so a
note is never sent by mistake; the public pages carry the company's name,
not ours.

```json showcase
{
  "adjectives": ["calm", "warm", "legible"],
  "colors": [
    { "name": "Mint paper", "value": "#f3f7f6" },
    { "name": "Deep teal", "value": "#12302f" },
    { "name": "Teal", "value": "#0b6e69" },
    { "name": "Coral", "value": "#ffd9cf" },
    { "name": "Butter", "value": "#fff1b8" }
  ],
  "fonts": {
    "display": { "family": "Atkinson Hyperlegible", "file": "public/fonts/atkinson-hyperlegible-latin-700-normal.woff2", "weight": 700 },
    "body": { "family": "Atkinson Hyperlegible", "file": "public/fonts/atkinson-hyperlegible-latin-400-normal.woff2", "weight": 400 }
  },
  "specimen": "Hello Marie, your table leaves on Thursday."
}
```

# Support — design

## Name and personality

**Support** (French: *Support*). Calm, warm, legible — a conversation, not
a queue.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f3f7f6` mint paper | `#0f1c1c` | page |
| `--surface` | `#ffffff` | `#172726` | cards, the team's bubbles |
| `--ink` | `#12302f` deep teal | `#e6f2f0` | text — 13.1:1 on paper; 15.2:1 dark |
| `--ink-2` | `#4a6361` | `#a7c1be` | secondary — 6.0:1 on paper; 8.1:1 dark |
| `--accent` | `#0b6e69` teal | `#5fd3c8` | the main action — white on teal 6.1:1; dark 9.7:1 |
| `--customer` | `#ffd9cf` coral | `#3b2a26` | the customer's bubbles — ink 10.8:1; 11.9:1 |
| `--note` | `#fff1b8` butter | `#2f2a14` | internal notes (dashed) — ink 12.4:1; 12.5:1 |
| `--danger` | `#b3261e` | `#ff9a85` | spam, erase — 6.5:1; 7.5:1 |

**Type**: *Atkinson Hyperlegible* (OFL-1.1, the Braille Institute's face
designed to tell letters apart), 17 px body, 700 for headings and actions,
self-hosted in `public/fonts/`. **Shape**: pill buttons, 14/22 px radii,
bubbles with one sharp corner toward their speaker. **Motion**: 120/220 ms,
none with reduced motion.

## Components

Side column of folders with counts (a top strip on a phone), ticket rows,
conversation bubbles (customer coral on the left, team white on the right,
notes butter and dashed), the composer with two tabs (the note tab turns
the composer yellow), saved replies menu, side card (from, assigned,
status, other requests), "someone else is on it" banner, public card form,
success box with *Copy the link*, toasts with *Undo*. Triage: the
priority chip (nothing for normal; *Urgent* outlined in `--danger` with a
flag, and a red inner edge on its row — it stands out without filling the
screen with red; *High* and *Low* with chevrons), tag chips on
`--accent-soft` with a tag icon, "Waiting 26 h" in the customer's coral
and bold once past the threshold (plain grey text before). The file
picker: a quiet *Add a file* button, one line of limits, the files as
removable rows.

## Icon

`chest/icon.svg`: two speech bubbles on teal — the customer's (coral) and
the team's answer (white). No letters; readable at 24 px.

## Why

Support is read all day by agents and once, in a hurry, by an upset
customer. Atkinson Hyperlegible and high contrast make both easy; colour
says who speaks (coral customer, white team, yellow private note) so a
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

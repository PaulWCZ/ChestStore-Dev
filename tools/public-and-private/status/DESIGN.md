# Notes — design

## Name and personality

**Notes** (French: *Notes*). Calm, plain, friendly.

## Tokens

Ratios computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

Defined once in `app/tokens.css` (light, and dark by the system's choice);
nothing else in the CSS names a colour or a size.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f6f2` | `#161614` | page |
| `--surface` | `#ffffff` | `#201f1c` | cards, fields |
| `--ink` | `#1c1b18` | `#f2f0ea` | text — 17.2:1 on `--surface` (light), 14.5:1 (dark) |
| `--ink-2` | `#57544c` | `#b5b1a6` | secondary text — 7.6:1 / 7.7:1 |
| `--accent` | `#2b59c3` | `#8fb0ff` | the one action, focus — 6.3:1 with white text / 8.1:1 with `--accent-ink` |
| `--danger` | `#b3261e` | `#ff8a80` | errors — 6.5:1 / 7.2:1 |

Type: **Figtree** (OFL-1.1, self-hosted in `public/fonts/`), 16 px body,
1.5 line height; headings 700. Spacing: 4, 8, 12, 16, 24, 32, 48 px. Radii
6, 10, 16 px. Motion: 120 ms and 240 ms, none when the system asks for
reduced motion.

## Components

Button (primary, quiet, link), text field, avatar (photo or initials), note
card (normal, pinned, pending), empty state with one action, toast with
"Undo". Every control is 44 px tall at least; focus is a 3 px ring.

## Icon

`chest/icon.svg`: three lines of text on a rounded square in the accent —
a note. No letters; readable at 24 px on light and dark tiles.

## Why

A note board is read in passing: the content is the design, so the frame
is quiet (warm paper white, one blue) and the action is obvious.

```json showcase
{
  "adjectives": ["calm", "plain", "friendly"],
  "colors": [
    { "name": "Paper", "value": "#f7f6f2" },
    { "name": "Ink", "value": "#1c1b18" },
    { "name": "Blue", "value": "#2b59c3" },
    { "name": "Stone", "value": "#57544c" }
  ],
  "fonts": { "display": { "family": "Figtree Variable", "file": "public/fonts/figtree-latin-wght-normal.woff2", "weight": 700 }, "body": { "family": "Figtree Variable", "file": "public/fonts/figtree-latin-wght-normal.woff2", "weight": 400 } },
  "specimen": "Post a note for the whole team."
}
```

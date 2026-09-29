# Notes — design

## Name and personality

**Notes** (French: *Notes*). Calm, plain, friendly.

## Tokens

The identity is a theme of the UI kit (`@argentic/chest-ui`), defined once
in `lib/theme.ts` with `defineTheme`: the colours below, Figtree, the
radii. What it leaves out — the states' soft grounds and inks, the lines
that must be seen, the eight categorical colours, the marker — is derived
by the kit with the contract's contrast. The page gets it as one `<style>`
(`app/layout.tsx`); the CSS (`app/globals.css`, `app/tokens.css`) names only
the contract's tokens, so the tool wears any look the company chooses.
`test/theme.test.ts` checks every pair of the contract (WCAG AA) in light
and dark, and that no stylesheet writes a colour.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f6f2` | `#161614` | page |
| `--surface` | `#ffffff` | `#201f1c` | cards, fields |
| `--ink` | `#1c1b18` | `#f2f0ea` | text — 17.2:1 on `--surface` (light), 14.5:1 (dark) |
| `--ink-2` | `#57544c` | `#b5b1a6` | secondary text — 7.6:1 / 7.7:1 |
| `--accent` | `#2b59c3` | `#8fb0ff` | the one action — 6.3:1 with white text / 8.1:1 with `--accent-ink` |
| `--danger` | `#b3261e` | `#ff8a80` | errors — 6.5:1 / 7.2:1 |
| `--line-strong` | derived | derived | field borders — 3:1 at least |

Type: **Figtree** (OFL-1.1, self-hosted in `public/fonts/`; the kit writes
its `@font-face`), 16 px body, 1.5 line height; headings 700. Spacing: 4,
8, 12, 16, 24, 32, 48, 72 px. Radii 6, 10, 16 px. Motion: 120 ms and
240 ms, none when the system asks for reduced motion.

## Looks

The company may give its tools another look in its Chest (for all tools,
or for this one): a theme of the catalogue, or its brand (colours, fonts,
corners, logo). Only the look changes. Screens: `docs/screens/notes-*`
(this identity), `notes-theme-*` (Newsprint), `notes-brand-*` (the harness's
sample brand, with its logo), `notes-chest-desktop.png` (the portal's
look). The axe audit passes on all of them, light and dark.

## Components

The tool's own: button (primary, quiet, link), text field, note card
(normal, pinned, pending). From the kit (`@argentic/chest-ui/components`,
styled by the same tokens): the shell and member chip, avatar, empty state
with "Post an example", toast with Undo (« Annuler l’action ») that waits
while hovered or focused and says whether the Undo worked. Every control is 44 px tall at least (`--control-h`); focus is a
3 px ring (`--focus`).

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

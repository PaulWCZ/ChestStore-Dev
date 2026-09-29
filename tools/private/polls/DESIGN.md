# Polls — design

## Name and personality

**Polls** (*Sondages* in French): a word anyone can say. Three adjectives:
**playful, clear, quick**. The direction is a *confetti ballot*: warm paper,
deep navy ink, a coral that asks to be tapped, mint for "yes", sunflower for
"if need be" — chunky rounded shapes that stand on a little ledge and press
down when tapped, like real buttons. Lively, never childish: one obvious
action per screen, big answers, plain words.

## Tokens (`app/tokens.css`)

| Token | Light | Dark | Use, contrast (scripts/contrast.mjs) |
|---|---|---|---|
| `--bg` | `#fff7ef` warm paper | `#111829` | page |
| `--surface` | `#ffffff` | `#1a2338` | cards |
| `--ink` | `#1b2440` deep navy | `#f4eee8` | text — 14.4:1 / 15.4:1 |
| `--ink-2` | `#4a5270` | `#b7bcd0` | quiet text — 7.3:1 / 9.4:1 |
| `--coral` | `#ff7a63` | `#ff8a76` | the main action, navy text on it — 6.0:1 / 7.7:1 |
| `--coral-text` | `#b8321f` | `#ff8a76` | coral as text — 6.0:1 on white |
| `--mint` | `#34d1a0` | `#4fe0b1` | yes, the meter — navy on it 7.9:1 |
| `--sun` | `#ffc940` | `#ffd366` | if need be, the scale — navy on it 10.0:1 |
| `--no` / `--no-ink` | `#ece8e2` / `#595e70` | `#2a3450` / `#c3c8da` | no — 5.3:1 / 7.4:1 |
| `--focus` | `#2f55e0` | `#9db4ff` | 3 px focus ring — 5.7:1 / 8.8:1 |

Soft tints (`--coral-soft`, `--mint-soft`, `--sun-soft`) carry their own
dark ink (`--mint-ink` 5.7:1, `--sun-ink` 6.1:1). The axe audit
(`lab/chest-dev/audit.mjs`) passes in light and dark.

- **Type**: *Fredoka* (rounded display, OFL-1.1) for titles, numbers and
  chunky labels; *Plus Jakarta Sans* (OFL-1.1) for text. Both self-hosted
  in `public/fonts/`. Sizes 13–40 px, fluid page title.
- **Spacing**: 4, 8, 12, 16, 24, 32, 48 px. **Radii**: 10, 16, 24 px and
  pills. **Ledge**: 4 px of `--line-strong` (or the colour's darker edge)
  under every chunky control; tapping presses it down.
- **Motion**: bars grow (700 ms), columns rise, toasts bounce in, confetti
  bursts once when an answer is sent. `prefers-reduced-motion` turns all of
  it off.

## Components (`app/globals.css`)

- **Buttons**: pill, 2 px border, a ledge; *primary* coral, *go* mint,
  default white; *link* for quiet actions; 44–56 px tall.
- **Answer cards** (`.pick-option`): a whole row to tap, a round (single) or
  square (several) mark that fills coral.
- **Yes / If need be / No** (`.tri`): three chunky keys per date — mint,
  sunflower, grey — each with an icon *and* a word.
- **Scale**: five round keys, sunflower when chosen, words at both ends.
- **Day badge**: a small calendar page (month, day, weekday) beside each
  date, in the answer form and in the grid.
- **Results**: bars (top answer coral with a *Best* tag), the date grid
  (sticky names, coloured cells with icons, the best or chosen column lit),
  the scale's average in a sunflower medal and five columns, texts as speech
  bubbles, the participation meter.
- **Cards** on the home page: kind chip, title, who, closing time,
  participation, one action. Poll-to-answer cards stand on a navy ledge.
- **Kind tiles**: four big tiles (a question, a date, a survey, the team
  pulse), an icon on a tint, a name and one line; two by two from 640 px.
- **Over time** (a repeating pulse): one thin coral line per question on
  recessive grid lines, the current round a filled dot, the latest number
  big with its change (▲ mint / ▼ coral, with the sign), the numbers in a
  table under *See the numbers*. On a phone the chart's words and marks
  grow so they stay readable.
- **eNPS**: the score in the yellow disc, then three bars — critics
  (coral), neutral (sunflower), fans (mint), each labelled in words.
- **Sign-up places**: a small mint pill "2 places left", grey "Full"; a
  full answer is dimmed and cannot be ticked.
- **Comments**: avatar, name, "3 hours ago", the words; a quiet textarea
  and *Post* below.
- **Empty states**: "Nothing to answer. You're all caught up!"; the
  anonymous threshold (a closed poll under five answers) shows five dots;
  an open anonymous poll says its results come at the close, in mint.
- **Toasts**: a navy pill at the bottom, with *Undo*.

## Icon

`chest/icon.svg` (and `app/icon.svg`, `components/mark.tsx`): a coral card
standing on a navy ledge, three result bars (navy, white, mint) and two
confetti dots. No text; readable at 24 px on light and dark tiles.

## Why

A poll is a small, social moment — lunch, a party, "how was your week". It
should feel light enough that people answer at once, on a phone, between two
things; the chunky tappable shapes make the answer the obvious thing to do,
and the colours map to the answers themselves (mint yes, sunflower maybe,
grey no). The same identity stays calm where it must: the anonymous pulse is
explained in plain words, with the lock of five dots.

```json showcase
{
  "adjectives": ["playful", "clear", "quick"],
  "colors": [
    { "name": "Paper", "value": "#fff7ef" },
    { "name": "Navy", "value": "#1b2440" },
    { "name": "Coral", "value": "#ff7a63" },
    { "name": "Mint", "value": "#34d1a0" },
    { "name": "Sunflower", "value": "#ffc940" },
    { "name": "Quiet ink", "value": "#4a5270" }
  ],
  "fonts": {
    "display": { "family": "Fredoka", "file": "public/fonts/fredoka-latin-wght-normal.woff2", "weight": 600 },
    "body": { "family": "Plus Jakarta Sans", "file": "public/fonts/plus-jakarta-sans-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Pizza or sushi on Friday?"
}
```

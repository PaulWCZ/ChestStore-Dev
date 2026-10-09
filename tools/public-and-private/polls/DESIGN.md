# Polls — design

## Name and personality

**Polls** (*Sondages* in French): a word anyone can say. Three adjectives:
**playful, clear, quick**. The direction is a *confetti ballot*: warm paper,
deep navy ink, a coral that asks to be tapped, mint for "yes", sunflower for
"if need be" — chunky rounded shapes that stand on a little ledge and press
down when tapped, like real buttons. Lively, never childish: one obvious
action per screen, big answers, plain words.

## Tokens — the identity is a theme (`src/theme.ts`)

Confetti is a theme of the store's UI kit (`defineTheme` in `src/theme.ts`,
the same, value for value, as the catalogue's `confetti`: a test holds
them equal). Every colour of the tool is there, light and dark, checked
against every contrast pair of the kit's contract (`checkTheme`, WCAG AA).
The company may give Polls another look (a catalogue theme, its brand): the
CSS names only the contract's tokens and Polls' own, defined from them in
`src/tokens.css` — never a colour (a test reads every stylesheet).

| Polls before | Now | Light | Dark |
|---|---|---|---|
| paper, white, navy ink, quiet ink | `--bg`, `--surface`, `--ink`, `--ink-2` | `#fff7ef`, `#ffffff`, `#1b2440`, `#4a5270` | `#111829`, `#1a2338`, `#f4eee8`, `#b7bcd0` |
| coral (the main action), its ledge, coral text, coral tint | `--accent`, `--accent-line`, `--accent-text`, `--accent-soft` | `#ff7a63`, `#d9533d`, `#b8321f`, `#ffe2da` | `#ff8a76`, … |
| mint (yes), mint tint and ink | `--yes*` → the ok state (`--ok`, `--ok-soft`, `--ok-ink`) | `#0b6b4f`, `#d8f7ec` | `#7ff0c9`, `#173a36` |
| sunflower (if need be), its tint and ink | `--maybe*` → the wait state | `#7a5300`, `#fff1c7` | `#ffd98a`, `#3a3222` |
| sunflower (the chosen number, the average) | `--highlight` with `--ink` | `#f8e8ab` | `#473d13` |
| grey (no) | `--no-soft`, `--no-ink` → `--surface-2`, `--ink-2` | | |
| kinds: question, date, survey | `--kind-*` → slots 3 (orange), 6 (teal, tuned to mint's hue), 7 (ochre) | | |
| charts: meter and fans, top column and neutrals, trend line and critics | `--mark-yes` (slot 6), `--mark-sun` (slot 7), `--mark-coral` (`--accent-line`) | | |
| confetti | `--confetti-1…5`: accent, slots 6, 7, 1, ink | | |

What changed on the way: field borders are `--line-strong` (the navy, 3:1
and more; they were the pale `--line`, 1.2:1); a chosen "yes" is mint's
soft tint with its dark ink and a green edge (text on the vivid mint was
not a measured pair); bars grow in `2 × --slow` (640 ms, 0 under reduced
motion); lines are `--edge` = the theme's line width + 1 px (2 px here, 3 px
in Workshop and High contrast).

- **Type**: *Fredoka* (rounded display, OFL-1.1) for titles, numbers and
  chunky labels; *Plus Jakarta Sans* (OFL-1.1) for text. Both self-hosted
  in `public/assets/fonts/`; the kit writes their `@font-face`.
- **Spacing**: 4, 8, 12, 16, 24, 32, 48 px. **Radii**: 10, 16, 24 px and
  pills. **Ledge**: 4 px of `--line-strong` (or `--accent-line`) under
  every chunky control; tapping presses it down.
- **Lengths from data** (bars, meters, columns) are classes `pct-0`…`pct-100`
  (`--w`, `--h`): the pages carry no `style=""`. The look itself is a
  stylesheet the tool serves (`/chest/look.css`, `/look.css`).
- **Motion**: bars grow, columns rise, confetti bursts once when an answer
  is sent. `prefers-reduced-motion` turns all of it off (the burst is not
  drawn at all).

## Components (`src/styles.css`)

- **The shell** is the kit's `AppShell` (a paper bar, the mark or the
  company's logo, the member chip); "New poll" is the home page's main
  action, at the right of its title (full width on a phone).
- **Buttons**: pill, a thick border, a ledge; *primary* coral on its darker
  edge, default white; *link* for quiet actions; 44–56 px tall.
- **Answer cards** (`.pick-option`): a whole row to tap, a round (single) or
  square (several) mark that fills coral.
- **Yes / If need be / No** (`.tri`): three chunky keys per date — mint,
  sunflower, grey tints with their inks and edges — each with an icon
  *and* a word.
- **Scale**: five round keys, the marker's sunflower when chosen, words at
  both ends.
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
- **Toasts** are the kit's (an Undo that says whether it worked, « Annuler
  l’action » in French; "sent" once a bell item left). Closing an
  anonymous poll for good asks first in the kit's `Confirm`.
- **The composer** uses the kit's `PeoplePicker`, `DateField` (the closing
  day) and `TimeSelect` (half hours; a slot keeps its length when its start
  moves). The days to propose are the kit's `Calendar` in its multiple
  mode, inline (several days tapped one after another; arrows, Page
  Up/Down, Enter or Space), dressed in Polls' dashed today and chosen days
  on their ledge. The admin's two settings are the kit's `Switch` (they take
  effect at once); the composer's on/off choices wait for Send, so they
  are the kit's `Checkbox` (0.2.3). Chips, counters and
  tags take `--radius-chip` (square in a square theme); fields the
  contract's `--field-pad-x`, so they line up with the kit's.

## Icon

`chest/icon.svg` (and `public/assets/icon.svg`, the browser tab's, and `src/components/mark.tsx`): a coral card
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
    "display": { "family": "Fredoka", "file": "public/assets/fonts/fredoka-latin-wght-normal.woff2", "weight": 600 },
    "body": { "family": "Plus Jakarta Sans", "file": "public/assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Pizza or sushi on Friday?"
}
```

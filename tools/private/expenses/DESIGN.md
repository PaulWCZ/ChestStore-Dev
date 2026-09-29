# Expenses — design

## Name and personality

**Expenses** (French: *Notes de frais*). Precise, honest, calm — a till
receipt, not a banking app. Money is written like a receipt writes it:
monospace, aligned, a total under a dashed rule.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f2ea` thermal paper | `#131412` | page |
| `--surface` | `#fffdf7` fresh receipt | `#1c1d1a` | receipts (cards), fields |
| `--surface-2` | `#ebe7dc` | `#252622` | quiet chips, image wells |
| `--ink` | `#1a1a17` | `#ece8dc` | text — 15.6:1 on paper, 17.2:1 on receipt; 13.8:1 dark |
| `--ink-2` | `#5b574c` | `#a8a393` | secondary text — 6.45:1 on paper, 5.84:1 on `--surface-2`; 6.71:1 dark |
| `--rule` | `#a9a291` | `#55564d` | dashed rules (decorative) |
| `--green` | `#0b7a43` | `#4cc983` | money, "approved", the main action — 4.84:1 on paper, 5.32:1 on receipt; white on green 5.41:1; dark: 8.06:1, ink on green 8.79:1 |
| `--red` | `#b3261e` | `#ff7a70` | "refused", delete — 5.84:1 on paper, 5.41:1 on `--red-soft`; 6.71:1 dark |
| `--amber` on `--amber-soft` | `#8e3b00` on `#fff1d6` | `#f3c76b` on `#2b2618` | warnings — 6.77:1 / 9.47:1 |
| `--focus` | `#2e3a8c` | `#9fb1ff` | focus ring — 9.83:1 on receipt |

**Type**: *Public Sans* (text, headings; USWDS, OFL-1.1) and *JetBrains
Mono* (amounts, dates, labels in capitals; OFL-1.1), both variable,
self-hosted in `public/fonts/`. Amounts use tabular figures. 16 px body.
**Shape**: receipts are `--surface` sheets with a torn, zig-zag bottom edge
(a CSS mask) and a soft drop shadow that follows it; dashed 1.5 px rules
between sections; radii 4/8/12 px. **Space**: 4, 8, 12, 16, 24, 32, 48.
**Motion**: 120 and 220 ms, none with reduced motion.

## Components

Buttons (green primary, ink, quiet outline, danger outline, small, block),
icon buttons, fields and selects, the big money input (monospace, currency
unit behind a dashed rule), radio chips (categories, VAT rates), two-choice
segments (paid with), the kind switch (receipt / car trip), the capture area
(dashed camera button + file button; then a preview card with progress),
receipt sheets with torn edge, rows (date box or thumbnail, what, facts
separated by `·`, amount, stamp), **stamps** (status as a rubber stamp:
dashed *Draft*, ink *Sent*, green outline *Approved*, green filled *Paid*,
red *Refused*, tilted 2°), warning pills, three figures with a top rule,
person headers with avatar, facts lists, a timeline, toasts with *Undo*,
empty states with one action, a bottom dock on phones.
Added after the critique: the kind switch has a third choice (flat rate,
calendar icon); fields the phone read from the photo are outlined in green
(`.suggested`) until changed, with one status line under the receipt
(`.reading`); guests as removable chips with one "add" field; a refused
draft not changed since shows *Fix it* instead of its tick; warned lines of
*To approve* carry an amber left edge and their receipt opens large in a
dialog (`.lightbox`); the bank account is always shown masked in monospace
(`FR•• •••• 0189`), with an amber pill when it changed lately; the
transfer-file panel is an ink-outlined sheet; *Settings* has two pages
(*Me*, *Company*) switched like the kind switch, the company one opening
with a row of anchor links; the accountant's first visit shows an
ink-outlined checklist sheet on *My expenses*.

## Icon

`chest/icon.svg`: a white till receipt with a torn edge on a green tile,
two lines of text and the total underlined in green. No letters; the green
tile carries it on light and dark tiles at 24 px.

## Why

An expense claim is a receipt with a status. People already know the look
of a till receipt — so the tool shows theirs back to them: amounts aligned
in a monospace, a total under a dashed line, a stamp that says *Approved*
or *Refused*. It feels exact, which is what money needs, and never like
accounting software. One strong green means money and "yes"; red is kept
for "refused". The most-used screen, *Add an expense*, is built for one hand
on a phone: the camera first, a huge amount field, categories as big chips,
the save button under the thumb.

```json showcase
{
  "adjectives": ["precise", "honest", "calm"],
  "colors": [
    { "name": "Thermal paper", "value": "#f5f2ea" },
    { "name": "Receipt", "value": "#fffdf7" },
    { "name": "Ink", "value": "#1a1a17" },
    { "name": "Money green", "value": "#0b7a43" },
    { "name": "Refused red", "value": "#b3261e" },
    { "name": "Warning amber", "value": "#8e3b00" }
  ],
  "fonts": {
    "display": { "family": "JetBrains Mono", "file": "public/fonts/jetbrains-mono-latin-wght-normal.woff2", "weight": 800 },
    "body": { "family": "Public Sans", "file": "public/fonts/public-sans-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "TOTAL TTC ....... 41,00 €"
}
```

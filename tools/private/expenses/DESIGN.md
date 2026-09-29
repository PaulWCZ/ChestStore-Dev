# Expenses — design

## Name and personality

**Expenses** (French: *Notes de frais*). Precise, honest, calm — a till
receipt, not a banking app. Money is written like a receipt writes it:
monospace, aligned, a total under a dashed rule.

## Tokens — the identity is a theme

The identity, "Receipt", is a theme of the UI kit's token contract
(`@argentic/chest-ui`, `vendor/`): `defineTheme` in **`lib/theme.ts`**,
the very source of the catalogue's `receipt` theme (a test holds them
equal), checked against every contrast pair of the contract in light and
dark (`test/theme.test.ts`). The page's look is written by `<ThemeStyle>`
in `app/layout.tsx`: this identity by default, or the catalogue theme or
brand the company chose in its Chest. The CSS names **only contract
tokens**; `app/tokens.css` holds the tool's own few (`--rule`, `--money`,
the paper's shade, the receipt photo's ground, the dock's height), each
defined from contract tokens.

| Contract token | Light | Dark | Use here |
|---|---|---|---|
| `--bg` | `#f5f2ea` thermal paper | `#131412` | page |
| `--surface` | `#fffdf7` fresh receipt | `#1c1d1a` | receipts (cards), fields |
| `--surface-2` | `#ebe7dc` | `#252622` | quiet chips, image wells |
| `--ink` / `--ink-2` | `#1a1a17` / `#5b574c` | `#ece8dc` / `#a8a393` | text, secondary text |
| `--line-strong` (= `--rule`) | `#8a8476` (derived, 3:1) | `#6f7069` | dashed rules, field borders — was `#a9a291` (2.3:1), below WCAG 1.4.11 |
| `--accent` = `--ok` | `#0b7a43` | `#4cc983` | money, "approved", the main action |
| `--danger` | `#b3261e` | `#ff7a70` | "refused", delete, erase |
| `--wait` on `--wait-soft` | `#8e3b00` on `#fff1d6` | `#f3c76b` on `#2b2618` | warnings |
| `--focus` | `#2e3a8c` | `#9fb1ff` | focus ring |

States are never told by colour alone: stamps and warnings are the kit's
`StatusBadge` (a shape and a word), styled here as rubber stamps. The mark
(`components/mark.tsx`) is drawn in `--accent`, `--surface` and `--ink`, so
it follows any theme; `chest/icon.svg` stays the Receipt drawing.

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
receipt sheets with torn edge (their shade from the theme's `--overlay`), rows (date box or thumbnail, what, facts
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
On the UI kit (0.2.1): the header is the kit's `AppShell` (labelled tabs,
in a row of their own on a phone) restyled with the dashed rule; toasts,
dialogs, `Confirm`, `DateField`, `FilePicker` (certificate, import),
`DataTable` (import preview), `Tabs` (kind switch, settings), `Segmented`
(export), `EmptyState`, `Avatar`, `NoAccess`, `BrandMark` are the kit's,
worn in the receipt look.

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

# Quotes & invoices — design

## Name and personality

**Quotes & invoices** (French: *Devis et factures*). **Exact, formal,
reassuring** — letterpress stationery: a crisp sheet on a quiet desk,
blue-black ink, one oxblood seal. The document is the interface: you write
a quote on the paper it will print on.

## Tokens

All in `app/tokens.css` (light, and dark by the system's choice). Ratios
computed with `scripts/contrast.mjs` (WCAG 2; AA is 4.5:1 for text).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--desk` | `#f3f1ec` | `#12151f` | the page behind the paper |
| `--paper` | `#ffffff` | `#1a1e2b` | sheets, cards, fields |
| `--paper-2` | `#f7f5f1` | `#222736` | quiet fills, a field being written |
| `--ink` | `#161b2e` blue-black | `#e8e4db` | text, primary buttons — 17.07:1 on paper, 15.12:1 on desk; dark 13.09:1 |
| `--ink-2` | `#4f5468` | `#a9adbd` | secondary text — 7.50:1 on paper, 6.64:1 on desk; dark 7.43:1 |
| `--ink-3` | `#686d80` | `#9a9eaf` | placeholders — 5.14:1 / 4.72:1 on paper-2; dark 5.59:1 |
| `--line` | `#8e8a80` | `#6b7186` | field borders — 3.44:1 / 3.43:1 (non-text, AA 3:1) |
| `--accent` | `#8a1f30` oxblood | `#f08f9c` | the seal: overdue, totals, the current tab — 9.05:1 on paper, white on it 9.05:1; dark 7.21:1, `#1a0d10` on it 8.22:1 |
| `--accent-soft` | `#f7e8ea` | `#2a1c22` | overdue and refused stamps — accent on it 7.63:1; dark 7.08:1 |
| `--green` on `--green-soft` | `#1c6a47` on `#e6f1ea` | `#7fd1a6` on `#16271f` | accepted, paid — 5.66:1; dark 8.61:1 |
| `--focus` | `#2346a8` | `#8fb3ff` | focus ring — 8.36:1; dark 7.96:1 |

**Type**: *Libre Caslon Text* (headings, the document's name, the subject,
totals; Impallari, OFL-1.1) and *Hanken Grotesk* (everything you click and
read; OFL-1.1, variable), self-hosted. Figures tabular and right-aligned
wherever they are compared. The PDF uses the readers' own Times and
Helvetica (WinAnsi, accents and € intact), the same hierarchy.
**Space**: 4, 8, 12, 16, 24, 32, 48, 72. **Radii**: 3/6/10 px — paper is
almost square. **Shadow**: a sheet lifts off the desk with a long, soft
shadow; cards stay flat with a hairline. **Motion**: 120/240 ms, none with
reduced motion.

## Components

The **sheet** (letterhead, the document's name in Caslon with its number
underlined in oxblood, dates, the two parties, subject in italics, lines,
totals with the grand total sealed in oxblood, notes, fine print) — read
only, or with **ink fields**: text written on a dotted line that turns to a
solid ink line when focused; a faint "Draft" watermark on drafts. Lines:
description, then quantity × unit price, discount, VAT as small labelled
fields, the amount on the right; a "…" menu per line (move, copy, remove,
undo). The **margin card**: a rubber **stamp** of the state (dashed Draft,
ink Sent/Unpaid, green Accepted/Paid, oxblood Overdue/Refused, struck
Expired/Cancelled), the facts, the one next action as a full-width button,
the rest as links. **Ledger** lists (number, client, subject, date,
amount, stamp; cards on phones). **Figures** on the desk (a ruled top, a
Caslon amount). Buttons (ink, quiet, ghost, danger), fields, option cards,
filter pills, dialogs, pickers with search, toasts with *Undo*, callouts,
empty states with a blank sheet and a seal.

## Icon

`chest/icon.svg`: a folded white sheet with ruled lines on a blue-black
tile, sealed with an oxblood wax seal carrying a tick. No letters; reads at
24 px on light and dark tiles.

## Why

People trust paper. A small company's boss, an office manager or an
accountant has signed quotes and filed invoices for years; the tool shows
them exactly that — the page the client will receive — and lets them write
on it. Formal Caslon and blue-black ink say "this is a legal document",
which an invoice is; the single oxblood seal marks the few things that
matter (the total, the number that makes it final, what is overdue).
Nothing looks like a spreadsheet or a banking app: the calm comes from the
paper, the precision from the aligned figures.

```json showcase
{
  "adjectives": ["exact", "formal", "reassuring"],
  "colors": [
    { "name": "Desk", "value": "#f3f1ec" },
    { "name": "Paper", "value": "#ffffff" },
    { "name": "Blue-black ink", "value": "#161b2e" },
    { "name": "Oxblood seal", "value": "#8a1f30" },
    { "name": "Paid green", "value": "#1c6a47" },
    { "name": "Grey ink", "value": "#4f5468" }
  ],
  "fonts": {
    "display": { "family": "Libre Caslon Text", "file": "public/fonts/libre-caslon-text-latin-400-normal.woff2", "weight": 400 },
    "body": { "family": "Hanken Grotesk", "file": "public/fonts/hanken-grotesk-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Facture N° F-2026-0042 — Total TTC 2 752,75 €"
}
```

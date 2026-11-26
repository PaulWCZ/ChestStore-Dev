# Quotes & invoices — design

## Name and personality

**Quotes & invoices** (French: *Devis et factures*). **Exact, formal,
reassuring** — letterpress stationery: a crisp sheet on a quiet desk,
blue-black ink, one oxblood seal. The document is the interface: you write
a quote on the paper it will print on.

## Tokens

The identity is a **theme of the store's UI kit**: `src/theme.ts`
(`defineTheme`, the very same source as the kit catalogue's "letterpress"
theme — `test/theme.test.ts` holds the two equal and checks every contrast
pair of the contract, light and dark). The company may give the tool
another look (a catalogue theme, its brand): the stylesheets name only the
contract's tokens (`@argentic/chest-ui`, `tokens/CONTRACT.md`) and two of
the tool's own, in `src/tokens.css`, defined from them (`--page-width`,
`--shadow-paper` = the look's raised shadow). No colour is written in any
stylesheet (tested).

| Contract token | Letterpress light | dark | Use here |
|---|---|---|---|
| `--bg` | `#f3f1ec` desk | `#12151f` | the page behind the paper |
| `--surface` | `#ffffff` paper | `#1a1e2b` | sheets, cards, fields |
| `--surface-2` | `#f7f5f1` | `#222736` | quiet fills, a field being written |
| `--ink` | `#161b2e` blue-black | `#e8e4db` | text, the rules of the ledger and the lines |
| `--ink-2` | `#4f5468` | `#a9adbd` | secondary text |
| `--line` / `--line-strong` | `#dcd8cf` / `#8e8a80` | `#333a4d` / `#6b7186` | hairlines / field edges and the dotted writing lines (3:1) |
| `--accent` (+ `-ink`, `-line`, `-text`) | `#8a1f30` oxblood | `#f08f9c` | the seal: the main action, the total, the number to come, the current tab |
| `--ok`, `--danger`, `--wait` (+ soft, ink) | `#1c6a47`, derived | derived | paid/accepted, overdue/refused and errors, partly paid |
| `--focus` | `#2346a8` | `#8fb3ff` | focus ring |

**Type**: *Libre Caslon Text* (display: headings, the document's name, the
subject, totals; Impallari, OFL-1.1) and *Hanken Grotesk* (body: everything
you click and read; OFL-1.1, variable), the tool's own files in
`public/assets/fonts/` (the kit writes their `@font-face`). Figures tabular and
right-aligned wherever they are compared. **Space**: 4…72. **Radii**:
3/6/10 px — paper is almost square. **Motion**: the look's, none with
reduced motion.

**The PDF** is not themed: Liberation Serif and Sans (the widths of Times
and Helvetica), embedded, black on white, in every look.

## Components

From the kit (`@argentic/chest-ui/components`), restyled by their `ck-`
classes where the letterpress needs it: the **shell** (the mark, five
labelled sections with the overdue count inked like the seal, "More" for
export and settings, the member), **page headers**, **toasts** with a
truthful *Undo*, **dialogs** that ask before losing what was typed, the
**Confirm** of finalising (the one act that cannot be undone), **date
fields** (typed "29/10", "demain"…, a calendar; on the paper they are
written on a dotted line), the **file picker** (logo, import), **tables**
(the ledger: ruled header, sortable, the total of what is shown),
**filters**, **search box** ("/"), **tabs**, **empty states**,
**StatusBadge** — inked as a rubber **stamp** (dashed Draft, ink
Sent/Unpaid/Issued, "ok" Accepted/Paid, "danger" Overdue/Refused, "wait"
Partly paid, struck Expired/Cancelled; a shape and a word, never colour
alone).

The tool's own: the **sheet** (letterhead, the document's name in Caslon
with its number underlined by the seal, dates, the two parties, subject in
italics, lines, totals with the grand total sealed, notes, fine print) —
read only, or with **ink fields**: text written on a dotted line that turns
to a solid ink line when focused; a faint "Draft" watermark on drafts.
Lines: description, then quantity × unit price, discount, VAT as small
labelled fields, the amount on the right; a "…" menu per line (move, copy,
delete — with Undo). The **margin card**: the stamp, the facts, the one
next action as a full-width button, the rest as links. **Figures** on the
desk (a ruled top, a Caslon amount). **On phones**: the sections in a row
of labelled tabs under the header (the store's one rule), the paper first
and its one next action in a sticky bar with the total (the page's action,
not a navigation); the ledgers as the kit's stacked cards (one card per
document, each line named, the whole card opens it — on every screen
the whole row does); filter chips take the look's `--radius-chip`; the client and item pickers (records of the tool, not
people: not the kit's PeoplePicker).

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
    "display": { "family": "Libre Caslon Text", "file": "public/assets/fonts/libre-caslon-text-latin-400-normal.woff2", "weight": 400 },
    "body": { "family": "Hanken Grotesk", "file": "public/assets/fonts/hanken-grotesk-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Facture N° F-2026-0042 — Total TTC 2 752,75 €"
}
```

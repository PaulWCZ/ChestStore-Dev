# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Libre Caslon Text (font) | [Impallari Type](https://github.com/impallari/Libre-Caslon-Text), via `@fontsource/libre-caslon-text` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-libre-caslon-text.txt` |
| Hanken Grotesk (font) | [marcologous/hanken-grotesk](https://github.com/marcologous/hanken-grotesk), via `@fontsource-variable/hanken-grotesk` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-hanken-grotesk.txt` |
| Glyph widths of the standard PDF fonts (Helvetica, Helvetica-Bold, Times-Roman, Times-Bold, Times-Italic) | Adobe Core 14 AFM files, as shipped in [pdfkit](https://github.com/foliojs/pdfkit) 0.20.2 (`js/data/*.afm`, pdfkit itself MIT) | Adobe's AFM notice: "may be used, copied, and distributed for any purpose and without charge, with or without modification, provided that all copyright notices are retained…" (quoted in full in the file) | `lib/pdf/metrics.ts` — only the widths, extracted into tables; the fonts themselves are the ones every PDF reader carries, nothing is embedded |
| ZIP writer, CSV writer | Written for the studio's Expenses tool (same licence, same studio), copied | MIT (this repository) | `lib/zip.ts`, `lib/csv.ts` |

Written for this tool, from the public specifications, with no code copied:
the PDF writer (`lib/pdf/writer.ts`, ISO 32000-1), the PNG and JPEG readers
for the logo (`lib/pdf/image.ts`, W3C PNG, ITU T.81).

Ideas only (their licences do not allow copying code; see
`reports/02-open-source/quotes.md` of the studio): Dolibarr (GPL-3.0 — draft
without a number, number given at validation, correction only by a credit
note, deposit invoices), Invoice Ninja (ELv2), Crater and InvoiceShelf
(AGPL-3.0 — calm quote → invoice flow), SolidInvoice (MIT — VAT rate kept on
each line).

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`) are
installed from npm under their own licences. No PDF library is used.

# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Libre Caslon Text (font, the screens; in the UI kit's registry) | [Impallari Type](https://github.com/impallari/Libre-Caslon-Text), via `@fontsource/libre-caslon-text` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-libre-caslon-text.txt` |
| Hanken Grotesk (font, the screens; in the UI kit's registry) | [marcologous/hanken-grotesk](https://github.com/marcologous/hanken-grotesk), via `@fontsource-variable/hanken-grotesk` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-hanken-grotesk.txt` |
| Liberation Sans Regular and Bold, Liberation Serif Regular, Bold and Italic 2.1.5 (fonts, the PDFs) | [liberationfonts](https://github.com/liberationfonts), as packaged by Debian/Ubuntu (`fonts-liberation` 1:2.1.5-3), files unmodified | OFL-1.1 (Reserved Font Name "Liberation") | `lib/pdf/fonts/*.ttf`, licence and copyright in `lib/pdf/fonts/LICENSE-liberation.txt` |
| CSV reader | Written for the studio's Clients tool (same licence, same studio), copied | MIT (this repository) | `parseCsv` in `lib/csv.ts`, `lib/fold.ts` |
| ZIP writer, CSV writer | Written for the studio's Expenses tool (same licence, same studio), copied | MIT (this repository) | `lib/zip.ts`, `lib/csv.ts` |

**The PDF fonts.** PDF/A (and so Factur-X) requires every font to be
embedded. The Liberation fonts have the widths of Helvetica and Times, so
the documents keep their layout; each PDF embeds a subset of them (the
glyphs it shows, others emptied, `lib/pdf/truetype.ts`). The font files in
the repository are the originals, unmodified. The OFL allows fonts to be
embedded in documents and says its terms do not apply "to any document
created using the fonts or their derivatives"; that a subset embedded in a
PDF keeps the font's name (as every PDF producer does) is the studio's
reading of the OFL and its FAQ, not a lawyer's. Earlier versions used only
the glyph widths of Adobe's Core 14 AFM files (via pdfkit 0.20.2) and
embedded nothing; those widths are no longer in the tool.

Written for this tool, from the public specifications, with no code copied:
the PDF writer and its PDF/A-3 parts (`lib/pdf/writer.ts`, ISO 32000-1,
ISO 19005-3), the TrueType reader and subsetter (`lib/pdf/truetype.ts`,
OpenType specification), the sRGB ICC profile (`lib/pdf/icc.ts`, from the
IEC 61966-2-1 primaries and curve, ICC.1:2001-04), the Factur-X / CII
writer (`lib/einvoice.ts`), the PNG and JPEG readers for the logo
(`lib/pdf/image.ts`, W3C PNG, ITU T.81).

**Factur-X: what it was written from and checked against** (read
2026-09-29). The Factur-X 1.09.2 (FNFE-MPE / FeRD, released 2026-08-04,
effective 2026-09-01) XSD, schematron (EN 16931 profile) and code lists,
and the French CTC schematron "BR-FR Flux 2", as distributed in the
`factur-x` 7.0 Python package ([PyPI](https://pypi.org/project/factur-x/),
BSD licence for the library; the schemas are FNFE-MPE's and UN/CEFACT's):
used to design and to check the output, **not copied into the tool**. The
XMP extension schema follows the one that package writes (its text is the
Factur-X specification's). fnfe-mpe.org itself could not be reached from
the studio; the AFRelationship values per profile come from the Factur-X
specification as quoted by the search results of
[invoicenavigator.eu](https://www.invoicenavigator.eu/blog/factur-x-technical-reference)
and [dev.to](https://dev.to/pdfik/factur-x-zugferd-from-html-how-to-embed-en-16931-xml-in-a-pdfa-3-and-actually-pass-verapdf-and-pgn).
Validation was run with [Mustang-CLI](https://www.mustangproject.org/) 2.26.0
(Apache-2.0; from Maven Central), which bundles veraPDF (PDF/A), the
Factur-X schematron and the French "XP Z12-012 BR-FR Flux 2" schematron
V1.3.0 (2026-02-16) — a studio check, not a dependency.

**Accounting entries.** The column names of the French FEC (article A47 A-1
of the Livre des procédures fiscales,
[Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804775/),
[BOFiP BOI-CF-IOR-60-40-20](https://bofip.impots.gouv.fr/bofip/9028-PGP.html/identifiant=BOI-CF-IOR-60-40-20-20170607),
read through search results on 2026-09-29).

**Import formats.** What the competitors' exports and import templates
hold was read on 2026-09-29 through search results only — their help
pages (help.pennylane.com, support.axonaut.com, help.sellsy.com) could not
be opened from the studio: Pennylane's clients import/export
([18764](https://help.pennylane.com/fr/articles/18764-importer-et-exporter-des-clients):
a mapping step, "Dénomination", SIREN, billing and delivery addresses) and
products ([18763](https://help.pennylane.com/fr/articles/18763-importer-et-exporter-des-produits):
VAT codes such as FR_200, FR_55); Sellsy's companies import
([8680278](https://help.sellsy.com/fr/articles/8680278-importer-mes-donnees-societes-et-contacts):
type and company name required, SIRET recommended) and exports whose
columns the user chooses
([5877082](https://help.sellsy.com/fr/articles/5877082-exporter-mes-donnees));
Axonaut's clients import from its "fichier modèle"
([support.axonaut.com](https://support.axonaut.com/configurer-votre-compte/import-des-donnees/importer-ses-contacts/)).
The exact header lists could not be verified: the test files in
`test/fixtures/` are reconstructions in those tools' style, and the
importer shows every column for the person to match.

The invoices "to collect" (`test/fixtures/open-invoices.csv`): no
documented export format of unpaid invoices from Axonaut, Sellsy or
Pennylane could be read from the studio (2026-09-29), so the fixture is a
reconstruction with the columns such exports usually carry (number, date,
client, SIREN, subject, due date, totals excluding and including VAT,
amount paid) and the importer matches French and English headers and lets
the person match any other column. Not verified against a real export.

Ideas only (their licences do not allow copying code; see
`reports/02-open-source/quotes.md` of the studio): Dolibarr (GPL-3.0 — draft
without a number, number given at validation, correction only by a credit
note, deposit invoices), Invoice Ninja (ELv2 — recurring invoices,
reminders), Crater and InvoiceShelf (AGPL-3.0 — calm quote → invoice flow),
SolidInvoice (MIT — VAT rate kept on each line).

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`, `@argentic/chest-ui` — the studio's UI kit, MIT, packed in `vendor/`) are
installed from npm under their own licences. No PDF library is used.

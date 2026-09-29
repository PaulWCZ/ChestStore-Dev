# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Work Sans (font) | [weiweihuanghuang/Work-Sans](https://github.com/weiweihuanghuang/Work-Sans), via `@fontsource-variable/work-sans` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-work-sans.txt` |
| Barlow Semi Condensed (font) | [jpt/barlow](https://github.com/jpt/barlow), via `@fontsource/barlow-semi-condensed` | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-barlow-semi-condensed.txt` |

No code is copied from other projects. Ideas only (features, not code) come
from OKR Tracker (Oslo kommune, MIT), Operately (Apache-2.0), BurningOKR
(Apache-2.0) and the SaaS tools it replaces, as listed in the studio's
research (`reports/02-open-source/goals.md` in the studio repository). The
chart is drawn by hand in SVG; no chart library.

## Import formats (read, not copied)

The import (`lib/import.ts`) reads, besides any spreadsheet and Goals' own
export:

- **Lattice's goals file** — the columns of its "Bulk Upload Active Goals
  via CSV" template: *Owner email*, *OKR Type* (objective or key result),
  *Type* (binary, digit, dollar, percent), *Description*, *Starting amount*,
  *Progress amount*, *Goal amount*, *Priority*, *Tag*, start and end dates;
  the template carries no link between a goal and its parent (attached
  after the upload). Source:
  https://help.lattice.com/hc/en-us/articles/5673818109207-Bulk-Upload-Active-Goals-via-CSV,
  read 2026-09-29 **through web search results only** (the page itself
  was not reachable from the studio): the column list is partial (the name
  column's exact header, "Name", is our assumption), so the page asks which
  column is which rather than trusting names. Lattice's own export (Goals >
  CSV, https://help.lattice.com/hc/en-us/articles/12929808069399-Export-Goals-as-a-CSV,
  same date, same caveat) lists public and private goals; its columns were
  not documented in what we could read.
- **Perdoo** exports each goal type (Objectives; Key Results & Initiatives;
  KPIs) as its own CSV with columns the user moves or hides
  (https://support.perdoo.com/en/articles/2630593-export-data, read
  2026-09-29 through web search results): there is no fixed shape to
  document, so a Perdoo file goes through the same column mapping (its
  "Key Results" view: one row per key result with its objective).

The test files `test/fixtures/lattice-goals.csv` (built from the Lattice
columns above) and `test/fixtures/goals-export-fr.csv` (Goals' own French
export) are ours.

Dependencies (`next`, `react`, `postgres`, `@argentic/chest-sdk`) are
installed from npm under their own licences.

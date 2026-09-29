# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Bricolage Grotesque (font) | [The Bricolage Grotesque Project Authors](https://github.com/ateliertriay/bricolage), via `@fontsource-variable/bricolage-grotesque` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-bricolage-grotesque.txt` |
| Instrument Sans (font) | [The Instrument Sans Project Authors](https://github.com/Instrument/instrument-sans), via `@fontsource-variable/instrument-sans` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-instrument-sans.txt` |
| dnd-kit | `@dnd-kit/core` 6.3.1, `@dnd-kit/utilities` 3.2.2 | MIT | npm dependency (the board) |

Code copied from the studio's own tools (same licence, same studio):
`lib/csv.ts`, `lib/public-origin.ts`, `lib/i18n/format.ts`,
`components/toast.tsx`, `components/dialog.tsx`, `components/avatar.tsx`,
`components/auto-refresh.tsx`, the board's keyboard and drag patterns
(Tasks, Support, Booking).

Ideas, no code (reports/02-open-source/hiring.md): stages per job and
rating on cards (Horilla, LGPL — ideas only), explicit "move to" actions and
reasons for rejection (OrangeHRM, GPL — ideas only), structured interview
feedback (Frappe HR, GPL — ideas only), activity log per candidate
(OpenCATS, MPL/CPL — ideas only). Dependencies from npm under their own
licences: `next`, `react`, `react-dom` (MIT), `postgres` (Unlicense),
`@argentic/chest-sdk` (MIT, the studio's working copy in `vendor/`).
Icons drawn for this tool.

## Formats followed (read 2026-09-29)

The studio's network reaches none of these pages directly: each was read
through search-engine summaries on 2026-09-29, not first-hand. The tool's
tests check what they say (`test/reach.test.ts`).

| Format | Source | What the tool follows |
|---|---|---|
| Google for Jobs `JobPosting` | https://developers.google.com/search/docs/appearance/structured-data/job-posting | Required: `title`, `description` (HTML), `datePosted`, `hiringOrganization`, `jobLocation` (or `jobLocationType: TELECOMMUTE` with `applicantLocationRequirements` for fully remote jobs). Recommended: `validThrough`, `employmentType`, `baseSalary`, `identifier`, `directApply`. JSON-LD in the page. Assumed, not read: an expired job's markup is removed (the tool drops it once a job closes or its last day passed) |
| Indeed XML feed | https://docs.indeed.com/job-sync-xml/xml-feed (also https://docs.indeed.com/indeed-apply/xml-feed) | `<source>` with `publisher`, `publisherurl`, `lastBuildDate`; per `<job>`: `title`, `date`, `referencenumber` (unique), `url`, `company`, `city`, `state`, `country` (without them no organic visibility), `description` in CDATA, `salary`, `jobtype`; UTF-8 declared |
| RSS 2.0 | https://www.rssboard.org/rss-specification | A channel with `title`, `link`, `description`; items with `guid`, `pubDate` (RFC 822) |
| Sitemaps | https://www.sitemaps.org/protocol.html | `urlset`, `loc`, `lastmod` |
| Teamtailor candidate export | https://support.teamtailor.com/en/articles/119099-export-your-candidates, https://support.teamtailor.com/en/articles/6121249-filter-segment-and-export-candidates | A CSV whose columns the exporter picks (names, email, "Created at"…): `test/fixtures/teamtailor-candidates.csv` is modelled on it, not a real export |
| Welcome to the Jungle ATS | https://help.welcometothejungle.com/en/export-your-applications-from-welcome-to-the-jungle-solutions-ats | A per-candidate CSV: `test/fixtures/wttj-candidats.csv` is a French spreadsheet in that spirit, not a real export |
| Workable | https://help.workable.com/hc/en-us/articles/115014887828-How-do-I-export-candidate-data | A full export is a ZIP of CSVs with résumés in folders: the importer reads the candidates CSV and CVs named with the candidate's email |
| iCalendar | RFC 5545 (through the SDK's `calendar.ics`) | The invitation's `.ics` |
| ZIP | PKWARE APPNOTE (the common subset) | `lib/zip.ts` writes, `lib/unzip.ts` reads — no dependency |

Share links: `https://www.linkedin.com/sharing/share-offsite/?url=` and
`https://x.com/intent/post?text=&url=` are opened by the recruiter's
browser; the tool itself calls neither (their current forms were not
verified first-hand).

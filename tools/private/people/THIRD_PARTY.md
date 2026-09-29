# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Outfit (font) | [Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts), via `@fontsource-variable/outfit` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-outfit.txt` |

No code is copied from other projects. Ideas only (no code) came from the
projects studied in the studio's research (`reports/02-open-source/people.md`):
the separation of a public directory from an HR file (OrangeHRM, GPL-3.0),
onboarding templates of activities given to roles (Frappe HR, GPL-3.0;
Horilla, LGPL-2.1), and the CSS tree of an org chart (dabeng/OrgChart, MIT —
the idea of nested lists with connector lines, rewritten here).

Dependencies (`next`, `react`, `react-dom`, `postgres`) are installed from
npm under their own licences; `@argentic/chest-sdk` and `@argentic/chest-ui`
(the store's UI kit: themes and shared components, MIT, © 2026 Argentic)
are packed copies in `vendor/`; `@electric-sql/pglite` is a
development dependency for tests only.

## Formats and rules followed (no code copied)

Read on 2026-09-29. The pages of the vendors and of the French
administration were **not reachable from the studio** (the network proxy
refuses legifrance.gouv.fr, service-public.fr, code.travail.gouv.fr,
economie.gouv.fr and documentation.bamboohr.com): what follows comes from
web-search summaries of these pages, cited as such. HR should check the
register against the official text before relying on it.

**The staff register (registre unique du personnel)** — `lib/register.ts`:

- Code du travail **L1221-13**: a single register in every establishment
  with employees, names in the order of hiring; interns and civic-service
  volunteers in a part of their own, in the order of arrival, with the
  dates of the internship, the tutor and where the intern is present
  (search summary of
  [legifrance.gouv.fr, section L1221-13 to L1221-15-1](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006195588)
  and [code.travail.gouv.fr/code-du-travail/l1221-13](https://code.travail.gouv.fr/code-du-travail/l1221-13)).
- **D1221-23**: for each employee, nationality, date of birth, sex, job,
  qualification, dates of entry and exit; the type and number of a foreign
  worker's work permit; the mentions "contrat à durée déterminée",
  "salarié temporaire" (with the agency's name and address), "mis à
  disposition par un groupement d'employeurs" (with its name and address),
  "salarié à temps partiel", "apprenti" / "contrat de
  professionnalisation" (search summaries of
  [legifrance.gouv.fr, article D1221-23](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000018537878)
  and [code.travail.gouv.fr/code-du-travail/d1221-23](https://code.travail.gouv.fr/code-du-travail/d1221-23)).
  Not handled: the dates of an administrative authorisation of hiring or
  dismissal, when one is required (rare).
- **R1221-26**: entries kept five years after the person left; the
  register completed chronologically and indelibly; **R1227-7**: a fine up
  to 750 € per employee concerned when it is missing or wrong (search
  summaries of [preventionbtp.fr, article R1221-26](https://www.preventionbtp.fr/droit-de-la-prevention/article-r1221-26-du-code-du-travail-registre-unique-du-personnel_Qo3WhxaN37Vk99qazt3R8),
  [code.travail.gouv.fr, fiche "Le registre unique du personnel"](https://code.travail.gouv.fr/fiche-ministere-travail/le-registre-unique-du-personnel)
  and [defendstesdroits.fr](https://www.defendstesdroits.fr/blog-posts/registre-unique-du-personnel-regles-mentions-obligatoires-et-controles)).
  The page [service-public.fr F1784](https://www.service-public.fr/professionnels-entreprises/vosdroits/F1784)
  could not be opened; the search did not return it.

**BambooHR's export** — `lib/importer.ts`, `test/fixtures/bamboohr-employee-report.csv`
(a realistic file written from these, not a real export):

- An "Employee #" column is added to every standard report exported
  ([bamboohr.com product update "Employee # in Standard Report Exports"](https://www.bamboohr.com/product-updates/employee-in-standard-report-exports), search summary);
  reports export to CSV or Excel with the fields chosen
  ([help.bamboohr.com/s/article/587751](https://help.bamboohr.com/s/article/587751), search summary).
- Field labels "First Name", "Last Name", "Hire Date", "Job Title",
  "Department", "Division", "Location", "Work Email", "Work Phone",
  "Mobile Phone"; the manager as "Reporting To" (Job Information);
  dates written MM/DD/YYYY ([BambooHR partners' import guide](https://partners.bamboohr.com/wp-content/uploads/2015/04/New-Import-Documentation.doc)
  and [documentation.bamboohr.com, field names](https://documentation.bamboohr.com/docs/list-of-field-names), search summaries).
  How the "Reporting to" cell writes a name ("Last, First" or "First
  Last") was not confirmed: both are matched.

**Lucca's export** — `test/fixtures/lucca-collaborateurs.csv`: semicolons,
French headers ("Nom", "Prénom", "Date d'entrée", "Matricule"), day-first
dates, as in the studio's research (`reports/02-open-source/people.md`,
read on 2026-09-28).

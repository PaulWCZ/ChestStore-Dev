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

Dependencies (`next`, `react`, `react-dom`, `postgres`, `@argentic/chest-sdk`)
are installed from npm under their own licences; `@electric-sql/pglite` is a
development dependency for tests only.

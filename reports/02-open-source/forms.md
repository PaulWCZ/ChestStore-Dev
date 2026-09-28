# Forms — open-source research
_Read on 2026-09-28. Replaces: Typeform, Tally, Google Forms, Microsoft Forms, Jotform (and the store's beta Forms, `reference/forms`)._

## The job
Someone in the company needs answers from people — customers ("How did we do?"), visitors
("Register for the open day"), candidates, or colleagues ("IT request", "Which date for the
offsite?", an anonymous pulse). They build a form in a few minutes, share one link, and the
answers arrive in a table they can read, sum up and export. Respondents open the link on a
phone, answer in under a minute, and never think about the tool. The daily 20 %: a dozen
question types, required fields, a page or two with a condition, a thank-you message, the
answers table, a summary with bars, and a CSV.

**Measurement caveat, stated once.** In this environment the vendors' own pages
(tally.so, typeform.com, jotform.com, workspace.google.com, formbricks.com) were refused by
the network proxy, and github.com pages answered 403. Prices below come from a search
engine's extract of the vendor's help pages ("V-search") or from third-party pricing roundups
("3P"); licences were read first-hand from `raw.githubusercontent.com`; star counts come from
search results and are marked so. Re-open the vendor URL before quoting a price to a customer.

## Commercial references

| Product | Price seen (read 2026-09-28) | What it does best | Source |
|---|---|---|---|
| **Typeform** | Free: 10 responses a month. Basic $28/month (annual; $39 month-to-month), 100 responses a month; Plus $56 ($79), 1,000 responses; Business $91 ($129), 10,000 responses — per account, not per seat (3P, several roundups agree) | The one-question-at-a-time experience: big type, keyboard letters (A, B, C), Enter to continue, smooth progress; logic jumps; NPS and opinion scales; recall of earlier answers; strong templates | https://www.koji.so/blog/typeform-pricing-2026, https://formnx.com/typeform-pricing, https://www.usecarly.com/blog/typeform-pricing/ (via search result) |
| **Tally** | Free: unlimited forms and submissions, "99 % of features"; file uploads capped at 10 MB. Pro: search results disagree — $24/month (Tally's own help page as extracted), $29/month annual or $39 monthly (third parties): removes branding, custom domains, partial submissions, team members, custom CSS, no file size cap. Business $89/month: email verification, **automatic deletion of submissions after a set period**, form version restore (90 days) (V-search) | Builds a form like writing a document ("/" to insert a block), classic one-page layout by default, conditional logic, calculated fields, hidden fields and URL prefill, generous free plan | https://tally.so/help/plans-and-pricing, https://tally.so/help/tally-pro, https://tally.so/help/tally-business, https://www.trustradius.com/products/tally/pricing (via search result) |
| **Google Forms** | No separate price: part of Google Workspace; Business Starter $7/user/month annual, $8.40 flexible (3P) | Everyone knows it; sections with "go to section based on answer"; summary charts built in; responses to a spreadsheet; "limit to 1 response" for signed-in users | https://www.name.com/blog/google-workspace-pricing, https://www.emailvendorselection.com/google-workspace-pricing/ (via search result) |
| **Microsoft Forms** | Part of Microsoft 365; Business Basic raised from $6 to $7/user/month on 1 July 2026 (3P) | 200 questions per form, 50,000 responses per form (business accounts); branching only forward (a branch never goes back); file upload questions up to 10 files, 10 MB–1 GB each, into OneDrive/SharePoint | https://formbricks.com/blog/microsoft-forms-pricing, https://nordflux.de/en/insights/microsoft-forms-response-limits-branching-and-where-the-evaluation-stops, https://support.microsoft.com/en-us/forms/add-questions-that-allow-for-file-uploads-in-microsoft-forms (via search result) |
| **Jotform** | Bronze $34/month annual ($39 monthly), 25 forms, 1,000 submissions a month; Silver $39 ($49), 50 forms, 2,500 submissions; Gold $99 ($129), 100 forms, 10,000 submissions, HIPAA (3P) | Hundreds of widgets and templates, payments, PDF of a submission, approval flows | https://formnx.com/jotform-pricing, https://www.zite.com/blog/jotform-pricing, https://tinycommand.com/blogs/jotform-pricing-explained (via search result) |

What a company pays today: Typeform and Jotform are priced **per account by responses**, so a
small team pays $28–$130 a month for one login; Tally Pro is $24–$39 a month to invite
colleagues; Google and Microsoft Forms come with office suites a company may keep anyway. The
Chest's argument for Forms is therefore **one place with the team's identity** (team-only and
anonymous forms without accounts, the bell, retention and erasure in the company's own
database) at least as much as the subscription saved.

## Projects

### Formbricks
| Field | Content |
|---|---|
| Project | Formbricks — https://github.com/formbricks/formbricks — ~12,700–13,000 stars (search results, 2026-09-28); very active (6.0.0 on 2026-09-21 per the Polls research, same day) |
| Licence | Mixed: `AGPL-3.0` for the core; `apps/web/modules/ee` under an enterprise licence; `packages/js`, `packages/android`, `packages/ios`, `packages/api` `MIT` (LICENSE read raw: https://raw.githubusercontent.com/formbricks/formbricks/main/LICENSE) |
| Reuse | **Ideas only** (the MIT packages are its in-app SDKs, irrelevant here) |
| Stack | TypeScript, Next.js, Prisma, PostgreSQL — our family |
| What it does best | Survey editor with question cards that expand in place, logic per question ("if answer … jump to …"), hidden fields, NPS / rating / CSAT questions with a summary per question (bars, averages, NPS gauge), link surveys with one question per screen, response table with filters, partial responses, multi-language surveys |
| What to avoid | Product-research orientation (in-app targeting, actions, segments), enterprise features behind a key; a lot of settings on one screen |

### HeyForm
| Field | Content |
|---|---|
| Project | HeyForm — https://github.com/heyform/heyform — ~8,980 stars (search result, 2026-09-28) |
| Licence | `AGPL-3.0` (LICENSE read raw: https://raw.githubusercontent.com/heyform/heyform/main/LICENSE) |
| Reuse | **Ideas only** |
| Stack | TypeScript, NestJS + React, MongoDB, Redis — not our stack |
| What it does best | The closest open Typeform: conversational layout, 20+ question types (opinion scale, rating, picture choice, date, file upload, signature), conditional logic, variables and calculations, hidden fields, themes per form, templates |
| What to avoid | MongoDB + Redis for a form tool; smaller community (search results) |

### OpnForm
| Field | Content |
|---|---|
| Project | OpnForm — https://github.com/OpnForm/OpnForm (formerly JhumanJ/OpnForm) — ~3,700 stars (search result, 2026-09-28) |
| Licence | `AGPL-3.0` outside `api/app/Enterprise`, which has its own licence (LICENSE read raw: https://raw.githubusercontent.com/JhumanJ/OpnForm/main/LICENSE) |
| Reuse | **Ideas only** |
| Stack | Laravel (PHP) + Nuxt (Vue), PostgreSQL/MySQL |
| What it does best | A Tally-like classic layout, unlimited submissions, conditional logic (show/hide/require a field when …), prefill by URL, closing date and max submissions, custom thank-you or redirect, "editable submissions", email to the respondent with a copy |
| What to avoid | Enterprise directory for some features; PHP + Vue split |

### OhMyForm
| Field | Content |
|---|---|
| Project | OhMyForm — https://github.com/ohmyform/ohmyform — fork of TellForm; development has slowed and its maintainers point users to Formbricks (search result: https://www.feedbackflowhq.com/vs-ohmyform) |
| Licence | `AGPL-3.0` (LICENSE.md read raw: https://raw.githubusercontent.com/ohmyform/ohmyform/master/LICENSE.md) |
| Reuse | **Ideas only** — and few: its UX is dated |
| Stack | NestJS + Next.js, MongoDB/SQL |
| What it does best | Showed that a self-hosted Typeform was wanted |
| What to avoid | Unmaintained; a warning about building a form tool without a clear owner |

### LimeSurvey
| Field | Content |
|---|---|
| Project | LimeSurvey — https://github.com/LimeSurvey/LimeSurvey — ~3,700 stars (Polls research, 2026-09-28); very active |
| Licence | `GPL-2.0-or-later` (LICENSE read raw: https://raw.githubusercontent.com/LimeSurvey/LimeSurvey/master/LICENSE) |
| Reuse | **Ideas only** |
| Stack | PHP (Yii), MySQL/PostgreSQL |
| What it does best | Serious surveys: **anonymized responses** where the token is not linked to the answer, quotas, expression-based conditions, statistics, response versioning by survey structure; strict validation per question (min/max, regular expressions) |
| What to avoid | Steep learning curve, overwhelming for a quick form (Capterra, TrustRadius reviews, via the Polls research) |

### Form.io
| Field | Content |
|---|---|
| Project | Form.io server — https://github.com/formio/formio; renderer `@formio/js` 5.6.1 (npm, 2026-09-22), `formiojs` 4.21.7 (npm, 2025-06-16) |
| Licence | Server: `OSL-3.0` (LICENSE.txt read raw: https://raw.githubusercontent.com/formio/formio/master/LICENSE.txt); renderer on npm: `MIT` (registry.npmjs.org) |
| Reuse | Server: **ideas only** (OSL-3.0 is copyleft). Renderer: code allowed (MIT) but **not used** — it brings its own look (Bootstrap) and a JSON schema far larger than we need |
| Stack | Node + MongoDB (server), vanilla JS renderer |
| What it does best | Forms as JSON definitions, rendered by one engine on both sides; server-side validation re-running the same rules as the browser — the architecture we adopt (our own small engine) |
| What to avoid | Developer-oriented builder; enterprise platform features |

### SurveyJS
| Field | Content |
|---|---|
| Project | SurveyJS Form Library — https://github.com/surveyjs/survey-library; `survey-core` 3.1.1 on npm (2026-09-23) |
| Licence | Form Library: `MIT` (LICENSE read raw: https://raw.githubusercontent.com/surveyjs/survey-library/master/LICENSE). The Creator (builder), PDF and Dashboard are under a **commercial developer licence** (https://raw.githubusercontent.com/surveyjs/survey-creator/master/LICENSE) |
| Reuse | Library: code allowed, **not used** (it ships its own themes and a large runtime; our engine is ~300 lines and tested). Creator: **nothing** |
| Stack | TypeScript, framework adapters |
| What it does best | A mature expression language for `visibleIf`, page-level `navigateToUrl`, `completedHtml`, validators per question, "Other" with comment, NPS as a rating 0–10 |
| What to avoid | The builder is not open source; expression syntax is for developers, not office managers |

## Feature list of our tool
Tags: **must** (first version), **should** (first version if it stays simple), **later**, **never**.

| Feature | Tag | Where the idea comes from | Note |
|---|---|---|---|
| Question types: short text, long text, email, phone, number, single choice, multiple choice, dropdown, yes/no, rating (stars), opinion scale 0–10 / NPS, date, file upload, statement | must | Typeform, Tally, HeyForm | 14 types; one engine validates in the browser and on the server |
| Required, help text, min/max (length, value, picks), reorderable options, "Other" | must | all | |
| Pages; show a question only if an earlier answer matches; jump to a page (or the end) after a page | must | Google Forms sections, Typeform jumps, OpnForm conditions | Forward only, like Microsoft Forms: no loop is possible |
| Live preview beside the builder | must | Tally, Formbricks | The same runner as the public page |
| Duplicate a question or a form; templates in English and French | must | all | Contact, event registration, feedback / NPS, job application, IT request |
| Public (anyone with the link) or team-only (members, identity from the Chest) | must | Google Forms "restrict to organisation" | The Chest's identity is our edge: no accounts, no email to verify |
| Anonymous team forms with real guarantees | must | LimeSurvey anonymized responses, our Polls | No member id on an answer, participants apart, rows rewritten in random order, nothing shown under 5 answers |
| Closing date, answer limit, thank-you message, redirect to an https address | must | OpnForm, Tally, Typeform | Limit checked atomically in the database |
| Prefill from the link | must | Tally, OpnForm, SurveyJS | `?<question id>=value`, built by a helper in *Share* |
| Draft vs published; versions: each answer keeps the version it answered | must | LimeSurvey structure versions, Tally Business restore | Editing a published form never corrupts older answers |
| Spam guard without a third-party captcha | must | — | Proposal *visitors* (signed "shown at", counters), a honeypot |
| One question at a time or all on one page, progress bar, keyboard (A/B/C, Enter) | must | Typeform, Tally | |
| Respondent's language for the tool's words; mobile-first; accessible | must | — | `visitors.language` |
| Answers table (search, filter, open, delete), summary (bars, averages, NPS), CSV | must | Google Forms, Formbricks | CSV Excel-friendly (BOM, `;` in French) and formula-injection safe |
| Bell for chosen people, batched | must | Tally email notifications, Google Forms | One replaced item per form and person, never one per answer |
| Copy of the answers by email to the respondent | must | OpnForm, Jotform | Proposal *mail*; never for anonymous forms |
| Retention: delete answers after N months; erase one person's answers | must | Tally Business, GDPR | Proposal *schedules* |
| Owner + shared editors/viewers per form; who may create forms by role | must | Google Forms collaborators | |
| A colour per form | should | Typeform, Tally themes | Six colours checked for contrast, not a free colour picker |
| Drafts of a respondent kept in their browser | should | Typeform (resume) | Browser storage only; nothing sent before *Submit* |
| Recall an earlier answer in a question ("Thanks {name}") | later | Typeform recall | |
| Calculated fields, scoring, quizzes | later | Tally, Typeform | |
| Partial submissions (answers of those who did not finish) | later | Tally Pro, Formbricks | Stores what someone chose not to send: a privacy question first |
| Payments | later | Tally, Jotform | Needs a payments primitive |
| Signature, picture choice, matrix/grid, ranking | later | HeyForm, Jotform, SurveyJS | |
| Webhooks, integrations, a spreadsheet sync | later | all | Needs outbound network / events between tools |
| Import a form from Typeform/Tally/Google | later | — | No public, stable export format for form definitions was found |
| Email verification of respondents | later | Tally Business | Needs mail with a code |
| Custom domain, custom CSS | never | Tally Pro | The Chest gives the address; CSS breaks accessibility |
| AI form generation | never (for now) | OpnForm | Needs an AI gateway proposal |

## Reusable pieces
- No code is copied. The logic engine, validation, CSV writer and anonymity rewrite are our own
  (the CSV writer and the anonymity design follow the studio's Hiring and Polls, same licence).
- Considered and not taken: SurveyJS Form Library (MIT) and `@formio/js` (MIT) — both
  impose their own look and are much larger than the ~300 lines our engine needs.

## Legal and security notes
- **GDPR**: a form collects personal data for the company (the controller). The tool offers
  retention (answers deleted after N months) and erasure of one person's answers; the form's
  owner writes the purpose in the form's introduction. Tally sells automatic deletion only in
  its Business plan (V-search, above).
- **Anonymous surveys at work**: CNIL distinguishes anonymous from confidential surveys and
  warns against re-identification in small groups (see the Polls research, same sources); our
  anonymous forms hide everything under five answers, refuse file questions (an upload goes
  through the member's session) and email copies, and keep no time finer than the month.
- **Spam and abuse**: the public page accepts only a form the tool showed (signed token,
  minimum time), with counters per visitor and for everyone (Proposal *visitors*) and a honeypot.
- **Uploads from strangers**: a visitor's file is claimed only by the answer that made it
  (Proposal *public uploads* with `claim`), its first bytes are checked, unclaimed ones are
  deleted by the Chest after a day.
- **CSV**: a cell starting with `=`, `+`, `-`, `@`, a tab or a return is written behind a quote
  (OWASP "CSV injection").

## Sources
- https://www.koji.so/blog/typeform-pricing-2026, https://formnx.com/typeform-pricing, https://www.usecarly.com/blog/typeform-pricing/ (via search result, 2026-09-28)
- https://tally.so/help/plans-and-pricing, https://tally.so/help/tally-pro, https://tally.so/help/tally-business, https://www.trustradius.com/products/tally/pricing, https://formbricks.com/blog/tally-pricing (via search result; tally.so and formbricks.com refused by the proxy)
- https://www.name.com/blog/google-workspace-pricing, https://www.emailvendorselection.com/google-workspace-pricing/ (via search result; workspace.google.com refused)
- https://formbricks.com/blog/microsoft-forms-pricing, https://nordflux.de/en/insights/microsoft-forms-response-limits-branching-and-where-the-evaluation-stops, https://support.microsoft.com/en-us/forms/add-questions-that-allow-for-file-uploads-in-microsoft-forms, https://learn.microsoft.com/en-us/answers/questions/5217875/ms-forms-limits-to-the-no-of-questions-and-branchi (via search result)
- https://formnx.com/jotform-pricing, https://www.zite.com/blog/jotform-pricing, https://tinycommand.com/blogs/jotform-pricing-explained (via search result)
- https://raw.githubusercontent.com/formbricks/formbricks/main/LICENSE, https://raw.githubusercontent.com/heyform/heyform/main/LICENSE, https://raw.githubusercontent.com/JhumanJ/OpnForm/main/LICENSE, https://raw.githubusercontent.com/ohmyform/ohmyform/master/LICENSE.md, https://raw.githubusercontent.com/LimeSurvey/LimeSurvey/master/LICENSE, https://raw.githubusercontent.com/formio/formio/master/LICENSE.txt, https://raw.githubusercontent.com/surveyjs/survey-library/master/LICENSE, https://raw.githubusercontent.com/surveyjs/survey-creator/master/LICENSE (read first-hand, 2026-09-28)
- https://registry.npmjs.org/survey-core, https://registry.npmjs.org/@formio/js, https://registry.npmjs.org/formiojs (2026-09-28)
- Star counts: https://openalternative.co/compare/heyform/vs/opnform, https://fomr.io/blog/best-open-source-form-builders (via search result; github.com pages answered 403 here)
- https://www.feedbackflowhq.com/vs-ohmyform (OhMyForm's maintainers pointing to Formbricks, via search result)

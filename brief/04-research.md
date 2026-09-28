# 4. Research: the ranking and open source

Use the web. Every figure you quote (price, adoption, stars, licence) carries
its source URL and the date you read it. Say when a figure is an estimate.

## Step 1 — The ranking (`reports/01-ranking.md`)

**Question:** which tools, present on day one, make a company of 5–250 people
decide to move its daily work into a Chest?

1. **List the SaaS categories** small and mid-sized companies pay for, starting
   with the European/French market and the obvious global ones. A starting
   point, to complete and challenge — not a list to follow:
   tasks and projects (Trello, Asana, Monday, Jira), wiki and docs (Notion,
   Confluence), team chat (Slack, Teams), CRM (HubSpot, Pipedrive, Axonaut,
   Sellsy), forms (Typeform — **Forms already exists in the store**), booking
   (Calendly), helpdesk (Zendesk, Freshdesk, Crisp), leave and absence
   (Lucca, Factorial), expense claims (N2F, Spendesk, Expensify), HR files and
   onboarding (BambooHR, Factorial), time tracking (Harvest, Toggl), invoices
   and quotes (Pennylane, Sellsy, Axonaut), inventory and assets, contracts
   and documents, password sharing (1Password, Bitwarden), OKRs and goals,
   meeting rooms and desks booking, surveys and polls, 1:1s and feedback,
   intranet news and directory, status pages, knowledge base / FAQ,
   recruitment / ATS (Welcome to the Jungle, Teamtailor), dashboards (Metabase),
   file sharing (Dropbox, WeTransfer), newsletters (Mailchimp, Brevo),
   whiteboard (Miro), link shortener, e-learning…
2. **Score each category** on a table, one line each, 1–5 per criterion,
   with a short justification:

   | Criterion | Question |
   |---|---|
   | Reach | What share of SMEs pay for it? |
   | Spend | Typical cost per seat × seats — what the company saves |
   | Daily use | Does it bring people into the Chest every day? (the habit that sells everything else) |
   | Feasibility now | Can it be excellent with **today's** SDK (brief/02)? 5 = yes, 1 = blocked by a missing feature |
   | Conviction | Does it make a company say "we can drop X" the first time they use it? |
   | Switching cost | Can a company move its data in (import)? |
   | Risk | Legal/regulatory exposure, security sensitivity (lower is better) |

3. **Choose 10–20 tools** for the opening store and **order** them. Explain the
   set as a whole: the tools must feel like one intranet (a new hire's first
   day should touch several of them). Mark which ones are private-space
   only and which have a public part.
4. For each chosen tool, one paragraph: the job it does, the SaaS it replaces,
   the **core 20 % of features** that cover 80 % of daily use, what we leave
   out on purpose, and which roles it declares.
5. Include tools that are not SaaS replacements if they make the Chest a
   better intranet (a home "news" board, a people directory with who-does-what,
   a company handbook). Say why.

## Step 2 — Open source, per tool (`reports/02-open-source/<tool>.md`)

For each chosen tool, find the best open-source projects doing it (typically
3–6). For each project:

| Field | Content |
|---|---|
| Project | Name, URL, stars, last release, activity |
| Licence | Exact SPDX identifier, read from the repository's LICENSE file |
| Reuse | **Code**, **ideas only**, or **nothing** (see the rules below) |
| Stack | Language, framework — does it transpose to Node + Postgres? |
| What it does best | The features and UX ideas worth taking |
| What to avoid | Complexity, dated UX, what users complain about (issues, forums) |

Then the synthesis: **the feature list of our tool**, each feature tagged
MVP / later / never, and where the idea comes from.

### Licence rules

| Licence family | Examples | We may |
|---|---|---|
| Permissive | MIT, BSD-2/3, ISC, Apache-2.0, 0BSD, Unlicense, Zlib | **Copy code**, keep its copyright and licence notice in `THIRD_PARTY.md` (Apache-2.0: also its `NOTICE`, and mark modified files) |
| Weak copyleft | MPL-2.0 | Copy **whole files** only, kept under MPL-2.0 and marked as such; our own files stay MIT. Prefer ideas when in doubt |
| Strong copyleft | GPL, AGPL, LGPL (for our purposes) | **Ideas and features only.** Never copy code, not even snippets, not even "rewritten line by line" |
| Source-available / non-open | BSL, SSPL, Elastic, Sustainable Use (n8n), Commons Clause, "fair-code", no licence at all | **Ideas and features only** |
| Everything | — | Never copy names, logos, brand assets, marketing text or screenshots. Take the idea of a feature, not its words |

Features and UX patterns are not protected: you may take the idea of a
feature from any product, open or not. Code, text and visuals are.

When you copy permissive code: small, understood, tested pieces (a parser,
an algorithm, a well-made component), with the reference in `THIRD_PARTY.md`
(project, URL, commit, licence, files). Never a whole app pasted in.

Fonts and icons follow the same rule: OFL, MIT, Apache or CC0/CC-BY with
attribution.

# ChestStore-Dev — your mission

You are the R&D studio of the **Chest store**. Chest (by Argentic) is a
company's private software space: one server per company, where its team signs
in once and finds all its internal tools. The founder is going to visit
companies and say:

> "Cancel your SaaS subscriptions. Everything you pay for per seat — your
> tasks, your wiki, your CRM, your leave requests — runs inside your own Chest,
> on your own server, for one flat price."

That pitch only works if, **on the day a Chest opens, its store already holds
10 to 20 excellent tools**. Your job is to decide which ones, research the
best of open source for each, build them on the Chest SDK with a UI that a
non-technical employee understands in seconds, and tell us what the SDK is
missing.

Read this file first, then `brief/` in order. Everything you need to
understand the platform is in `reference/` — you have no other access to it.

## What you deliver

| # | Deliverable | Where | Brief |
|---|---|---|---|
| 1 | **The ranking**: the SaaS categories companies pay for, scored, and the 10–20 tools of the opening store, in order | `reports/01-ranking.md` | [brief/04](brief/04-research.md) |
| 2 | **Open-source research** per selected tool: the best projects, their licences, what we may reuse (code or only ideas), the feature list to match | `reports/02-open-source/<tool>.md` | [brief/04](brief/04-research.md) |
| 3 | **Tools**: working prototypes on the SDK, each with its own identity and design system | `tools/<name>/` | [brief/03](brief/03-building-a-tool.md), [brief/05](brief/05-design-contest.md) |
| 4 | **The style contest**: a gallery that shows every tool's identity side by side | `showcase/index.html` | [brief/05](brief/05-design-contest.md) |
| 5 | **The SDK report**: what the SDK lacks, proven by the tools that needed it, with proposed APIs and priorities | `reports/03-sdk-report.md` | [brief/06](brief/06-sdk-report.md) |

Order, sessions and budget: [brief/07-plan.md](brief/07-plan.md).
Where you are right now: [PROGRESS.md](PROGRESS.md) — **read it at the start
of every session, update it at the end.**

## The brief

1. [brief/01-mission.md](brief/01-mission.md) — who we sell to, why they switch, what "winning" means
2. [brief/02-how-chest-works.md](brief/02-how-chest-works.md) — the platform in one page: people, hosts, manifest, capabilities, limits, what exists and what does not yet
3. [brief/03-building-a-tool.md](brief/03-building-a-tool.md) — how a tool is laid out here, the SDK, the stack, tests, the checklist
4. [brief/04-research.md](brief/04-research.md) — how to rank, how to research open source, licence rules
5. [brief/05-design-contest.md](brief/05-design-contest.md) — the UX bar and the style contest
6. [brief/06-sdk-report.md](brief/06-sdk-report.md) — what the SDK report must contain
7. [brief/07-plan.md](brief/07-plan.md) — phases, sessions, budget, Git

## Rules that never bend

- **Identity comes only from the SDK's `member(request)`.** Never from a body,
  a query, a cookie of your own. Store member ids (`mbr_…`), never names or
  emails.
- **A tool is self-contained.** `tools/<name>/` must build and run on its own
  (it will become its own repository): no import outside its folder, its own
  `package.json`, `package-lock.json`, `chest.json`, SDK copy in `vendor/`.
- **Only what the Chest gives.** No outbound network unless declared, no disk
  writes, no WebSocket, no background process, no cron (see brief/02). When a
  tool needs something that does not exist, you **prototype it behind an
  interface** (brief/03, "Missing platform features") and you write it into
  the SDK report. You never fake it silently.
- **Licences are respected.** Code is copied only from permissive licences,
  with attribution; everything else inspires features only (brief/04).
- **Simplicity is the product.** A screen that needs an explanation is a bug.
  Few words, one obvious action, plain language (brief/05).
- **English first.** Code, comments, docs, commits, PRs in English. Every tool
  speaks English by default and French through its own catalogue.
- **Do not edit `reference/` or `sdk/`.** They are snapshots of private
  repositories; see `reference/README.md`. Report what is wrong instead.
- **Honesty.** A report says what you verified and what you assume. A
  prototype says what is stubbed. No invented numbers: every price, user count
  or licence you quote has its source (URL) and the date you read it.

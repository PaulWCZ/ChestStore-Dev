# 1. The mission

## The sale

The founder visits small and mid-sized companies (first in France and Europe,
typically 5 to 250 people) and opens a Chest for them. What is sold:

- **One place.** The team signs in once and finds every internal tool, with the
  same people, groups and roles everywhere. No more twelve logins, twelve
  invoices, twelve places where an ex-employee still has access.
- **One flat price.** A Chest is priced per server, not per seat. A SaaS at
  €10 per user per month costs €6,000 a year for 50 people; the same tool in
  the Chest costs nothing more. The more seats, the stronger the argument.
- **Their data, on their server.** Each company has its own server in Europe,
  its own database per tool, its own backups. No data shared with other
  customers, no US vendor reading it.
- **Tools that fit.** Every store tool is open source and forkable: the company
  (or its coding agent) can adapt it to how it really works.

The store is the first thing a new customer sees in an empty Chest, and what
they will use every day after. If it holds beautiful, obvious, daily-use
tools, the company switches; if it holds half-finished clones, it does not.
The tools you build here are **the real store**: the good ones ship.

## What "winning" means for a tool

A store tool wins when an office manager who has never heard of Chest:

1. understands what it does from its tile (name, icon, one sentence);
2. uses it for its main job **without help, within a minute**;
3. finds it nicer and faster than the SaaS it replaces for the 80 % of daily
   use — even if it has 20 % of that SaaS's features;
4. would miss it the next day.

We do not clone a SaaS feature by feature. We deliver the **core that people
actually use**, perfectly, and leave the long tail to forks.

## What makes a Chest tool better than the SaaS

Use these on purpose — they are what a SaaS cannot do:

- **The team is already there.** No invitations, no seat management: the tool
  reads the Chest's members, groups and roles (`members`, `member()`). Assigning
  a task to "Camille" or a request to "Accounting" works on day one.
- **Notifications in one inbox.** Every tool drops its items into the Chest's
  shared bell and shows a badge on its tile (`notifications`).
- **Lifecycle for free.** When someone leaves the company, every tool is told
  (`events`) and can reassign or anonymise their data — GDPR erasure included.
- **Suite, not silos.** Tools of the same Chest share the same people; later
  they will exchange events (a form response creates a CRM contact). Design
  your tools as a family that will talk to each other, and write down in the
  SDK report the links you would want.
- **Agents.** A company's coding agent can adapt a store tool through the
  Chest's API and MCP server. Clean, documented, tested code is a feature.

## Priorities

1. **The private space first**: tools for the team, behind the Chest's
   sign-in — the company intranet with its SaaS inside. This is the core of
   the opening store.
2. **Public-facing tools second**: booking pages, customer portals, a shop, a
   public status page, a job board… They need what the platform does not have
   yet (accounts for outside users, payments, sending email). Build them
   anyway: design the missing primitives in the SDK fork (brief/03), so the
   tool is complete the day the Chest ships them — and the SDK report says
   exactly what they need.

## What you are not asked

- Not to replace regulated software: payroll, certified accounting, e-invoicing
  platforms under French/EU law, e-signature with legal value, banking. You may
  build the tool *around* them (expense claims that export to the accountant,
  invoices drafted then sent through the company's certified platform) — say
  where the legal line is.
- Not to write marketing copy. The tools themselves are the argument.

# Severe critique of the store — can a company really cancel its SaaS?

The owner asked for a very severe and constructive critique of every tool, as
if in employees' hands. Two questions: is it simple and is the UI/UX perfect,
and can we honestly say "cancel those subscriptions, nothing will be missing
compared with the competition"?

**How it was done (2026-09-29).** Four critics worked independently of the
builders.

- **Hands-on.** Each critic used its tools in the local Chest (`lab/chest-dev`)
  as a plain employee, a manager and an admin. They checked:
  - with the sample data, and emptied, to see a new company's first visit;
  - at phone width, in French, in dark mode, and with the keyboard only.
- **Against the competition.** Each tool was measured against the competitor
  it claims to replace, using the "feature list to match" in
  `reports/02-open-source/<tool>.md` and the critics' knowledge of those
  products.
- **One exception to hands-on use.** The store-wide part (`_store.md`) judges
  15 of the tools from their screenshots, READMEs and code, and says so.
- **Where the detail is.** Each tool's full critique is in
  `reports/05-critique/<tool>.md`, and the store as a whole in
  `reports/05-critique/_store.md`. Screenshot paths in those files point to
  the critics' working folder, which is not kept in the repository.
- **Not reviewed.** Forms (tool 18) was still being built.

## Verdict

**Not one tool lets a 50-person company cancel its competitor tomorrow
without losing something its people use every week.** Here is the honest
count, by category:

- **Can be cancelled today (about 6):** Trello-level tasks, Leave for most
  SMEs, News, Equipment for "who has what", Polls for internal date polls,
  and Goals for team objectives.
- **Partly (about 8):** the rest of the private tools.
- **Not at all (4):** Support, Booking, Hiring and Status. These are the
  public-facing tools, all blocked by the same platform gaps: email, calendar
  and custom domains.

The office suite, chat and video are usually a French SME's biggest per-seat
spend, and none of them can run on the Chest today. **The pitch must say
"cancel your per-seat business tools" and name them**, and the store must
feed the calendars people already live in.

| Tool | Replaces | Completeness | UX | Cancel tomorrow? | The first thing to fix |
|---|---|---|---|---|---|
| Tasks | Trello, Asana, Monday | 6 | 7 | Trello nearly; Asana not yet | A card could not be opened with the keyboard |
| Wiki | Notion, Confluence | 6 | 7.5 | Not yet | Search "wifi" did not find "Wi-Fi"; no Confluence import |
| News | Workvivo, Staffbase | 5.5 | 8 | No (yes vs Slack #announcements) | Important posts reach only people who open the Chest |
| Polls | Doodle, Officevibe | 5.5 | 8 | Doodle (internal) yes; Officevibe no | Anonymous results were shown live to organisers |
| Goals | Lattice Goals, Perdoo | 6.5 | 8 | Not yet, close | A new company on 29 Sept was offered "Q3" with one day left |
| Leave | Lucca, Factorial | 5 | 8 | Not yet | No CP N-1 / N split; accrual continued after someone left |
| People | BambooHR, Factorial | 4 (8 as a directory) | 8 | No | Not an employee record: no contract or documents, and no staff register (*registre unique du personnel*) |
| Expenses | N2F, Expensify | 5 | 7 | Not yet | A refused expense came back ticked; "Approve all" approved it |
| Timesheets | Harvest, Toggl | 5 | 8 | Toggl nearly; Harvest not yet | A changed rate rewrote past amounts |
| Equipment | Snipe-IT | 6 | 8 | Yes for "who has what" | No receipt by the employee, no handover sheet |
| Clients | HubSpot, Pipedrive | 5 | 7.5 | Not yet | Import silently dropped unknown columns; no custom fields |
| Quotes | Axonaut, Sellsy | 4 | 7.5 | No | No Factur-X and no approved platform (PA) link; no import; numbering can't continue a sequence |
| Support | Zendesk, Freshdesk | 4.5 | 8 | Not yet | No email in or out on a real Chest |
| Booking | Calendly, Cal.com | 3.5 | 8 | No | Doesn't read the host's calendar; can't block one hour |
| Rooms | Robin, deskbird | 5 | 7 | Desks nearly; rooms no | Nothing reaches Google or Outlook calendars |
| Hiring | WTTJ, Teamtailor | 4 | 7 | No | No reach (job boards, Google for Jobs); can't write to candidates |
| Status | Statuspage, Instatus | 5 | 8 | Not yet | No custom domain; no notifications without mail |

Scores are out of 10 and are the critics'. The UX scores are high because
the core flows are simple and consistent. The completeness scores are low
because every competitor has years of features the store does not match yet.

## What blocks the pitch, by who can fix it

### The platform (the Chest and the SDK): no tool can fix these alone

1. **Email, sent and received.** This unblocks Support, Hiring messaging,
   Status subscribers, Booking confirmations, CRM email logging, and email for
   Important news. The `mail` proposal exists in the SDK working copy; it has
   to ship.
2. **A calendar bridge.** Each member gets a signed iCal feed that tools
   publish into: Rooms, Leave, Booking, Hiring interviews, News events and
   Tasks due dates. Later, a read-only free/busy connector. Without it,
   Rooms, Booking, Leave and Hiring stay islands next to Google and Outlook.
3. **Reaching people outside the Chest tab:** web push and a daily email
   digest of the bell. Today approvals, assignments and Important news wait
   in a bell nobody opens.
4. **Custom domains for public hosts** (`status.`, `careers.`, `book.`,
   `support.`). This is required to replace any public-facing SaaS.
5. **Seeing the Chest's groups.** A tool open to everyone cannot target "the
   Sales team" today (News, Polls). This needs a `groups` capability.
6. **E-invoicing.** Quotes needs a way to hand invoices to the company's
   approved platform (PA). Until then the pitch says "keep your PA".

These are in the SDK report (`reports/03-sdk-report.md`), with the tools that
need each one.

### The tools: fixable now, and under way

Fix builders started on 2026-09-29, each working down its tool's critique in
order: bugs first, then blockers and majors that fit the Chest's limits.

- **First round:** Clients, Quotes, Tasks, Wiki, Polls, Expenses and Leave.
- **Next:** People, Timesheets, Equipment, News, Goals, Support, Booking,
  Rooms, Hiring and Status.

`PROGRESS.md` records each tool's state after the lead has verified it.

### The store as a whole (kit and conventions)

These come from `_store.md` §2–4 and feed the UI kit (`ui/`, report 04).

- **A people picker, date field and time select** in the tool's language,
  replacing native selects and date inputs. Sixteen tools show the browser's
  date format, not the member's.
- **Undo that tells the truth:**
  - the toast pauses on hover and focus;
  - there is no Undo once an email has left;
  - French uses "Annuler l'action", never "Annuler" twice on one line.
- **Safe dialogs:** no close on a stray click when the form has been
  changed, and never `window.confirm`.
- **One phone navigation rule:** labelled tabs, never icon-only, never
  hidden.
- **Search** in the seven tools that hold records without it.
- **Import from the competitor and "Export everything"** in every tool.
- **A store glossary:**
  - Remove / Delete / Erase (in French Retirer / Supprimer / Effacer);
  - Settings / Réglages.
  - A lint script checks it.
- **Seeded names as translated keys**, not text frozen in one language.

## What we got right (one line each, as asked)

- Core flows are short.
- The French is natural.
- Accessibility passes axe on every screen.
- Double bookings and gap-free numbering are enforced by the database.
- Undo exists almost everywhere.
- Anonymity in Polls is designed, not claimed. (The one bug in it, results
  shown live to organisers, is being fixed.)
- The five links between tools work.

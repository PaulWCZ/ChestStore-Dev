# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| `src/lib/zip.ts` (a ZIP of text files, deflated as it is written) | the studio's Clients tool (`tools/private/crm/lib/zip.ts`), written for it — same author, MIT; rewritten to stream with data descriptors and Node's zlib | MIT | `src/lib/zip.ts` |
| Atkinson Hyperlegible (font) | [Braille Institute](https://www.brailleinstitute.org/freefont/), via `@fontsource/atkinson-hyperlegible` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-atkinson-hyperlegible.txt` |

Ideas, no code: the shared-inbox folders and the collision warning
(FreeScout, AGPL — ideas only), the three statuses (Help Scout), saved
replies inserted from the composer (Chatwoot). Tags and priority (ideas
and wording only, read 2026-09-28): Zammad's three default priorities
"1 low / 2 normal / 3 high", normal by default
(https://github.com/zammad/zammad, `db/seeds/ticket_priorities.rb`,
AGPL-3.0); osTicket's Low/Normal/High/Emergency
(https://docs.osticket.com/en/latest/Admin/Settings/Tickets.html,
GPL-2.0) — we keep four plain words, *Urgent* rather than *Emergency*;
FreeScout's Tags module (https://freescout.net/module/tags/, AGPL-3.0):
tags added on a conversation, a click shows every tagged conversation,
an admin page to rename and delete. Dependencies from npm under
their own licences: `hono`, `@hono/node-server`, `react`, `react-dom`
(MIT), `postgres` (Unlicense); for the build and the tests only, `vite`,
`typescript` (MIT, Apache-2.0), `@electric-sql/pglite` and `pglite-socket` (Apache-2.0 or the PostgreSQL licence);
`@argentic/chest-sdk`, `@argentic/chest-ui` and `@argentic/chest-app` (MIT, the studio's
working copies, packed in `vendor/`; the kit's file picker and inbox
filters started from this tool's own). Icons drawn for this tool.

After the critique (2026-09-29), ideas only, no code: threading a reply
by a tagged reply address and then by In-Reply-To/References (Help
Scout's and Zendesk's email channels, as we know them; the SDK's
`mail` proposal cites Postmark's `MailboxHash` and Mailgun's routes);
merging two requests of the same customer (Zendesk's "Merge tickets",
FreeScout's merge, AGPL — ideas only); bulk actions from ticked rows,
triggers on arrival and business hours for SLA timers (Zendesk triggers,
Freshdesk dispatch rules, Zendesk business hours — as described in the
critique, not re-read); saved views (Zendesk views). France's public
holidays: Code du travail, article L3133-1 (the list of eleven days),
Easter by the Meeus/Jones/Butcher algorithm — our own code.

# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Space Grotesk (font) | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk), via `@fontsource-variable/space-grotesk` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-space-grotesk.txt` |
| Inter (font) | [rsms/inter](https://github.com/rsms/inter), via `@fontsource-variable/inter` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-inter.txt` |
| Trello field mapping (idea) | WeKan `models/trelloCreator.js`, [wekan/wekan](https://github.com/wekan/wekan) (read again 2026-09-29: `card.attachments[]` with `name`, `url`, `mimeType`, `isUpload`; a "link attachment" is one whose name is its URL, and WeKan appends those to the description) | MIT | `lib/parse-import.ts` follows its mapping of Trello's export; **no code copied** |
| Test export | `test/fixtures/trello-board.json` is shaped like a Trello board export (the REST board object with `lists`, `cards` with `badges`, `attachments`, `start`, `checklists`, `actions` of type `commentCard`, `members`, `labels`), as WeKan's importer reads it (above). Trello's own object reference (developer.atlassian.com) was not reachable from the studio on 2026-09-29; the fields are those WeKan's importer reads. Asana's CSV header in `test/features.test.ts` (Task ID, Created At, Completed At, Last Modified, Name, Section/Column, Assignee, Assignee Email, Start Date, Due Date, Tags, Notes, Projects, Parent task) is the studio's knowledge of Asana's project export, **not re-checked against a fresh export on 2026-09-29** (no Asana account here) | — | tests only |
| Recurring cards (ideas and wording only) | Asana (completion makes the next task: [Coupler.io guide](https://blog.coupler.io/asana-recurring-tasks/), [Zapier](https://zapier.com/blog/asana-recurring-tasks/)); Trello's Card Repeater ([Atlassian support](https://support.atlassian.com/trello/docs/using-the-card-repeater-power-up/): weekly on chosen days, monthly, copies on a schedule); read 2026-09-28. Planka ([#25](https://github.com/plankanban/planka/issues/25), [#931](https://github.com/plankanban/planka/issues/931)) and WeKan ([#1608](https://github.com/wekan/wekan/issues/1608), [#2305](https://github.com/wekan/wekan/issues/2305)) have no recurring cards: only feature requests | — | `lib/repeat.ts`, `lib/repeats.ts`: written for this tool, **no code copied** |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities` (MIT), `@argentic/chest-sdk`
(MIT, the studio's working copy in `vendor/`), `@argentic/chest-ui` (MIT,
the studio's UI kit, packed in `vendor/`: themes, runtime and components;
its catalogue fonts are served by the Chest, not shipped here). Icons are drawn for this
tool (`components/icons.tsx`).

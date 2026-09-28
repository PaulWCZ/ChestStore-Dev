# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Space Grotesk (font) | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk), via `@fontsource-variable/space-grotesk` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-space-grotesk.txt` |
| Inter (font) | [rsms/inter](https://github.com/rsms/inter), via `@fontsource-variable/inter` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-inter.txt` |
| Trello field mapping (idea) | WeKan `models/trelloCreator.js`, [wekan/wekan](https://github.com/wekan/wekan) | MIT | `lib/parse-import.ts` follows its mapping of Trello's export; **no code copied** |
| Recurring cards (ideas and wording only) | Asana (completion makes the next task: [Coupler.io guide](https://blog.coupler.io/asana-recurring-tasks/), [Zapier](https://zapier.com/blog/asana-recurring-tasks/)); Trello's Card Repeater ([Atlassian support](https://support.atlassian.com/trello/docs/using-the-card-repeater-power-up/): weekly on chosen days, monthly, copies on a schedule); read 2026-09-28. Planka ([#25](https://github.com/plankanban/planka/issues/25), [#931](https://github.com/plankanban/planka/issues/931)) and WeKan ([#1608](https://github.com/wekan/wekan/issues/1608), [#2305](https://github.com/wekan/wekan/issues/2305)) have no recurring cards: only feature requests | — | `lib/repeat.ts`, `lib/repeats.ts`: written for this tool, **no code copied** |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities` (MIT), `@argentic/chest-sdk`
(MIT, the studio's working copy in `vendor/`). Icons are drawn for this
tool (`components/icons.tsx`).

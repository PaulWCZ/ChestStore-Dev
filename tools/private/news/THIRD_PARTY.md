# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Fraunces (font, roman and italic) | [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces), via `@fontsource-variable/fraunces` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-fraunces.txt` |
| Libre Franklin (font, roman and italic) | [impallari/Libre-Franklin](https://github.com/impallari/Libre-Franklin), via `@fontsource-variable/libre-franklin` 5.3.0 | OFL-1.1 | `public/assets/fonts/`, licence in `public/assets/fonts/LICENSE-libre-franklin.txt` |
| Ideas only | HumHub (AGPL-3.0), Open Social (GPL-2.0), Discourse (GPL-2.0), Mattermost (AGPL-3.0) — see `reports/02-open-source/news.md` in the studio | — | Feature ideas: pinned posts, "new since your last visit", acknowledgement of important posts, event answers; audiences (HumHub's space-member visibility, Discourse's group categories), and the digest wording (Discourse's summary email is "since your last visit" and is sent only to people who have not visited). **No code copied** |
| Tiptap 3.31.3 (`@tiptap/core`, `/pm`, `/react`, `/starter-kit`, `/extension-image`, `/extensions`) | [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap), npm | MIT | the composer's text editor (`src/islands/Tiptap.tsx`), bundled for the browser only, as a chunk the composer fetches (a dev dependency: the server never loads it); its CSS is not injected (the policy refuses inline styles), the few ProseMirror rules are in `src/styles.css` |
| ZIP reader and writer | the studio's Wiki tool, `tools/private/wiki/lib/zip.ts` (same authors) | MIT, © 2026 Argentic | `src/lib/zip.ts` (one error code changed) |
| Slack export test archive | [hfaran/slack-export-viewer](https://github.com/hfaran/slack-export-viewer), `tests/testarchive.zip`, fetched 2026-09-29 from raw.githubusercontent.com | MIT, © 2016 Hamza Faran | `test/fixtures/slack-export-viewer-testarchive.zip`: a real export (`channels.json`, `users.json`, one folder per channel, one JSON file per day; messages with `type`, `subtype`, `user`, `text`, `ts`) |
| Slack export format | Slack's help page [How to read Slack data exports](https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports) (read through a search summary on 2026-09-28; slack.com is not reachable from the studio, so the fixture above is what the importer is proven on), and the code of slack-export-viewer (`slackviewer/reader.py`, read 2026-09-29: `channels.json`, `users.json` with `real_name`, subtypes `channel_join`/`channel_leave`) | — | the format only: `src/lib/transfer.ts` |

Written for this tool rather than taken from a library: the Markdown-lite
reader (`src/shared/markdown.ts`, rendered as React elements, never HTML)
and the iCalendar writer (`src/lib/ics.ts`, RFC 5545). Dependencies
installed from npm under their own licences: `hono`, `@hono/node-server`,
`react`, `react-dom`, `vite` (build only) (MIT), `postgres` (Unlicense),
`@electric-sql/pglite` and `@electric-sql/pglite-socket` (tests only,
Apache-2.0), `@argentic/chest-sdk`, `@argentic/chest-ui` and
`@argentic/chest-app` (MIT, © 2026 Argentic: the studio's SDK, UI kit and
app machinery, packed in `vendor/`). Next.js is no longer used (until
version 0.1.0 News was a Next.js 16 application). Icons are drawn for this
tool (`src/components/icons.tsx`).

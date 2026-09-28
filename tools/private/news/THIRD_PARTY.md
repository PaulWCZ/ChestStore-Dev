# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Fraunces (font, roman and italic) | [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces), via `@fontsource-variable/fraunces` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-fraunces.txt` |
| Libre Franklin (font, roman and italic) | [impallari/Libre-Franklin](https://github.com/impallari/Libre-Franklin), via `@fontsource-variable/libre-franklin` 5.3.0 | OFL-1.1 | `public/fonts/`, licence in `public/fonts/LICENSE-libre-franklin.txt` |
| Ideas only | HumHub (AGPL-3.0), Open Social (GPL-2.0), Discourse (GPL-2.0), Mattermost (AGPL-3.0) — see `reports/02-open-source/news.md` in the studio | — | Feature ideas: pinned posts, "new since your last visit", acknowledgement of important posts, event answers; audiences (HumHub's space-member visibility, Discourse's group categories), and the digest wording (Discourse's summary email is "since your last visit" and is sent only to people who have not visited). **No code copied** |

Written for this tool rather than taken from a library: the Markdown-lite
reader (`lib/markdown.ts`, rendered as React elements, never HTML) and the
iCalendar writer (`lib/ics.ts`, RFC 5545). Dependencies installed from npm
under their own licences: `next`, `react`, `react-dom` (MIT), `postgres`
(Unlicense), `@argentic/chest-sdk` (MIT, the studio's working copy in
`vendor/`). Icons are drawn for this tool (`components/icons.tsx`).

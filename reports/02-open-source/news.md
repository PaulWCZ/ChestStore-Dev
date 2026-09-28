# News — open-source research
_Read on 2026-09-28. Replaces: Workvivo, Staffbase, Simpplr, LumApps, SharePoint News, the "#general" Slack/Teams channel and all-staff emails, Workplace from Meta (shut down, see below)._

## The job
Management and teams publish a short post (announcement, event, "welcome Anna"), everyone scrolls one
feed on Monday morning, reacts or comments, and the few posts that really matter ("new mutual
insurance", "office closed Friday") are pinned and must be acknowledged. The 20 % used 80 % of the
time: write a post with a picture, a feed newest-first with pinned posts on top, reactions, comments,
and "who has read this" on important posts.

Market note: Workplace from Meta went read-only on 2025-09-01 and deleted all data after 2026-05-31
(per search result summaries of connecteam.com and en.wikipedia.org, not read first-hand), so its
former customers are looking for a replacement in 2026.

## Projects

### HumHub
| Field | Content |
|---|---|
| Project | HumHub — https://github.com/humhub/humhub — 6,746 stars (GitHub search, 2026-09-28); latest stable 1.18.6 on 2026-09-22 (1.19.0-beta.3 the same day, from releases.atom); pushed daily |
| Licence | Dual: **AGPL-3.0-or-later** or proprietary. https://raw.githubusercontent.com/humhub/humhub/master/LICENSE → `LICENSE.AGPL-3.0-or-later` |
| Reuse | **Ideas only** (AGPL) |
| Stack | PHP, Yii2, MySQL. Core modules read from the tree: activity, comment, content, dashboard, directory, file, like, notification, post, space, stream, topic, tour. Concepts transpose well to Node + Postgres; code does not |
| What it does best | One "stream" (feed) mixing posts from all spaces; likes and threaded comments; pinned posts; topics (tags) to filter the stream; @mentions; files attached to posts; a first-login "tour"; a directory of people next to the feed. README: "used in over 4,500 organizations", "over 30 languages" |
| What to avoid | "Spaces" as a mandatory concept: a 15-person company asked to hide them and have one global space (https://github.com/humhub/humhub/issues/2701). Pinned posts "can get annoying and in a way hide new content"; a collapsible "mark as read" panel is still an open proposal since 2020 (https://github.com/humhub/humhub/issues/4640); a hard limit of two pinned posts per space (https://github.com/humhub/humhub/issues/4194). ~80 optional modules make setup an admin job |

### Open Social (Drupal distribution)
| Field | Content |
|---|---|
| Project | Open Social — https://github.com/goalgorilla/open_social — 190 stars (issues live on drupal.org); 13.1.0 on 2026-09-08 (releases.atom) |
| Licence | **GPL-2.0** — https://raw.githubusercontent.com/goalgorilla/open_social/main/LICENSE.txt |
| Reuse | **Ideas only** (GPL) |
| Stack | PHP, Drupal. Not transposable as code |
| What it does best | Feature set read from `modules/social_features`: activity stream, events (`social_event`), featured content, content reporting, email broadcast, likes, mentions, follow content/user/tag, topics, landing pages, private messages, user export. Good split between **topic** (news type: announcement, blog, event) and **group** |
| What to avoid | Drupal admin UX; community-site features (landing pages, albums, books) that an SME intranet does not need |

### Elgg
| Field | Content |
|---|---|
| Project | Elgg — https://github.com/Elgg/Elgg — 1,678 stars; 7.1.0 on 2026-09-10 (Packagist); active (pushed 2026-09-28) |
| Licence | Core: **MIT OR GPL-2.0-only**; bundled plugins in `/mod`: **GPL-2.0-only** — https://raw.githubusercontent.com/Elgg/Elgg/7.x/LICENSE.txt |
| Reuse | Core: **Code** (MIT, with attribution) — but it is PHP, so in practice ideas. `/mod` plugins (blog, likes, the wire…): **Ideas only** |
| Stack | PHP, MySQL, own framework ("social networking engine") |
| What it does best | Clean separation of "river" (activity feed) vs content types; access levels per item (public / logged-in / group); notification subscriptions per content |
| What to avoid | Engine-first, not product-first: a company must assemble plugins to get an intranet. Dated default theme |

### Discourse (ideas for comments and reading)
| Field | Content |
|---|---|
| Project | Discourse — https://github.com/discourse/discourse — 47,918 stars; `stable` tag updated 2026-09-24 (releases.atom; version number not verified) |
| Licence | **GPL-2.0** — https://raw.githubusercontent.com/discourse/discourse/main/LICENSE.txt |
| Reuse | **Ideas only** (GPL) |
| Stack | Ruby on Rails, Ember, PostgreSQL. Data model (topics, posts, reactions on Postgres) transposes well; code does not |
| What it does best | Reading UX: "new since last visit" line, unread counters, one reaction click, pinned "banner" topic that each user dismisses once, Markdown composer with image paste and live preview, flat comments (no deep nesting) |
| What to avoid | Forum mechanics (trust levels, badges, categories tree) — too much for an announcement board |

### Mattermost (ideas for announcements and acknowledgements)
| Field | Content |
|---|---|
| Project | Mattermost — https://github.com/mattermost/mattermost — 39,210 stars; v11.11.1 on 2026-09-24, v12.0.0-rc2 on 2026-09-25 (releases.atom) |
| Licence | Source under **AGPL-3.0** (with exceptions) or commercial; admin templates/config under Apache-2.0; compiled binaries MIT — https://raw.githubusercontent.com/mattermost/mattermost/master/LICENSE.txt |
| Reuse | **Ideas only** (AGPL for the application code) |
| Stack | Go, React, PostgreSQL. Real-time via WebSocket (we cannot) |
| What it does best | Message **priority** labels ("Important", "Urgent") and **"request acknowledgement"** on a post, with the list of who acknowledged — exactly our "read by". Announcement banner for the whole server. (Feature names from product knowledge; exact edition availability not verified) |
| What to avoid | Chat as the channel for official news: announcements drown in chatter — the very reason companies want a separate board |

Also seen: Rocket.Chat (https://github.com/RocketChat/Rocket.Chat, 46,184 stars) is **MIT** outside its `ee/` directories (https://raw.githubusercontent.com/RocketChat/Rocket.Chat/develop/LICENSE), but it is chat, not a news board; nothing specific to reuse.

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Write a post: title, text (simple rich text / Markdown), one cover image, attachments | MVP | HumHub, Discourse, Staffbase | Images and files through the Chest file API |
| One feed, newest first, pinned posts on top | MVP | HumHub stream, Discourse banner | Unlimited pins, but pinned block collapses (avoid HumHub #4640) |
| Post types: Announcement, Event, Welcome, Info | MVP | Open Social topics, Workvivo | Just a coloured label + filter; no "spaces" (HumHub #2701) |
| Event post: date, time, place, "I'm coming" | MVP | Open Social `social_event`, HumHub calendar | Add-to-calendar `.ics` download |
| Welcome post for a new hire, linking to their People card | MVP | Workvivo, Simpplr | Member id from platform; link to People tool if installed |
| Reactions (a small fixed set) and flat comments | MVP | Discourse, HumHub like/comment | No nesting |
| "Important": ask for acknowledgement, author sees read / not read list | MVP | Mattermost acknowledgement, Staffbase read receipts | See legal note (L.2312-38). Only explicit "I have read" click, never passive tracking |
| Unread marker / "new since your last visit" | MVP | Discourse | Per-member last-seen timestamp |
| Who may publish: role from the platform (e.g. "communication") vs everyone may comment | MVP | HumHub permissions | Uses Chest roles, no user management in the tool |
| Notify members of an important post | MVP (inbox) / later (email, push) | Staffbase, Workvivo | Shared Chest inbox now; **outbound email is a missing primitive** |
| Live updates of new posts/comments | MVP by polling | — | **No WebSocket**: poll every 30–60 s |
| Schedule a post for later | later | Staffbase, LumApps | Needs **scheduled job primitive** (or "publish when first read after date" trick — to decide in SDK report) |
| Auto-unpin / expire after a date | later | HumHub #4640 | Same scheduler dependency; can be computed at read time |
| @mentions | later | HumHub, Open Social | Notifies via inbox |
| Polls in a post | later | HumHub polls module | |
| Audience targeting (post only to a group/site) | later | LumApps, Staffbase | Uses platform groups |
| Weekly digest email | later | HumHub email summaries | Needs email + scheduler |
| Reading stats per post (views, reach) | later | Workvivo, Staffbase | Aggregate counts only |
| Import from Slack channel export (ZIP of JSON, one folder per channel, one JSON file per day; `users.json`, `channels.json`) | later | Slack export — https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports (read via search summary) | Import one "#announcements" channel as posts |
| Import from Workplace from Meta | never | — | Data deleted after 2026-05-31 (per search result); export was via Graph API or vendors, format not verified |
| Gamification, badges, leaderboards | never | Workvivo, Discourse | Noise for SMEs |
| Chat / private messages | never | Open Social, HumHub mail | Other tool's job |
| Mobile native app | never | Staffbase | Responsive web is enough |

## Reusable pieces
- **markdown-it** 15.0.2 (npm, 2026-09-11) — MIT — https://github.com/markdown-it/markdown-it — render post bodies.
- **@tiptap/core** 3.31.3 (npm, 2026-09-04) — MIT — https://github.com/ueberdosis/tiptap — if we want a WYSIWYG editor instead of Markdown.
- **sanitize-html** 2.17.7 (npm, 2026-08-13) — MIT — https://github.com/apostrophecms/sanitize-html — server-side sanitising of rendered HTML (or **dompurify** 3.4.16, `MPL-2.0 OR Apache-2.0`, taken under Apache-2.0).
- **ics** 3.12.0 (npm, 2026-04-23) — ISC — https://github.com/adamgibbons/ics — "add to calendar" file for event posts.
- **date-fns** 4.4.0 (npm, 2026-05-29) — MIT — relative dates ("2 h ago") in EN and FR.
- **emoji-mart** 5.6.0 (npm, 2024-04-25) — MIT — only if we open reactions beyond a fixed set (not needed for MVP).
- Elgg core is MIT-licensed but PHP: nothing worth copying line by line.

## Legal and security notes
- **GDPR, legal basis**: an internal communication tool processes employee identity, reactions and comments. The CNIL HR reference framework (2019, updated) treats internal directory/communication tools under **legitimate interest** and rejects consent as a basis in the employment relationship (per search result summaries of https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel and the référentiel PDF; cnil.fr is blocked from this environment, not read first-hand).
- **"Read by" = monitoring risk**: Code du travail **L.2312-38** requires informing and consulting the CSE (companies ≥ 50 staff) *before* introducing "means or techniques allowing monitoring of employee activity" (text per search result from https://code.travail.gouv.fr/code-du-travail/l2312-38, not read first-hand). Design choice: acknowledgement is an explicit button on posts marked Important, visible to the author only; no passive view tracking per person; say this in the tool's docs so the customer can inform its CSE.
- **Right to disconnect** (Code du travail L.2242-17, not read first-hand): do not push notifications out of hours; the inbox model is fine; scheduling a post should default to working hours (later).
- **Retention**: define a retention for posts and reactions (e.g. keep posts, delete reactions/acknowledgements of former employees' data on request). The 2026 CNIL HR retention référentiel was published 2026-04 (per search result, URL https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf, not read first-hand).
- **Security**: sanitise rich text server-side (stored XSS is the main risk of a feed); check image MIME with a sniffing library, not the extension; authorship from `member(request)` only; only publishers can pin or ask for acknowledgement.
- **Image rights**: photos of colleagues in posts fall under image rights; add a hint on upload ("make sure people in the photo agree").

## Sources
- https://github.com/humhub/humhub (stars via GitHub search API, 2026-09-28)
- https://raw.githubusercontent.com/humhub/humhub/master/LICENSE
- https://raw.githubusercontent.com/humhub/humhub/master/README.md
- https://github.com/humhub/humhub/releases.atom
- https://github.com/humhub/humhub/tree/master/protected/humhub/modules
- https://github.com/humhub/humhub/issues/2701
- https://github.com/humhub/humhub/issues/4640
- https://github.com/humhub/humhub/issues/4194 (via search result summary)
- https://github.com/goalgorilla/open_social
- https://raw.githubusercontent.com/goalgorilla/open_social/main/LICENSE.txt
- https://github.com/goalgorilla/open_social/releases.atom
- https://github.com/goalgorilla/open_social/tree/main/modules/social_features
- https://github.com/Elgg/Elgg
- https://raw.githubusercontent.com/Elgg/Elgg/7.x/LICENSE.txt
- https://repo.packagist.org/p2/elgg/elgg.json
- https://github.com/discourse/discourse
- https://raw.githubusercontent.com/discourse/discourse/main/LICENSE.txt
- https://github.com/discourse/discourse/releases.atom
- https://github.com/mattermost/mattermost
- https://raw.githubusercontent.com/mattermost/mattermost/master/LICENSE.txt
- https://github.com/mattermost/mattermost/releases.atom
- https://raw.githubusercontent.com/RocketChat/Rocket.Chat/develop/LICENSE
- https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports (search summary)
- https://connecteam.com/e-workplace-shutting-down/ (search summary)
- https://en.wikipedia.org/wiki/Workplace_(software) (search summary)
- https://code.travail.gouv.fr/code-du-travail/l2312-38 (search summary)
- https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel (search summary)
- https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf (search summary)
- https://registry.npmjs.org/ (markdown-it, @tiptap/core, sanitize-html, dompurify, ics, date-fns, emoji-mart — versions and licences)

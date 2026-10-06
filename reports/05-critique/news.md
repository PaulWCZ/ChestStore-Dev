# News (tools/private/news) vs Workvivo, Staffbase, Slack announcements: severe critique

Screenshots: `critique/collab/shots/n-*.png`. Harness on port 7100 (`--prod --reset`, seeded), then emptied (`truncate posts, … cascade`) for the first visit. Tested as Sofia (publisher, en), Camille (admin publisher, fr), Hugo (reader, en), Nora (reader, fr, the new colleague); desktop, 390 px phone, dark, French.

## Verdict

**Can a 50-person company cancel Workvivo or Staffbase tomorrow?**
- **An office-based company using Slack #announcements plus the all-staff email:** yes for the page itself (the front page, Important with read confirmations, events with RSVP, welcome posts). But **not yet** as a *replacement for the email*, because nothing reaches people who do not open the Chest.
- **Workvivo or Staffbase (frontline and mobile staff):** no. There is no push, no email, no app, no video and no reach statistics.

**Completeness 5.5/10**: the core feed is complete and thoughtful. The *distribution* half of an employee-comms tool (email, push, newsletter, stats, translation) is missing. **UX 8/10**: the best-looking front page in the store, and clear composer choices. Markdown in the text box and one-click notify-everyone are the weak spots.

Strength in one line: Important plus "Read by 3 of 6", with who has not read and "Remind them", beats Slack and matches Staffbase for a fraction of the effort.

## Blockers

1. **An Important post reaches nobody who does not open the Chest.** Where: README "What it does not do": no email, no push. The whole value of Workvivo and Staffbase for a 50-person company with a workshop, drivers or shop staff is reaching everyone, and the all-staff email exists because it lands in a place people already look. Here "Important" rings a bell inside the Chest; the warehouse lead who never opens a laptop will never see "We are moving on 2 November". **Fix (M, SDK):** use the SDK outbox/email proposal:
   - an Important post also emails its audience (subject = headline, first paragraph, and an "I have read it" link that lands on the post);
   - the weekly digest can go by email, with a per-person switch.

   If the Chest has no email at launch, sell News as "the front page" and not as a Workvivo replacement.
2. **Posting to a team does not work in the default setup.** Where: README "Groups are the Chest's": `members.groups.list()` returns only groups that *give access to News*. A company that opens News to everyone (the normal case) has **no groups to pick**; the composer then says to go and re-grant News group by group. "For Sales only" is a weekly need (sales targets, tech on-call rota), and the seed itself shows a "For Sales" post. **Fix (M, SDK):** the `groups` capability ("sees the Chest's groups and who is in them") the README already asks for. Until then, allow **hand-picked people** as an audience, which is doable today with `members`.

## Major

1. **The text is Markdown.** Where: composer (`n-compose.png`, `n-compose-preview.png`). The toolbar hint reads `**gras** *italique* - liste [lien](https://…)`, and a Write/Preview switch is needed to see the result. An office manager writing the Christmas-party post will not type `**`. Staffbase, Workvivo and even Slack show formatting as you type. The Wiki tool already ships Tiptap. **Fix (M):** use the Wiki's Tiptap editor with the same small schema (paragraph, subheading, bold, italic, list, quote, link) plus **pictures inside the text**. Store the same Markdown, so nothing else changes.
2. **One click notifies the whole company, with no summary before sending.** Where: composer › Important › Publish. I published "Fire drill on Thursday" as Important in 220 ms: every member got a bell item, with no "This will notify 6 people and ask them to confirm" step, and no *Undo* for the notification. A typo in an Important post to 200 people cannot be taken back. **Fix (S):** when Important or a group audience is set, the Publish button reads "Publish and tell 6 people" / "Publier et prévenir 6 personnes". Hold the bell for 10 s with an Undo toast, or add "Send a correction" that replaces the bell item.
3. **No reach statistics at all.** The README deliberately does not record who opened a post, which is legally careful (L.2312-38) and good. But Workvivo and Staffbase buyers expect **aggregate** numbers ("seen by 42 people, 70 %"). Without them the comms person cannot prove anything. **Fix (M):** anonymous aggregate counts per post (number of distinct viewers, no names), shown only to publishers, documented for the CSE.
4. **No video or picture gallery.** Only one cover picture and attached files. A welcome post with three photos from the team lunch, or a 30-second CEO video, is Workvivo's daily content. **Fix (M):** several pictures in a post (a gallery) and video files played inline from Chest files (a size cap, no transcoding).
5. **No @mentions and no replies to comments.** Research lists @mentions as "later"; comments are flat. "@Camille can we bring partners?" has no way to reach Camille. **Fix (S/M):** @person in comments sends a bell item; one level of replies.
6. **No two-language posts.** A French company with English-speaking staff (the seed mixes both) posts each announcement twice or in one language only. Staffbase translates. **Fix (M):** an optional second-language version of the headline and text, shown by member locale. There is no auto-translate (no outbound network), but offering the field is enough.
7. **Scheduling is below the fold on desktop, under a sticky Publish bar.** Where: `n-compose-preview.png` at 1280×860. "Pin to the top" is half covered and "When: Publish now / Schedule" is out of sight while *Publish* is always visible. A publisher meaning to schedule for Monday can publish now. **Fix (S):** put "When" next to the Publish button ("Publish now ▾ / Schedule…"), a split button.

## Minor

1. **The same word for two actions in French.** In the header the red "Publier" button opens a new post, and in the composer "Publier" sends it (`n-compose.png`), both visible at once. **Fix (S):** header "Écrire" (Write a post); keep "Publier" for submit. Hide the header button inside the composer.
2. **Phone category tabs are cut** ("WELCO…", `n-front-phone.png`) with no fade or scroll hint. **Fix (S):** a fade edge or wrapping chips.
3. **A welcome post without a photo shows a big flat initials block** (`n-front-hugo.png`: "NP" on beige, the largest element of the grid). It looks unfinished. **Fix (S):** a smaller card or the Chest member photo when available, with the illustration only as a fallback.
4. **No expiry for pins** (research: "auto-unpin after a date, computed at read time" was proposed but not built). A "Office closed for the holidays" post stays pinned in February. **Fix (S):** "Pinned until…".
5. **No multi-day events and no RSVP limit/waitlist** (the seminar with 30 seats). **Fix (S/M).**
6. **Search has no stemming** ("move" does not find "moving", as the README says). **Fix (S):** add `french`/`english` stemmed vectors next to `simple`.
7. **Polls in a post:** the store has a Polls tool, so a "Add a poll" link that creates one in Polls and embeds its result would be the suite argument. **Fix (M, cross-tool).**

## Bugs

No functional bug found in the flows I ran (publish, Important, confirm list, bell in French or English, event "You're coming", search, empty states, groups-only badge). Pages load in 0.6-0.9 s. Items to check:
- The seed's times (Published 23 September at 01:48, confirmed "Wed 23 Sept, 2:28") are night-time timestamps in the showcase: the seed is relative to "now" and the harness ran near midnight UTC. Seed cosmetics: anchor seed times to 09:00-18:00 local.

## Migration in / out

- **In:** nothing. There is no Slack channel import (the research listed it as "later", with the exact Slack export format) and no Workvivo or Staffbase import. For a news feed the history matters less, but "the last 3 months of #announcements" would make day one feel full. **Fix (M):** a Slack export zip import that takes one channel and turns each top-level message into an Info post by its author (matched by name).
- **Out:** only the confirmations CSV per post. There is no export of all posts. **Fix (S):** "Download all posts" (JSON plus Markdown, with files) for admins.

## UX notes

- First minute: an empty publisher sees "Nothing published yet … Write the first post" (`n-empty-publisher.png`); a reader sees "The first posts will appear here." Good.
- Reader: the yellow strip "One post asks you to confirm you have read it" plus "Read it" (`n-nora.png`) is excellent. It is the obvious action.
- French is natural ("Dites-le en quelques mots", "Racontez…", "Vous venez."). The role label "Rédaction" for publisher is well chosen.
- Dark mode (`n-front-dark.png`) holds the newspaper identity.

## Trust for the buyer

Good: Undo on delete (kept 30 days), a draft kept in the browser, the CSE paragraph in the README, erasure. Missing: an **edit history** of a post (an Important post changed after 40 people confirmed: did they confirm the old text?). **Fix (S/M):** record versions, and when an Important post's text changes, ask "Ask everyone to confirm again?". Also missing: an admin view of scheduled posts by all publishers.

## Fix plan (ordered)

1. Email (and later push) for Important posts and the digest, via the SDK outbox. **M**
2. The audience: hand-picked people now, a `groups` capability in the SDK. **M**
3. A "Publish and tell N people" label plus a 10 s undo window. **S**
4. Tiptap editor instead of Markdown, with pictures in the text. **M**
5. The split Publish/Schedule button. **S**
6. A post edit history, and re-confirm after a change. **S/M**
7. Anonymous aggregate reach per post. **M**
8. A gallery and video. **M**
9. @mentions and replies. **S/M**
10. Slack channel import; export all posts. **M**
11. Minors: the French button label, phone tabs, the welcome block, pin expiry, stemming, a second language. **S each**


## October 2026: after the move to the new stack

_Added 6 October 2026 from News's commits, README and `lab/measure/`
results at `70227ed` — not a new hands-on critique: the verdicts above
stand unless this section says otherwise._

- **Stack.** Off Next.js 16, onto the studio's stack: Hono, React rendered
  on the server with islands, Vite, through `@argentic/chest-app` 0.1.0-studio.6,
  SDK `0.4.1-studio.4`, contract 0.4 (`"chest": "0.4"`, schedules in `chest.json`);
  `chest check` says OK. Features, flows, audits and looks kept.
- **Measured** (`lab/measure`, `before-next16` → `after-package`; PSS of the
  server's process tree at rest, median of 5): **119.9 → 66.6 MiB**;
  image 475 → 28 MiB; first members' page 820 →
  460 ms (median of 10, on a shared machine); `npm ci` and the
  build now fit 512 MiB and one CPU.
- **Review**: reviewed by an independent agent after the move, verdict "good, with fixes"; the fixes are merged.
- **Fixed after the review**: the export streamed (a ZIP written as it is sent, one file at a time: 8 files of 20 MB peak at 177 MiB RSS from 99 at rest); the Slack import counted while read (50 MB) and capped at 64 MiB inflated; date and list formatters made once; the editor's frame while it loads; the focus after "I have read it"; a reader gets a 404 on every publisher's page (`eba4e48`).
- **Pending**: Nothing listed as pending in its commits.

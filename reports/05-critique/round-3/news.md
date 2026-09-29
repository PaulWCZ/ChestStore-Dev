# News (tools/private/news) vs Workvivo, Staffbase, Slack #announcements — critique round 3

**Setup.** Run 2026-09-29 on harness port 11100. I built with `npm run build`, then ran `dev.mjs --prod --reset` (seeded) and `--reset --empty`. The tool's flow (`flows/news.mjs`) passes 23/23.

**My passes.** Scripts `sweep.mjs`, `one.mjs` and `news-phone.mjs`; screenshots in `shots/news-*`, `n-*` and `ne-*`.
- **People:** Sofia (publisher, en), Camille (admin publisher, fr), Hugo (reader, en).
- **Pages:** front page, Important post 4, event post 3, event composer, search.
- **Displays:** 1280 px and 390 px, dark; the own Newsprint look, Chest, brand:sample, and brand:port light and dark.
- **Other checks:** 12 search queries, a phone composer run, and the empty Chest.

**Result.** No page scrolls sideways. The only 404s are the reader opening `/chest/new`, which is expected.

## Verdict

**Can a 50-person French company cancel Workvivo or Staffbase tomorrow?**
- **An office company that uses them as an intranet front page: yes.** This depends on the Chest having `mail`.
- **A Workvivo customer: not yet.** Workvivo sells an employee *social* feed, and here only publishers can post: no shout-outs, no kudos, no "share a photo from the site" (see "Still blocking" 1).
- **Frontline staff: not yet.** There is no push and no app; that is platform work.

**Can it replace Slack #announcements? Yes.** It does better: confirmations, email, events.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 5.5 | 8 | **8.5** |
| UX | 8 | 8.5 | **9** |

Completeness gained the honest per-post view count. UX gained because every round-2 ordering fix landed: confirm under the headline, event date and place under the headline, the bar no longer covers content.

Strength: the front page, "Read by 0 of 6 · 3 confirmed an earlier version and are asked again", and a CSE paragraph a buyer can hand to the works council.

## Round-2 top fixes and blockers

| Round 2 | Status | How checked |
|---|---|---|
| Fix 1: honest per-post reach | **Fixed** | Post 4, as Sofia: "Opened by 6 of the 6 people it is for. Counted every hour." It sits next to "Read by 0 of 6". It is an anonymous number shown from 5 people, forgotten after 30 days. The misleading "opened News since" line is gone |
| Fix 2a: event date and place under the headline | **Fixed** | `news-p-sofia-3.png`: DAY / Today / Tomorrow come right after HEADLINE |
| Fix 2b: confirm strip under the headline on phones | **Fixed** | `news-p-hugo-1.png`: "This post changed since you confirmed…" and **I have read it** at y ≈ 400, above the picture |
| Fix 2c: sticky bar over content | **Fixed** | Flow step; on the phone the bar follows the form (`n-phone-compose3.png`) |
| Fix 2d: drop cap on short words | Fixed per README | The event post no longer reads "L et's" |
| Fix 3: polls in a post | **Not fixed** | Left to the SDK report (README). A post can only link to a poll |
| Blocker: push, app | Not fixed (platform) | |
| Blocker: automatic translation | Not fixed (platform) | |
| New 6: empty page hides the best starts | **Fixed** | `ne-p-sofia-0.png`: "Write the first post", "Welcome a new colleague", "Moving from Slack? Import a channel" |
| New 7: role words | **Fixed** | Publisher = "Rédacteur" in News and in the Wiki |

## Still blocking (weekly, for a paying customer)

1. **Only publishers can post. Workvivo's core is posts from employees.** Round 2 missed this. What Workvivo sells is:
   - "Shout-outs" and kudos to a colleague;
   - a site team posting a photo of the finished job;
   - a new hire's own "hello".

   In News a reader can react and comment, but can **never** start a post. A reader-post kind ("Shout-out", "From the team", or Info), with a moderation option ("a publisher approves first", or "anyone posts"), is the weekly feature a Workvivo buyer checks in the demo. Slack #general also lets anyone post.
2. **No poll inside a post.** It was round 2's third fix and is still open. "Which date for the seminar?" is the most common engagement post in Workvivo and Staffbase. Today the publisher writes the post, opens Polls, creates the poll with the same audience, and pastes a link.
3. **Push and frontline reach** (platform). Email to people without a company mailbox reaches nobody.
4. **No admin view of every publisher's scheduled posts.** This was flagged in round 2 and is still in "does not do". With three publishers, two Important posts can collide on Monday 08:30 and nobody sees it.

## New problems (missed by round 2)

1. **Search shows the wrong language's headline.**
   - Steps: Camille (French) searches "déménager".
   - What happens: the result reads **"We are moving on 2 November"**, the English headline. Her front page shows the same post as "Nous déménageons le 2 novembre", and so do her bell and her email.
   - Why it matters: the search results page is the one place that ignores the reader's language, so a French reader thinks it is a different post.
2. **The README contradicts itself about stemming.** "What it does" says words are found "by the beginning or by its stem in English and French". "On a Chest" says "`simple` + `unaccent`: **no stemming**". Migration 0003 does add `news_en`/`news_fr` with stemmers, so the second paragraph is stale. Store rule: a README tells the truth.
3. **The reader's empty front page has two rules with nothing between them.** `ne-d-hugo-0.png`: "Nothing published yet · The first posts will appear here", then an empty band framed by two horizontal lines (an empty section is still rendered).
   - On the publisher's phone, "Moving from Slack? Import a channel" and the footer "Import from Slack, or download all posts" are both visible in the same screen. That is the same action twice.
   - The reader's empty state names nobody. Tasks now says "Ask Camille Martin".
4. **An event cannot be answered from the bell or the email.**
   - According to the README (not tested in the outbox), the bell item, the Important email and the Monday digest all carry one link: the link to the post.
   - What happens: an event invitation offers no "I'm coming / Not coming" link. Every answer costs a visit to the Chest.
   - Why it matters: Workvivo's and Outlook's invitations are answered in one tap from the notification.
5. **Search does not find a post by its French text for "vacances" or "secourisme".** It returns "Rien trouvé".
   - The first-aid training event exists ("First-aid training: 3 places") but is written in English only.
   - The empty result only says "Vérifiez l'orthographe". It could offer "1 post in English matches 'first aid'"… That is a bigger job. At least the empty result should suggest searching in the other language when posts exist in only one.

## Platform-dependent

- **Push to phones:** not proposed. It should be the first line of the SDK report for News.
- **Polls embedded in a post:** Polls would need to publish a result event (`polls.poll.closed`) and accept "create a poll for this audience" from another tool. Cross-tool *commands* do not exist; only events do. Propose a `tools.call` or intent in the SDK.
- **Reply from email** (answer an event by a signed link): the `mail` proposal would need signed one-click action links, or the tool can issue its own signed token links on the team host.
- **Automatic translation:** a platform AI or translation gateway (not proposed).

## Top 3 fixes now

1. **Posts from everyone, moderated (M).** A "Shout-out / From the team" kind open to readers. It is either published at once or waits in a "To approve" list for publishers (a setting). A shout-out names a colleague, who is told. Nobody is emailed except the colleague named. Reuse the existing kinds, audiences and moderation (delete + undo).
2. **Search and empty states in the reader's language (S).**
   - Search results use the reader's language version of the headline and snippet.
   - Correct the README's "no stemming" paragraph.
   - Drop the empty rule band.
   - Name the publishers in the reader's empty state.
   - Show one Slack import link, not two.
3. **Answer an event from the email (M).** The event email and bell item carry "I'm coming" and "Not coming" as signed, single-use links to `/chest/posts/<id>/answer?token=…`. The link goes through the Chest front, so identity still comes from `member(request)`. The token only proves which button was pressed, and the page confirms "You're coming. Undo".

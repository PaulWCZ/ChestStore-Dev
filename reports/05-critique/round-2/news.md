# News (tools/private/news) vs Workvivo, Staffbase — critique round 2

Run on 2026-09-29, harness port 7100. Build: `npm run build`, then `dev.mjs --prod --reset` (seeded) and `--reset --empty`. The tool's own flow (`flows/news.mjs`) passes 21/21.

My own passes (`critique2/collab/`, `shots/n-*`, `ne-*`, `nh-*`):
- **People:** Sofia (publisher, en), Camille (admin publisher, fr), Hugo (reader, en), Nora (reader, fr).
- **Pages:** front page, Important post, event, composer, search, transfer.
- **Views:** 1280 px, 390 px phone, dark.
- **Looks:** own (Newsprint), Chest, sample brand, Instrument.

No sideways scroll, no errors. The only 404s are readers opening `/chest/new` and `/chest/transfer`, which is expected.

## Verdict

**Can a 50-person French company cancel Workvivo or Staffbase tomorrow?**
- **An office company (all staff have a laptop): yes**, if the Chest sends email. The all-staff email and #announcements can go too.
- **Frontline staff** (workshop, drivers, shops): **not yet**. There is no push and no app, and reach is only "opened News at all".

**Completeness: 5.5 → 8.** Both round-1 blockers are closed on the studio Chest: email for Important posts and the digest, and any Chest group or hand-picked people as audience. Almost all the majors are done too: the rich-text editor, "Publish and tell 6 people by bell and email" with a 10 s Undo, versions with re-confirm, gallery and video, @mentions and replies, two-language posts, split Schedule, Slack import and export.

**UX: 8 → 8.5.** Still the best front page in the store. It loses points for a buried re-confirm banner on the phone and an event form placed under the text.

Strength: "Read by 4 of 7", Undo before anything leaves, and re-confirm after an edit — Staffbase-level trust at a tenth of the weight.

## Round-1 findings

| Round 1 | Status | How checked |
|---|---|---|
| B1 Important reaches nobody outside the Chest | **Fixed on the studio Chest (platform-dependent)** | Flow and composer label "Publish and tell 6 people by bell and email"; the post says "Sent by email to 6 people". Needs `mail`; without it the label says "…in their bell" |
| B2 Posting to a team impossible by default | **Fixed (platform-dependent)** | "Some groups or people": hand-picked people work today; any Chest group needs the `groups: "read"` proposal |
| M1 Markdown text box | **Fixed** | Toolbar editor (B, I, H, lists, quote, link, picture) |
| M2 One click notifies everyone | **Fixed** | "Publish and tell 6 people by bell and email"; 10 s Undo; nothing has left before that |
| M3 No reach statistics | **Partly** | "6 of 6 people it is for have opened News since it was published". That counts opening *News*, not *this post* (see new problem 1) |
| M4 No video or gallery | **Fixed** | Up to 20 pictures and videos (MP4/WebM, 25 MB, no transcoding) |
| M5 No @mentions or replies | **Fixed** | Flow |
| M6 No two-language posts | **Fixed** | "Written in English ▾ / + Add a version in French"; "Lire en français" on the post |
| M7 Scheduling below the fold | **Fixed** | Split bar: Cancel · Schedule… · Publish |
| Minors: French "Publier" twice, phone tabs cut, welcome block, pin expiry, multi-day events and places, stemming, polls in a post | **Fixed** except polls in a post | "Écrire" in the header; tabs wrap to two lines on the phone; "Pinned until 8 October"; "déménager" finds "déménagement"; places and waiting list |
| Trust: edit history, admin view of scheduled posts | History **fixed**; admin view of every publisher's scheduled posts **not** | README says so |

## Still blocking

1. **No push and no app.** For Workvivo/Staffbase buyers with frontline staff, the phone notification *is* the product. Email to a warehouse lead with no company mailbox reaches nobody. The Chest has no push, so this is platform-dependent.
2. **Reach is not per post.** The publisher reads "6 of 6 opened News since it was published" while "Read by 0 of 6" sits just above it (`nh-post4-publisher.png`, post 4). "Opened News" is true of anyone who looked at the front page for a second. The number looks like reach but is not. The CSE reasoning (no per-person, per-post record) is sound. An anonymous **count** of distinct viewers per post, with a floor of 5 and no names, would answer the comms person without monitoring anyone. Workvivo and Staffbase buyers ask for "views per post" in the first demo.
3. **No automatic translation.** The second language is typed by hand. A Staffbase buyer with a bilingual workforce gets it with one click. There is no network and no AI gateway, so this is platform-dependent.
4. **No polls or surveys inside a post.** The Polls tool is a separate island. "Which date for the seminar?" in the post is weekly Workvivo content.

## New problems found this round

1. **Misleading reach line** (above): "have opened News since it was published" reads as "saw it". At minimum, reword it to "6 of 6 have visited News since (not necessarily this post)", or drop it until a per-post count exists.
2. **On a phone, the re-confirm banner sits below the cover picture.** Hugo opens post 4 at 390 px. "This post changed since you confirmed. Please read it again and confirm", with **I have read it**, starts at y = 817 of 844, under the headline, byline, language link and a 250 px picture. The main action of the page is at the fold edge. Put the confirm strip right after the headline.
3. **The event's date, time and place come after the text box.** Choose *Event* in the composer: the Day / Starts at / Place block appears **below** the text editor (`nh-event.png`), outside the first screen at 1280×860. An event without its date is the classic mistake. Put the when/where block right under the headline.
4. **The sticky action bar covers the right column.** At 1280×860 the Cancel / Schedule… / Publish bar sits over "MORE PICTURES AND VIDEOS" in the right column (`n-own-sofia-d-_chest_new.png`). On the phone it sits right under the text toolbar, so the text area is hidden until you scroll.
5. **Drop cap splits the first word.** "L et's celebrate the quarter together!" (event post 3, in every look: own, Instrument, brand). Short first words read as two words. Apply the drop cap only when the first word has 4 letters or more, or never on events.
6. **The empty publisher page hides the two best starts.** "Import from Slack, or download all posts" is a 10 px footer link. There is no "Welcome a new colleague" example. On the phone, an empty front page still shows the five category tabs over nothing.
7. **Store coherence:**
   - News uses the studio `calendar` and `groups: "read"` proposals; Wiki, Polls and Goals, which need the same things, do not. Round 1 had two tools asking for it; now one has it.
   - French role names: publisher = "Rédaction" (News) while the Wiki's editor = "Rédacteur"/"Éditeur". Admins see three words for "writer".

Looks: Chest (one weight, grey), sample brand in dark, and Instrument all hold the newspaper hierarchy. The dark brand "confirm" strip is dark brown on dark green: readable, but the lowest contrast of the set (not measured).

## Platform-dependent

- Email for Important posts, reminders and the digest: **`mail` proposal**. Also wanted: a `mail.available()` probe (News learns only from a failed send) and a quota exemption for Important posts (500 emails a day by default).
- Any Chest group as an audience: **`groups: "read"` proposal** plus `group.*` events.
- Event in each person's calendar: **`calendar` proposal**.
- Digest and scheduled Important posts: **`schedules` proposal**.
- Push to phones and faster fan-out than 1,000 recipients an hour: **not proposed yet**. It should be the first line of the SDK report for this tool.
- Video thumbnails and transcoding, and translation: platform services, not proposed.

## Top 3 fixes now

1. **Honest per-post reach (M):** an anonymous count of distinct viewers per post (the count only, shown from 5), next to "Read by N of M". Remove or reword "opened News since". Document it in the CSE paragraph.
2. **Composer and post order (S):**
   - event when/where right under the headline;
   - the confirm / re-confirm strip right under the headline on phones;
   - the sticky bar never over content;
   - no drop cap on short first words.
3. **Polls in a post (M, cross-tool):** "Add a question" in the composer creates a poll in Polls (same audience) and shows its result card in the post. This is the suite argument against Workvivo, and both tools already exist.

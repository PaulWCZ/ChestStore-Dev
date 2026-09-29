# Wiki (tools/private/wiki) vs Notion, Confluence — critique round 2

Run 2026-09-29, harness port 7100: `npm run build`, `dev.mjs --prod --reset` (seeded) and `--reset --empty`. The tool's flow (`flows/wiki.mjs`) passes 31/31. I also ran my own passes (`critique2/collab/`, `shots/w-*`, `we-*`, `wh-*`) with:

- **people:** Camille (editor/admin, fr), Tom (editor), Hugo (reader), Nora (no role);
- **pages:** home, page, editor, search, history, space settings, import, trash;
- **display:** 1280 px, 390 px phone and dark;
- **looks:** own (Library), Chest, sample brand, Trail and Confetti;
- **search:** 13 typed queries.

No page scrolls sideways and no errors.

## Verdict

**Can a 50-person French company cancel Confluence or Notion tomorrow?**

- **Notion or Confluence used as a handbook/intranet: yes, with one warning.** Pages read and acknowledged reach nobody who does not open the Chest.
- **Confluence as a team documentation space with heavy commenting and review: not yet.** There are no inline comments or replies, and no co-editing.
- **Notion as a workspace (databases): no, by design.**

**Completeness 6 → 8.** All three round-1 blockers are fixed:

- Confluence, Word and Google Docs import;
- per-space edit rights;
- search.

Also added: the "/" menu, @mentions in comments, read-and-acknowledged, pins, export everything, and a lock that frees itself.

**UX 7.5 → 8.5.** The focus bugs are gone. The phone editor has every tool in sight, and "Watching" and "Stop editing" keep their words. The empty state now offers three clear starts.

Strength: reading, history-in-words and "Is this page still correct?" remain better than Confluence. Now the migration story is too.

## Round-1 findings

| Round 1 | Status | How checked |
|---|---|---|
| B1 "wifi" finds nothing | **Fixed** | "wifi", "code wifi invités" and "mot de passe wifi" all put *Wi-Fi and printers* first. Typos work: "pasword" gives Password manager, "teletravial" gives Charte télétravail. But see new problem 2 (noise) |
| B2 No Confluence import | **Fixed** | Flow imports a Confluence HTML zip with its tree; .docx and Google Docs HTML exist too |
| B3 Editing rights global | **Fixed** | Space settings: "Qui peut la modifier: tous les rédacteurs / seulement certaines personnes"; flow: Tom reads Sales and is told why |
| M1 "Create and write" loses first words | **Fixed** | Flow; "Nothing to save yet" |
| M2 Dialog focus on ✕ | **Fixed** | Flow; a typed title survives Escape |
| M3 Lock kept 15 min after leaving | **Fixed** | Flow: leaving frees the page at once (beacon); 2-minute lease; take-over after 15 min idle |
| M4 No "/" menu, no @mention | **Partly** | "/" menu yes; @ in **comments** only, not in page text |
| M5 No read and acknowledged | **Fixed (bell only)** | "Pages à lire" on home, CSV of who read which version. Not emailed (see still blocking 1) |
| M6 Phone editor cut off | **Fixed** | Toolbar on two rows; "Arrêter de modifier" labelled. The save status is still truncated ("Aucune mo…") |
| M7 Watch unlabelled on phone | **Fixed** | "Watch" with its word |
| M8 No page-level restrictions | **Not fixed** | Said honestly in the README (use a restricted space) |
| M9 No whole-wiki export | **Fixed** | "Download everything" |
| Minors: "space" first, diff drops links, TOC at 1280, pins, embeds, replies, seed author | Fixed, except **embeds** and **replies/inline comments** | TOC shows at 1280 (`wh-toc-1280.png`) |

## Still blocking

1. **Read-and-acknowledged and review reminders live only in the bell.** The Wiki does not declare the `mail` proposal, although Tasks, News, Polls and Goals all do (`chest.proposals.json`). The office manager asks 50 people to confirm the *règlement intérieur*, and the warehouse staff who never open the Chest are never asked. This was the round-1 reason for the feature.
2. **"Who edits Sales" and "ask the sales team to confirm" cannot pick a Chest group when the wiki is open to everyone.** The README asks for `members.groups.list({scope: "chest"})`. News already built and uses the studio **`groups: "read"` proposal** (`members.groups.all()`); the Wiki does not use it. So the normal company (wiki open to all) chooses people one by one.
3. **No inline comments, replies or resolve.** Confluence reviews happen on a highlighted sentence. A flat list at the bottom is a guestbook.
4. **No live co-editing.** Two people editing the meeting notes during the meeting is weekly Notion/Confluence behaviour; here the second person waits. This depends on the platform.
5. **No embeds** (a Loom or YouTube video, a Google Sheet, a PDF preview). Notion users embed weekly.

## New problems found this round

1. **French role word collides with News.** The Wiki's editor is "Rédacteur" in the interface (`lib/i18n/fr.ts:25`, header "Camille Martin · Rédacteur"). The tile translation in `chest.proposals.json` says **"Éditeur"**, so the same role has two names. News calls its publisher role "Rédaction", and its README says "Rédacteur". An admin setting roles in the Chest sees Éditeur for the wiki and Rédacteur/Rédaction for News. Pick one glossary word (store §2.12).
2. **The OR fallback floods French queries.**
   - "note de frais" returns **17 pages**. First come *Préparer un rendez-vous client*, *Sales playbook* and *Entretiens annuels*, matched on "de". The *Expense policy* page is not in the top five.
   - "mot de passe wifi" returns **19 pages** (the right one first, then noise).
   - French stop words (de, la, le, les, des, du, à, et) and English ones must not count as matches in the fallback.
3. **No French/English bridge for the most common words.** "vacances", "remboursement", "tt" and "code porte" return nothing, and the Expense policy is not found by "frais". The README admits it. But in a French company with part of the handbook imported in English (the seed itself mixes both), the first search fails. A small built-in synonym list (congés/vacances/holidays, note de frais/expenses, télétravail/tt/remote) editable by editors is cheap.
4. **Confluence import loses dates.** Imported pages show "maintenant par Inès Moreau" as their last update on the home page, and history starts at import. After a migration, *Recently updated* is flooded with 300 pages "updated now", which hides real changes for weeks. Keep the export's modification date as the version date, and leave imports out of *Recently updated*.
5. **Minors:**
   - a reader who opens `/chest/pages/<id>/edit` (a shared link) gets "Nothing here" (404) instead of "You can read this page; ask an editor";
   - the reader's empty wiki shows an empty "SPACES" sidebar heading;
   - "Tous ceux qui ont le wiki" in space settings is the same awkward phrasing round 1 flagged in Polls;
   - the phone editor's save status is cut ("Aucune mo…").

Looks: Chest, sample brand, Trail and Confetti are all readable. Long text switches to each theme's reading face; Confetti's Fredoka body on the phone is large but legible. Dark mode is clean. Nothing broken.

## Platform-dependent

- Email for read confirmations and reviews: **`mail` proposal**, which the Wiki should declare as its sibling tools do.
- All the Chest's groups: **`groups: "read"` proposal** (built, used by News).
- Co-editing and presence: **realtime** (not proposed; the store needs it for Wiki and chat).
- Whether a new member must also confirm: **`access.granted` / `member.added` events** (README).
- Relaying `sendBeacon` through the Chest front: untested on a real Chest; the 2-minute lease covers it.

## Top 3 fixes now

1. **Declare `mail` and `groups: "read"`** and use them (S/M). Read-confirmation requests, reminders to non-confirmers and review reminders go by email. Groups from the whole Chest go into "who edits", "who reads" and "ask to confirm". Copy the News implementation.
2. **Search quality for French** (S):
   - stop words out of the OR fallback;
   - an editable synonyms list seeded with ~30 FR/EN office words;
   - a test that "note de frais" puts Expense policy first.
3. **Replies and inline comments with resolve** (M): one level of replies first, then comments anchored on a selection. This is what keeps Confluence review teams.

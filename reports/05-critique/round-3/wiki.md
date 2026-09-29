# Wiki (tools/private/wiki) vs Notion, Confluence — critique round 3

Run 2026-09-29 on harness port 11100. I ran `npm run build`, then `dev.mjs --prod --reset` (seeded), then `--reset --empty`. The tool's flow (`flows/wiki.mjs`) passes 34/34.

My own passes (`sweep.mjs`, `one.mjs`, `wiki-paste.mjs`; screenshots `shots/wiki-*`, `wiki2-*`, `w-*`, `we-*`) covered:
- **People:** Camille (editor, fr), Hugo (reader, en), Tom (editor) and Nora (no role).
- **Pages:** home, a page, the editor, history, search and import.
- **Displays:** 1280 px, 390 px and dark; the own Library look, Chest, brand:sample, and brand:port in light and dark.
- **Search:** 24 French and English queries.
- **Pasting:** a Google-Docs-style HTML paste into the editor.

No page scrolls sideways, and no console errors.

## Verdict

**Can a 50-person French company cancel Confluence or Notion tomorrow?**
- **Confluence or Notion used as the company handbook/intranet: yes.** Read confirmations now go by email, and the Chest's groups are used.
- **Confluence as a team's documentation space: not yet.** There is no co-editing, no restriction per page, and no @mention in page text.
- **Notion as a workspace: no.** It has no databases, no personal pages, no public page and no embeds.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Completeness | 6 | 8 | **8.5** |
| UX | 7.5 | 8.5 | **8.5** |

Strength: still the best reading and "find the answer" experience in the store. Replies, resolve and passage comments now make review possible.

## Round-2 top fixes and blockers

| Round 2 | Status | How checked |
|---|---|---|
| Fix 1: declare `mail` and `groups: "read"` | **Fixed** | `chest.proposals.json` declares both. The flow checks the French and English emails in the outbox and the "reminded, in the bell and by email" toast. Any Chest group can be asked |
| Fix 2a: stop words in the French search | **Fixed** | "note de frais" gives 2 pages, *Expense policy* first (it gave 17) |
| Fix 2b: a synonyms list | **Fixed** | "tt" finds *Charte télétravail*; editors change the list |
| Fix 3: replies and inline comments with resolve | **Fixed (one level; the quote is not anchored)** | Flow: comment on a passage, reply, resolve, reopen |
| Blocker: the bell only | Fixed | As above |
| Blocker: groups | Fixed | As above |
| Blocker: inline comments | Mostly fixed | The passage is highlighted only when the quote is clicked |
| Blocker: live co-editing | **Not fixed** (platform) | |
| Blocker: embeds | **Not fixed** | |
| New #1: "Rédacteur" vs "Éditeur" | **Fixed** | `chest.proposals.json` fr says "Rédacteur"; so do the interface and News |
| New #4: Confluence import dates | **Fixed** | README; search results show "dans Handbook (Confluence) · il y a 4 semaines" |
| Minor: a reader opening `/edit` got a 404 | **Fixed** | "You can read this page, not change it. To change it, ask an editor of “Handbook”." |
| Minor: the phone save status was cut | **Fixed** | `wiki-p-camille-2.png`: "Aucune modification" in full |
| Minor: the reader's empty "SPACES" heading | **Partly** | The heading is gone. An empty beige sidebar column remains (`we-d-hugo-0.png`) |

## Still blocking (weekly, for a paying customer)

1. **No stemming, so plural and verb forms fail.** "remboursé" and "rembourser" find **nothing**; "mutuelle", "RTT" and "vpn" find nothing either. The synonyms list only helps with words someone listed.
   - A French handbook is written with "rembourser", "remboursement" and "remboursé" used interchangeably. Confluence and Notion both stem.
   - The store already solved this: News's `migrations/0003_reach.sql` adds `news_en`/`news_fr` configurations (`unaccent` + `english_stem`/`french_stem`) and a `stems` tsvector, and "déménager" finds "déménagement" there. The Wiki, the store's search tool, is now behind News.
2. **Everyone creates in Notion; here a "reader" cannot even write a personal page.**
   - A 50-person Notion customer lets every employee write meeting notes and personal to-do pages ("Private" in the sidebar).
   - The Wiki has no personal/private pages at all. An admin can make everyone an editor, but then everyone edits the *règlement intérieur* too, unless each space names its editors.
3. **No restriction per page.** "Only HR sees this page under Handbook" means a separate space. Confluence customers use page restrictions weekly (drafts before publishing, salary pages).
4. **No @mention in page text** (only in comments), and **no embeds** (video, Google Sheet, PDF preview). Both are weekly in Notion.
5. **Live co-editing** (platform). Meeting notes written by two people at once wait on the lock.
6. **No public link to a page.** Notion's "Share to web" is used weekly for a client-facing FAQ or a job description. The Wiki is private only.

## New problems (missed by round 2)

1. **Bug: an image pasted from the web shows in the editor, then disappears silently on save.**
   - **Steps:** Tom edits *Team meeting, 28 September* and pastes HTML with `<img src="https://example.com/x.png">` (what Google Docs puts on the clipboard: images on googleusercontent.com). The editor shows the image. `Ctrl+S` says "Saved." The saved page has no image (the server's schema keeps only the wiki's own files).
   - **Impact:** copying a section with a diagram from a Google Doc, a website or an email is a daily act, and the picture is lost without a word.
   - **Fix:** on paste, either upload the image through the Chest (outbound network is not allowed, so it cannot be fetched), or immediately replace it with a visible placeholder: "This picture comes from the web: download it and drop it here". Never say "Saved." while dropping content.
2. **Search results are still noisy on the single words people actually type:**
   - "horaires" ranks *Deploying a firmware update* first, above *Règlement intérieur*;
   - "nouvel arrivant" returns only *Expense policy* and neither onboarding page;
   - "clé bureau" returns 7 pages, the first being *Handbook home*.
   - The OR fallback plus typo matching still accepts weak one-word hits. It needs a relevance floor (drop matches on one fuzzy word when an exact match on a title exists).
3. **The search highlight breaks hyphenated words:** "Wi-Fi" renders as "Wi - Fi" with gaps between the highlighted parts (`w-search-wifi.png`). It looks like a typo in every Wi-Fi result, which is the demo query.
4. **The reader's empty wiki is a dead end:** "The editors of your company will write the first pages here" names nobody. Tasks now names the managers ("Ask Camille Martin"); the Wiki should name its editors the same way. The empty sidebar column stays on the left.
5. **An empty editor home shows a stray divider** above "Nouvel espace" in the sidebar (`we-d-camille-0.png`). This is cosmetic.

## Platform-dependent

- Co-editing, presence and cursors: **realtime** (not proposed).
- Public pages: the Chest has public hosts (`tools/public-and-private/`), so a Wiki "published pages" part is buildable **today**, by moving the tool to `public-and-private` and adding a "Publish this page" switch. It is not blocked by the platform.
- Fetching pasted web images server-side: **declared outbound network** (the manifest allows declared hosts; `*` is unlikely to be granted). The honest fix is the placeholder.
- Being asked to confirm after joining later: the **`access.granted` event** (README).

## Top 3 fixes now

1. **French/English stemming, and a relevance floor (M).**
   - Copy News's `news_fr`/`news_en` stem configurations (`migrations/0003_reach.sql`) into the Wiki, next to the `simple` + `unaccent` vector, and rank exact title matches first.
   - Drop one-fuzzy-word hits when better ones exist.
   - Tests: "remboursé", "rembourser", "horaires" and "nouvel arrivant" return the right page first. Fix the "Wi - Fi" highlight.
2. **Nothing pasted disappears silently (S).**
   - Web images on paste become a visible placeholder block ("Picture from the web — drop the file here") that saves as such.
   - The save toast says "Saved — 1 picture from the web was not kept" if any were stripped.
   - Name the editors in the reader's empty state.
3. **Private pages for everyone, and restriction per page (M/L).**
   - A "My pages" space per member, visible only to them, where readers may write too (meeting notes, drafts). "Move to Handbook" publishes a page.
   - Then "Only these people/groups" on a page and its subpages, reusing the space rules already in `lib/access.ts`.

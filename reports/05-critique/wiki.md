# Wiki (tools/private/wiki) vs Notion, Confluence: severe critique

Screenshots: `critique/collab/shots/w-*.png`. Harness on port 7100 (`--prod --reset`, seeded), then emptied by truncating `spaces, pages, page_versions, drafts, …` for the first-visit test. Tested as Tom (editor, en), Camille (admin editor, fr), Inès (editor, fr), Hugo (reader, en), Nora (no role); desktop, 390 px phone, dark, French, keyboard.

## Verdict

**Can a 50-person company cancel Confluence or Notion tomorrow?**
- **Notion used as an intranet or handbook:** not yet, but close. Search misses the obvious query, there is no slash menu or @mention, and every editor can edit every space.
- **Confluence:** no. There is no Confluence import, no per-space edit rights, and no "read and acknowledged".
- **Notion used as a workspace (databases, personal notes):** no, by design.

**Completeness 6/10**: history with a readable diff, drafts, locks, a trash, templates, review reminders, a Notion import and a zip export are real and good. Permissions, search quality and the editor's discoverability are behind. **UX 7.5/10**: the most beautiful reading experience in the store, but two focus bugs lose typed text and the phone editor is cramped.

Strength in one line: read mode, the diff in words and "Is this page still correct?" are better than Confluence's.

## Blockers

1. **Search does not find the Wi-Fi page, and the home page itself suggests that search.** Where: `/chest/search`, `lib/search*`. The home placeholder says "Holidays, expenses, Wi-Fi password…". I verified it with `w2.mjs`:
   - `wifi` returns **"No page matches 'wifi'"**, although the page "Wi-Fi and printers" exists and holds the network table.
   - `wifi password` returns only "Password manager" (`w-search2.png`), which is the wrong page.
   - `wi-fi` works.

   French queries find nothing on English pages (`vacances`, `note de frais`, `remboursement`). That is expected without translation, but a French company writing in French will type "wifi", "télétravail", "tt" and so on.

   The job of a wiki is "find any answer in seconds". Failing on the example the product itself suggests is the first thing a buyer will try.

   **Fix (S/M):**
   - Normalise hyphens and punctuation inside words on both sides: index "Wi-Fi" also as "wifi", and query "wifi" also as "wi fi".
   - Use OR ranking instead of AND when AND returns fewer than 3 results.
   - Add trigram similarity on body text, not only on titles.
   - Add a test: "wifi" finds "Wi-Fi and printers".
2. **No Confluence import.** Where: README "What it does not do", and `reports/02-open-source/wiki.md` line 77 lists the Confluence HTML export import as **MVP**. It is not built. A company on Confluence cannot move 300 pages by hand, so the claim "replaces Confluence" is false today. **Fix (M):** import Confluence's HTML space export (zip). Pages come from `index.html` and the breadcrumb tree, run through turndown (MIT) to Markdown, then through the existing Markdown pipeline, and attachments go to Chest files. Import Google Docs as HTML or .docx in the same step (Word export is how most French SMEs hold their handbook).
3. **Editing rights are global: any editor edits every space they can see.** Where: `lib/access.ts` `spaceAccess()` returns `write` for every editor who sees the space. A company wants Sales to write Sales pages, HR to write HR pages, and everyone else only to read the Handbook. Today it can only choose "everyone edits everything" or "only 3 people edit anything". Confluence (space permissions) and Notion (page sharing: can edit / can view) both do this, and research line 72 says "groups can edit" is MVP. **Fix (M):** per space, "Who can edit" as everyone with the Editor role, or these groups/people. Readers stay readers.

## Major

1. **"Create and write" does not put the cursor in the page; the first words are lost.** Where: New page dialog → editor (`w-writing.png`, `w-saved.png`). I created "Our prices", typed "Day rate 900 euros." at once, and nothing was written. The status still said "No changes"; *Save* then saved an **empty page** with a "Saved." toast. `document.activeElement` in the editor was `body`. **Fix (S):** focus the body at the end (`editor.commands.focus('end')`) after creation. Disable *Save* or say "Nothing to save" when there are no changes.
2. **Dialogs open with focus on the ✕ button.** Where: *New space* and *New page* dialogs (`w-newspace.png`): the focus is `button.icon-button`. Anyone who types right away types into nothing. **Fix (S):** `autoFocus` the Name/Title field. The same bug exists in Tasks, so fix it in a shared component in each tool.
3. **Leaving the editor without "Stop editing" keeps the page locked for 15 minutes.** Where: page lock (`w-locked.png`). Tom opened the editor, then navigated away with the browser. Inès then saw "Tom Walker modifie cette page depuis 01:46" and could not edit. Tom's own page view said nothing about his pending draft (`w-after-leave.png`). This happens on every closed tab, back button or phone call. **Fix (S):** release the lock on `pagehide` with `navigator.sendBeacon`, and cut the lock timeout to about 2 minutes with a heartbeat while the editor is open and visible. On the page, show "You have unsaved changes: continue editing / discard" to the draft's owner.
4. **No slash menu and no @mention in the editor.** Where: the editor. Typing "/" inserts "/" (`w-mention.png`), and "@Sof" is plain text. Notion and Confluence users insert everything with "/" and notify colleagues with "@". The research listed "/ menu" as MVP (line 68). The toolbar is 16 unlabeled icons (they have aria-labels, but only tooltips for sighted users). **Fix (M):** a "/" menu with the same blocks as the toolbar (it doubles as a way to discover them), and "@person" in the page and in comments, which sends a bell item.
5. **No "read and acknowledged" for policies.** The seed itself holds "Règlement intérieur" and "Charte télétravail". In France the employer must be able to show that staff were informed, so an office manager will ask for this in the first demo. Confluence add-ons and Notion "verification" are the competitors here. **Fix (M):** on a page, "Ask everyone (or groups) to confirm they read this". Readers get a bell item and a "I have read it" button. The editor sees who has and has not confirmed, with the version, and can export it as CSV.
6. **The phone editor is cut off.** Where: `w-edit-phone.png`. The toolbar shows 7 of 16 buttons with no scroll hint (lists, table, image and note are off-screen). "Stop editing" becomes a bare chevron. **Fix (S):** a wrapping two-row toolbar, or a "+" block menu on phones, and keep the text label on "Done".
7. **On a phone, "Watch" is an unlabelled check icon.** Where: `w-page-phone.png`. The header shows a lone ✓ square and "…". A reader cannot guess that it means "you are watching this page". **Fix (S):** keep the word ("Watching" / "Suivi") on phones; the header has room.
8. **No page-level restrictions.** Access is per space only (README). "Salary grid 2027 (draft)" inside the "People & management" space is visible to everyone in that space. **Fix (M):** "Only me / these people" on a page and its subpages.
9. **No export of the whole wiki, and no PDF.** Per space there is a zip; there is no single "everything" export for an admin leaving or doing a backup check. Print to PDF is in the browser only. **Fix (S):** "Export all spaces" for editors/admins, as a zip of the space zips.

## Minor

1. **You must create a "space" before writing a page.** The empty state offers "Add an example handbook" (good) and "New space", a word a non-technical editor does not know. **Fix (S):** "Write the first page", which creates a "Handbook" space silently if none exists.
2. **The history diff drops links.** `w-history.png` ends with "Questions? See ." where the page link "Who to ask" should be. **Fix (S):** render link text in the diff.
3. **The table of contents does not appear at 1280 px** (the README says "on wide screens"). Most office laptops are 1280-1440 px wide. **Fix (S):** show it from 1200 px, or as a collapsible "On this page" at the top.
4. **No favourites or pinned pages** on the home page ("Holidays", "Who to ask" pinned by the office manager). **Fix (S):** "Pin to home" for editors.
5. **No embeds** (YouTube or Loom video, Google Sheets, PDF preview). Notion users embed weekly. **Fix (M):** safe iframes from an allow-list, which needs `frame-src` CSP changes.
6. **Comments are page-level only, with no replies or resolve.** Confluence inline comments are how reviews happen. **Fix (M):** replies first, inline later.
7. **The seed says version 1 was "Imported 3 months ago by you" for every page** (`w-history.png`), which is odd in the showcase. **Fix (S):** a seed author.

## Bugs

1. "Create and write" leaves focus on `body`, so typed text is lost and an empty page is saved (Major 1). Steps: New page → title → Create and write → type → Save.
2. Dialog focus is on Close (Major 2).
3. The lock survives navigation (Major 3). Steps: Tom opens Edit, goes back; Inès opens the page and sees "Tom Walker is editing this page since …" for 15 minutes.
4. "wifi" finds nothing (Blocker 1).
5. The history diff loses page-link text (Minor 2).

## Migration in / out

- **In:** a Notion "Markdown & CSV" zip (nested zips too), Obsidian and `.md` are good. Missing: **Confluence** (Blocker 2), **Google Docs / Word (.docx)**, **Notion databases** (said honestly), and a **preview/dry run** (how many pages, which links broke) before 500 pages land in a new space.
- **Out:** Markdown or HTML per page, a zip per space with files and links intact. This is good. Missing: one-click everything (Major 9).

## UX notes

- First minute (empty, editor): a clear empty state with a one-click example handbook (`w-empty-editor.png`). Reader: "Nothing written yet. The editors of your company will write the first pages here." This is honest and good.
- Reading is excellent: a serif at the right size, note boxes, "Linked from", review banners (`w-page.png`, dark `w-page-dark.png` is clean).
- Loads take 0.6-1.1 s to network-idle.
- French is natural ("Arrêter de modifier", "Toujours juste", "La mettre à jour"). "Rédacteur" as the role label is fine.
- Hugo, a reader, is subscribed ("Watching") to a page in the seed. Check that nobody is auto-subscribed except authors and commenters (the README says they are).

## Trust for the buyer

Strong: every save is a version with restore, drafts are never lost, the trash has Undo, "Former member" on erasure, and a strict CSP. Weak: editing rights (Blocker 3), no audit of who **viewed** or **deleted** a space (a deleted space should show in the trash with who did it), and no whole-wiki export.

## Fix plan (ordered)

1. Search: hyphens and punctuation, an OR fallback, body trigram, plus a test for "wifi". **S/M**
2. Focus: the body after "Create and write", fields in dialogs; "Nothing to save". **S**
3. The lock: release on pagehide, heartbeat, a short timeout, and "continue your draft" on the page. **S**
4. Per-space edit rights (groups/people). **M**
5. Confluence HTML import, then .docx and Google Docs HTML. **M**
6. A "/" menu and @mentions (page and comments) with a bell item. **M**
7. Read and acknowledged, with a CSV of who read which version. **M**
8. Phone editor toolbar; a label on Watch. **S**
9. Page-level restrictions. **M**
10. Export everything; pin pages to home; TOC at 1200 px; links in the diff; seed author. **S**

# Wiki — write down how the company works, and find it again

A company handbook and knowledge base for a Chest: spaces ("Handbook",
"Sales", "Tech") holding trees of pages, a clean editor, every save kept,
and a search that finds "congés" when you type "conges". It replaces the
docs part of **Notion**, **Confluence** and **Google Sites** used as an
intranet — on the company's own server, for no fee per seat.

## What it does

- **Spaces and a tree of pages**, as deep as needed. Editors arrange pages
  by dragging them in the sidebar (before, after, inside a page, onto a
  space), or with **Move** (works on a phone and with a keyboard).
- **Read mode by default.** A page is set for reading: a serif at a
  comfortable size, a table of contents on wide screens, "In this section"
  (its subpages) and "Linked from" (pages that link to it). **Print** gives
  a clean page.
- **One editor** (Tiptap): headings, bold/italic/strike/code, links,
  **links to other pages** (picked by title; they show the page's current
  title, so they survive renames and moves), bulleted, numbered and
  check lists, quotes, **note boxes** (note, tip, warning), tables, images
  and files (to the Chest's file storage, by button, paste or drop),
  dividers. **Nothing pasted disappears silently**: a picture pasted or
  dropped from the web (a Google Doc, a web page, an email) cannot be
  kept — the wiki shows its own files only and has no network to fetch
  it — so it becomes a warning note in its place, *Picture from the web
  not kept ("schema"): download it, then drop it here*, with a link to
  the picture, and a toast says how many; a picture carried inside the
  clipboard is uploaded like a pasted file; a picture of this wiki copied
  from another page stays. If a save still leaves one out, it says
  *Saved — but 1 picture from the web was not kept*, never a bare
  "Saved.". Markdown shortcuts work as you type (`# `, `- `, `1. `, `> `,
  `[ ] `…), and **"/"** at the start of a line lists every block by name
  ("/tab" → Table; arrows, Enter). On a phone the toolbar wraps on two
  rows: every tool in sight. **Create and write** puts the cursor in the
  new page; **Save** with nothing typed says "Nothing to save yet" instead
  of saving an empty page.
- **Drafts that are never lost.** Every change is kept as the member's
  draft within two seconds; a closed tab or a lost connection loses
  nothing — the draft comes back when they open the editor again, and the
  home page lists unsaved changes. **Save** makes it the page's new version.
- **One editor at a time** (the Chest has no live channel for co-editing):
  opening the editor takes the page's lock. Others see "Camille Martin is
  editing this page since 10:02" and can read meanwhile. **Leaving the
  editor any way at all** — closing the tab, the back button, a link —
  gives the lock back at once (a beacon, with the last words as a draft);
  an open editor says so every 30 seconds, and a lock not heard of for
  **two minutes** (a crash, a laptop shut) is free again. After **15
  minutes without typing**, another editor may **take over**; the first
  one's draft stays theirs, and if they save later the other version stays
  in the history (they are told). On the page, its owner sees "You have
  unsaved changes" — **Continue editing** or **Discard them** (with Undo).
- **History**: every save is a version — who, when; the changes shown in
  words (taken out struck through, put in underlined, unchanged paragraphs
  folded); the page "as it was"; **Restore** (itself a new version, so it
  can be undone).
- **Search** over titles and text, in French and English alike: accents
  and case aside, by the start of words; **"wifi", "wi-fi" and "Wi-Fi" are
  one word** (and "email"/"e-mail", "aujourdhui"/"aujourd'hui"); pages
  holding every word come first, and when fewer than three do, pages
  holding some follow ("wifi password": the Wi-Fi page, then "Password
  manager"); **a word with a typo** is matched to the nearest word the wiki
  holds ("pasword", "teletravial"); results show the passage with the
  matched words highlighted (*Wi-Fi* marked whole). **By the stem of a
  word, in French and English** (`migrations/0005`): *rembourser*,
  *remboursé* and *remboursement* find each other, *reimbursed* finds
  *reimburse*. **A relevance floor**: pages holding the words as typed
  (or by their stem) come first, then those with them in their title,
  then those found only through a word that means the same (*horaires*
  puts the *Règlement intérieur* first, the firmware page's "opening
  hours" after); when some pages hold every word, the others follow only
  if they hold one as typed (*clé bureau* is not every page saying
  "office"); a page found only through a typo's neighbour is left out
  when better ones exist (*nouvel arrivant* no longer lists the expense
  page for its "arrives"). **The little words of French and English**
  ("de", "la", "the", "of"…) never count as words of the query: "note de
  frais" is not matched on "de" (it found 17 pages; now 2, the *Expense
  policy* first). **Words that mean the same**, one list per wiki: "note
  de frais", "remboursement" and "frais" find *Expense policy*;
  "vacances" finds the holidays; "tt" finds *Charte télétravail*. The wiki
  starts with 30 French/English office groups (congés/holidays,
  télétravail/remote, mot de passe/password…); editors change them from
  the search page (*Words that mean the same*: one line per group,
  separated by commas; a line deleted comes back with *Undo*).
- **Pinned pages**: editors pin a few pages ("Holidays", "Who to ask") under
  the home page's search box, for everyone who reads them.
- **Recently updated** on the home page, with the one question people come
  with: "What do you want to know?"
- **Import** a **Confluence space** exported as HTML — **each page keeps
  the date it was last changed in Confluence** (its first version is
  dated so, "Updated 3 months ago"), and imported pages stay out of the
  home page's *Recently updated* until someone saves them here (the zip as it comes:
  the space's page tree from `index.html`, or each page's breadcrumbs;
  information/tip/note/warning macros and panels become note boxes, code
  macros code blocks, task lists checklists, links between pages — by
  file or by Confluence's page id — links between the new pages, images
  and attachments files of the pages, attachments only listed linked
  under "Attachments"), a **Notion export** ("Markdown & CSV" zip, as it
  comes — even the zip inside the zip), a **Google Docs** document
  downloaded as a web page (zip: bold and italics from its styles, images,
  links without Google's redirect), **Word** documents (`.docx`: title,
  headings — whatever Word's language —, nested lists, tables, pictures,
  links), an Obsidian vault, or any `.md` or `.html` files: folders become
  the tree, links between files become links between pages, images and
  attached files go to the Chest. What cannot come is said (Notion
  databases as CSV, images from the web, a file that cannot be read).
- **Export**: a page as Markdown or as a self-contained web page (images
  inside); a page with its subpages, a whole space, or **everything**
  ("Download everything" on the home page: a folder per space) as a zip of
  Markdown files in folders with their images and files, links between
  them intact.
- **Spaces kept to some groups** (HR, management): only their members, the
  space's creator and the Chest's administrators see it — its pages, its
  search results, its titles in links.
- **Who edits a space**: every editor (the default), or **only some groups
  and people** (Sales writes Sales; everyone else reads it) — set in the
  space's settings. Its creator and the Chest's administrators always
  edit; whoever narrows the list stays on it; a reader stays a reader. An
  editor who only reads a space sees why on its pages.
- **Trash**: deleting a page (with its subpages) offers *Undo*; the trash
  restores it later, or deletes it for good with its history and files.
- **Comments** at the bottom of every page: plain text, web addresses
  become links. Whoever reads a page may comment (readers too); each
  person edits and removes their own, the page's editors may remove any
  (with *Undo*). The page's author, earlier commenters and watchers get one
  item in the Chest's bell per page ("Hugo commented on “Expenses”"),
  replaced by the next comment, never doubled. **A deleted comment takes
  its words out of every bell at once** (Undo puts them back; an edited
  comment's item shows its new words).
- **Conversations**: *Reply* under a comment (one level: a reply to a
  reply joins the same conversation; everyone in it is told); **Resolve**
  (its author or the page's editors) folds it to one line — its first
  words, "Resolved by Inès Moreau · 2 comments", *Show*, *Reopen*; a new
  reply opens it again. **A comment on a passage**: select words in the
  page, *Comment on this passage*; the comment quotes them, and a click
  on the quote selects them in the page again (or says the page no longer
  holds them).
- **@mentions in comments**: typing "@" and the start of a name offers the
  people who read the page; whoever is picked is told in the bell ("Hugo
  mentioned you on “Wi-Fi”"), on their own, only if they may read it.
- **Watch** a page (one switch next to *Edit*, "Watching" in words on a
  phone too): be told in the bell when someone else saves it or comments
  on it — one item per page, replaced. Nobody watches a page unless they
  chose to.
- **Read and acknowledged** (policies, the company's rules): *More → Ask
  readers to confirm*, everyone who reads the space or **any group of the
  Chest** (with the `groups` proposal: Sales, the warehouse… even when the
  wiki is open to all). Each is told in the bell **and by email** (the
  `mail` proposal: one letter each, in their language, with the link), finds it under "Pages to read" on the home
  page, and sees "Please read this page, then confirm" with **I have read
  it**. The editors see *Who has read it*: how many confirmed the current
  version, each person (not yet, an older version, done) with the date,
  and **download it as a table** (CSV, for the company's records). After a
  change, *Ask again for the current version*; *Stop asking* keeps what
  was confirmed. **Reminders**: *Remind those who have not confirmed*
  (bell and email, once a day at most per person), and by itself a week
  after the ask (the `reviews` schedule, twice at most).
- **Templates**: an editor marks a page "Use as a template"; *New page*
  then offers, in the same dialog, *Blank page* (chosen), the space's
  templates and three ready-made ones in the editor's language —
  *Meeting notes*, *How-to*, *Decision record*. The template's content is
  copied once; changing it later changes only pages made after.
- **Review reminders** (optional, quiet): *More → Review reminder*, every
  3, 6 or 12 months. Whoever sets it is reminded, once, in the bell **and
  by email** on the weekday morning it comes due (the `reviews` schedule); the page then asks
  its editors "Is this page still correct?" — *Still correct* settles it
  for months, *Update it* opens the editor. The home page lists "Pages to
  check". Saving the page does not count as a check.
- **My pages**: everyone — readers too — has a private space of their
  own, made with its first page (*New private page* on the home page and
  in the sidebar): meeting notes, drafts, a list. **Only its owner sees
  it**: not the Chest's administrators, not the editors; its pages are in
  their search only; nobody is told about them; it has no settings and
  asks nobody to confirm. To share a page, an editor **moves** it to a
  space; a page of a shared space never moves into someone's "My pages".
  A reader writes there and nowhere else. It goes when its owner leaves
  the company (or is erased); losing access keeps it for their return.
- **An empty wiki** offers, in one click, an example handbook in the
  editor's language (five short linked pages to edit or delete), or
  **Write the first page** (its "Handbook" space is made on the way: no
  word "space" to understand first). A **reader** of an empty wiki is
  told whom to ask (*To add the first pages, ask Inès Moreau, Tom Walker
  or Camille Martin*), and may start their own *My pages* meanwhile; an
  empty space tells a reader who writes in it.

## Looks

The wiki wears its own look — **Library**: warm paper, a reading serif,
one deep green (`DESIGN.md`) — unless the company chooses otherwise in its
Chest: **any theme of the catalogue** (the 17 identities of the store's
tools, "Chest", "High contrast") or **its own brand** (its colours, fonts,
corners and logo), for all its tools or for the wiki alone. Every feature
is the same in every look, and every text stays readable (the kit's
contract, WCAG AA, light and dark); in brand mode the company's logo
stands where the book mark does. The look is resolved on the server
(`lib/theme.ts`, `chest.theme()` of the SDK — Proposal (studio)): no
script, no flash of the wrong look. The shared pieces — toasts with a
truthful Undo, dialogs, the shell with its labelled tabs, menus, the file
picker… — are the store's UI kit (`@argentic/chest-ui`), so the wiki
behaves like the other tools.
Pages are read in the look's reading face (the kit's `--font-read`:
Library's Newsreader; the body face in a theme whose display face is made
for headings only, such as Trail's condensed Barlow or Confetti's
Fredoka); titles and headings stay in its display face.

## Roles

| Role | Can |
|---|---|
| `editor` | Everything, in the spaces they may edit (all, unless a space names its editors): write and arrange pages, create spaces and set who reads and who edits them, import, restore versions, empty the trash, mark templates, pin pages, set review reminders, ask readers to confirm and see who did, delete any comment of their spaces |
| `reader` | Read, search, print and download the spaces they see; comment (and edit or delete their own comments), mention people; watch pages; confirm they read a page they are asked to; write in their own *My pages* |

The Chest's owner, admins and the tool's builders arrive as editors. A
space kept to groups is seen only by the members of those groups, its
creator and the Chest's admins, whatever their role (a page they cannot
see answers "not found" — and so do its comments, by page or by
comment id, including a page moved to a space the member cannot read).
Nobody is told in the bell about a page they cannot read now. Rules are
enforced on the server in `lib/access.ts`, `lib/comments.ts` and
`lib/tell.ts` (tested in `test/access.test.ts`, `test/comments.test.ts`,
`test/templates-reviews.test.ts`).

## First minute

- **What does a new person see first?** The question "What do you want to
  know?" with one big search box; below, the pages changed lately and the
  spaces. On a phone, the same, with the sections as labelled tabs under
  the header — Home, Pages (the whole tree), Search, Trash.
- **What is the first thing they do?** Type a word ("holidays", "wifi") and
  press Enter: the matching passages, highlighted; one click opens the page.
  An editor on an empty wiki clicks "Add an example handbook" and is reading
  (and editing) a real page within seconds.
- **How many clicks for the main jobs?** Find an answer: type + Enter + 1
  (or one click on a pinned page). Change a page: **Edit** (1), type,
  **Save** (1). Write a new page: "+" next to a space or a page (1), a
  title (typed at once: the field has the focus), Enter, write (the cursor
  is already in the page), **Save**. Confirm a policy: **I have read it**
  (1).
- **What happens after a mistake?** A deleted page comes back with *Undo*
  (or from the trash). A bad edit is undone from the history with
  **Restore**. Discarded changes come back with *Undo*. A closed tab keeps
  the draft and frees the page for the others at once. A deleted comment comes back with *Undo* (for an hour). Only "Delete for good" in the trash cannot be undone, and it
  asks once more, in the page. A dialog with something typed in it asks
  before closing (Escape, a click beside it).

## Routes

| Route | What |
|---|---|
| `/` | Public host: says the wiki lives in the Chest (language switch) |
| `/chest` | Home: search, drafts, recently updated, spaces |
| `/chest/pages` | Pages: every space and its tree (the sidebar of wide screens, on every screen) |
| `/chest/spaces/<id>` | A space: its pages as a table of contents |
| `/chest/spaces/<id>/settings` | Name, description, colour, who reads it, who edits it, delete (its editors) |
| `/chest/spaces/<id>/export` | The space as a zip of Markdown |
| `/chest/pages/<id>` | Read a page |
| `/chest/pages/<id>/edit` | Edit it (takes the lock once on screen) |
| `/chest/pages/<id>/history?v=<n>[&view=page]` | Its versions, changes, restore |
| `/chest/pages/<id>/export?format=md\|html\|zip` | Download |
| `/chest/pages/<id>/reads` | Who has read it (its editors): ask again, stop asking |
| `/chest/pages/<id>/reads/csv` | The same, as a table |
| `/chest/export` | Every space the member sees, one zip |
| `/chest/search?q=` | Search |
| `/chest/import` | Import Confluence, Notion, Google Docs, Word, Markdown, HTML |
| `/chest/trash` | Deleted pages |
| `/chest/files/<id>` | Opens an image or file of a page (a fresh 15-minute link from the Chest) |
| `/chest/api/pages/<id>/upload` | POST authorises an upload, PUT records it |
| `/chest/api/import` | POST the import's files (form) |
| `/chest/api/pages/<id>/leave` | POST (a beacon, same origin only): the editor closed; gives the lock back, keeps the draft |
| `/chest-events` | The members' lifecycle, signed by the Chest |
| `/chest-jobs/reviews` | The `reviews` schedule (Proposal (studio)), signed by the Chest: weekdays 07:40 |

## On a Chest

- **Capabilities**: `database`, `files` (images and attachments, import),
  `members` (names of authors and editors; the groups a space is kept to;
  who may still read a page before telling them), `notifications` (bell
  items: comments, saves of watched pages, reviews due; keyed
  `comments:<page>`, `saved:<page>`, `review:<page>`, withdrawn when the
  page goes to the trash or moves where the person cannot read it; also
  `read:<page>`, `mention:<page>`). No network. Schedule (proposal, `chest.proposals.json`): `reviews`,
  `40 7 * * 1-5`.
- **Database**: `migrations/0003_search_editors_reads.sql` indexes
  hyphenated words joined too (`wiki_compounds`), keeps the wiki's words
  for typos (`search_words`, filled by a trigger), adds the lock's
  heartbeat (`seen_at`), who edits a space (`spaces.editing`,
  `space_editors`), read confirmations (`pages.read_*`, `page_reads`) and
  pins (`pages.pinned_at`).
  `migrations/0005_stems.sql` adds `wiki_en` / `wiki_fr` (`unaccent`
  then the English or French stemmer; copied from News's `news_en` /
  `news_fr`) and a generated `stems` vector on pages, and teaches the
  starting synonyms "nouvel arrivant". `migrations/0006_private_pages.sql`
  allows a space's `visibility` to be `private` ("My pages", one per
  member).
  `migrations/0002_comments_watching_templates_reviews.sql`
  adds comments, watchers, the template flag and review reminders.
  `migrations/0001_wiki.sql` creates the `unaccent` and
  `pg_trgm` extensions (both *trusted*: the database's owner may create
  them — PostgreSQL 13+) and a text search configuration `wiki` (`simple`
  + `unaccent`), so that search works the same in every language.
- **Lifecycle**: a member who **leaves or loses access** frees the pages
  they were editing; their unsaved drafts are deleted (no one else can
  read them), they stop watching pages and are no longer named among a
  space's editors. Their read confirmations stay (the company's record). What they wrote stays, signed
  "(former member)" — pages and comments. Review reminders they owned stay
  and go to whoever last saved each page (if they still write there). An
  **erasure** also replaces their id with `erased` as author of pages,
  versions, files, spaces and comments ("Former member"), deletes their
  read confirmations, then is acknowledged. The
  *text* of pages is the company's: a name written in a page is not
  searched for and removed.
- **Bounds**: 5,000 pages, 200 spaces, 12 levels deep, 200 files of 25 MiB
  per page, a page's content 400,000 characters (2 MB of JSON); 12 pinned pages, 100 groups
  and people naming a space's editors; imports up to 60 MB and 500 pages
  (an HTML page up to 8 MiB), zip entries bounded (5,000 entries, 32 MiB each,
  256 MiB in all, sizes checked before inflating, paths cleaned).
- **Security**: content is ProseMirror JSON checked on the server against
  the schema of `lib/doc.ts` (unknown nodes, marks and attributes dropped;
  links http, https, mailto or the wiki's own pages and files; images only
  from the wiki's files) and turned into HTML by the server
  (`lib/render.ts`), every word escaped. Imported Markdown never keeps raw
  HTML. A strict nonce Content-Security-Policy on every page.

## Needs from the SDK

Uses the working copy's **schedules** proposal (`reviews`, weekday
mornings) for review reminders; on a Chest without it, reminders stay set
and due pages still ask their editors "Still correct?" and show on the home
page — only the bell item is missing. Bell items need `notifications`
(a Chest that refuses them loses nothing else). What would make it better
(details in the studio's SDK report):

- **Knowing whether a notification was delivered** per member (today
  `notify` is fire-and-forget in the tool): a review reminder is marked
  "told" even if the Chest was briefly unreachable.
- **Group changes as events**: with the `groups` proposal the wiki
  receives `group.changed`, `group.removed` and `member.updated`
  (`groups`): a page to confirm leaves the bell of whoever it no longer
  concerns. Watchers who lose a space through a group change still keep
  old bell items until the page changes.

- **The team host's address** (e.g. `CHEST_ORIGIN`, or `chest.origin()`):
  exports write links back to the wiki; today the address is taken from the
  forwarded host (`lib/origin.ts`).
- **A live channel** (server-sent events or a presence API) — for real
  co-editing some day; today a lock and drafts stand in for it.
- **Localized manifest titles**: `chest.json` has one `title`.
- `groups` — **Proposal (studio)**, declared (`"groups": "read"`, as
  News): `members.groups.all()` gives every group of the Chest, for "who
  reads", "who edits" and "ask to confirm" (lib/groups.ts; without it,
  the groups that give the wiki, as before).
- `mail` — **Proposal (studio)**, declared (`"mail": {"send": true}`, as
  News, Tasks, Polls and Goals): read requests, reminders and review
  reminders by email (lib/mail.ts). On a Chest without mail, nothing is
  sent and nothing fails: the bell has told them. "Ask readers to confirm"
  and "Remind those who have not confirmed" ask the Chest first
  (`mail.available()`, studio.16; `mailNow`) and say "in the bell" only
  when it would not send now (no mail, not connected, paused, the day's
  emails used). Keys carry the member (`read:<page>:<version>:<at>:<member>`).
- **`access.granted` / `member.added` events**: someone who gets the wiki
  after a page asked for read confirmations is asked only when it is asked
  again.
- **The Chest's front relaying `navigator.sendBeacon`**: the editor gives
  its lock back with a same-origin `POST` sent while the tab closes
  (`/chest/api/pages/<id>/leave`, `text/plain`); the front must relay it
  with the member's assertion like any other request (untested on a real
  Chest). Without it, the two-minute lease still frees the page.

## Develop

```sh
npm ci
npm test                                   # PGlite (with pg_trgm and unaccent)
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test
npm run build
node seed/build.ts                         # after editing seed/pages/*.md → seed/sample.sql
# from the studio's root:
node lab/chest-dev/dev.mjs tools/private/wiki --prod --reset --port 4300
node lab/chest-dev/flows/wiki.mjs 4300
node lab/chest-dev/screens.mjs tools/private/wiki --port 4300
```

## What it does not do (yet)

- **Live co-editing** and cursors (needs a realtime channel from the Chest);
  one editor at a time instead.
- **Restrictions per page** ("only these people" on one page and its
  subpages): access is per space — reading (everyone or some groups) and
  editing (every editor or some groups and people). A salary grid goes in
  a space kept to the office group; "only me" is *My pages*. Planned
  next, reusing the space rules of `lib/access.ts`.
- **My pages**: one per person (no sub-spaces), not shared with a few
  people (a page is private or in a space), not renamed; a reader cannot
  share a page of theirs (they write nowhere else: an editor copies it);
  a pasted picture from the web is a note, not the picture (no network).
- **@mentions inside a page's text** (they work in comments). A comment
  on a passage quotes it but is not pinned to it: after the page is
  edited, a quote the page no longer holds is only a quote (clicking it
  says so); no highlight in the page's text until clicked.
- **Watching a whole space**; watchers are not told of moves or deletes.
- **Embeds** (a video, a spreadsheet, a PDF shown inside a page): the
  pages show the wiki's own files only; a link opens the rest.
- **Search across languages** beyond the synonyms list and the French and
  English stems: a French word does not find its English translation
  unless the synonyms list says so ("remboursé" finds the French
  expense page, not the English *Expense policy*). Stemming follows
  PostgreSQL's Snowball stemmers (a stem shared by unrelated words can
  match both).
- **Emails** cannot be turned off per person (they are the company's
  requests: read and confirm, check a page); comments and mentions stay
  in the bell only.
- **Imports**: Notion databases (CSV), Confluence's page history, comments
  and permissions (the pages as they are now, their images and files
  come), Word's comments, tracked changes (the accepted text comes),
  headers, footers, footnotes and text boxes, Google Docs' nested list
  levels (they come flat), images that are not PNG, JPEG, GIF or WebP.
  No preview before an import: it lands in a new space (or the one
  chosen) and can be deleted from the trash.
- **"Everything" exports** carry up to the export's file budget of images
  and files; beyond it, pages link to the files on the wiki.
- A template's images stay the template's files: deleting the template for
  good breaks them in pages made from it.
- Changing a space's groups does not withdraw bell items already sent
  about its pages (moving a page or putting it in the trash does).
- Read confirmations are asked of the people the Chest lists as having the
  wiki at that moment; someone who gets it later is asked when the page is
  asked again.
- **Public pages** (a public help centre): the wiki is private only.
- **Auto-emptying the trash**: pages stay there until deleted for good.
- **An audit of who viewed a page or deleted a space**.
- The search words of a page name the pages it links to as they were
  called when it was last saved (a rename shows at once when reading, and
  in search after the next save of the linking page).

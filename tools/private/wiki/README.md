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
  dividers. Markdown shortcuts work as you type (`# `, `- `, `1. `, `> `,
  `[ ] `…).
- **Drafts that are never lost.** Every change is kept as the member's
  draft within two seconds; a closed tab or a lost connection loses
  nothing — the draft comes back when they open the editor again, and the
  home page lists unsaved changes. **Save** makes it the page's new version.
- **One editor at a time** (the Chest has no live channel for co-editing):
  opening the editor takes the page's lock. Others see "Camille Martin is
  editing this page since 10:02" and can read meanwhile. After **15 minutes
  without typing**, another editor may **take over**; the first one's draft
  stays theirs, and if they save later the other version stays in the
  history (they are told).
- **History**: every save is a version — who, when; the changes shown in
  words (taken out struck through, put in underlined, unchanged paragraphs
  folded); the page "as it was"; **Restore** (itself a new version, so it
  can be undone).
- **Search** over titles and text, in French and English alike: accents
  and case aside, by the start of words, a title with a typo still found;
  results show the passage with the matched words highlighted.
- **Recently updated** on the home page, with the one question people come
  with: "What do you want to know?"
- **Import** a **Notion export** ("Markdown & CSV" zip, as it comes — even
  the zip inside the zip), an Obsidian vault, or any `.md` files: folders
  become the tree, Notion's ids leave the titles, links between files
  become links between pages, images and attached files go to the Chest.
  What cannot come is said (Notion databases as CSV, images from the web).
- **Export**: a page as Markdown or as a self-contained web page (images
  inside); a page with its subpages, or a whole space, as a zip of Markdown
  files in folders with their images and files, links between them intact.
- **Spaces kept to some groups** (HR, management): only their members, the
  space's creator and the Chest's administrators see it — its pages, its
  search results, its titles in links.
- **Trash**: deleting a page (with its subpages) offers *Undo*; the trash
  restores it later, or deletes it for good with its history and files.
- **Comments** at the bottom of every page: plain text, web addresses
  become links. Whoever reads a page may comment (readers too); each
  person edits and removes their own, the page's editors may remove any
  (with *Undo*). The page's author, earlier commenters and watchers get one
  item in the Chest's bell per page ("Hugo commented on “Expenses”"),
  replaced by the next comment, never doubled.
- **Watch** a page (one switch next to *Edit*): be told in the bell when
  someone else saves it or comments on it — one item per page, replaced.
- **Templates**: an editor marks a page "Use as a template"; *New page*
  then offers, in the same dialog, *Blank page* (chosen), the space's
  templates and three ready-made ones in the editor's language —
  *Meeting notes*, *How-to*, *Decision record*. The template's content is
  copied once; changing it later changes only pages made after.
- **Review reminders** (optional, quiet): *More → Review reminder*, every
  3, 6 or 12 months. Whoever sets it is reminded, once, in the bell on the
  weekday morning it comes due (the `reviews` schedule); the page then asks
  its editors "Is this page still correct?" — *Still correct* settles it
  for months, *Update it* opens the editor. The home page lists "Pages to
  check". Saving the page does not count as a check.
- **An empty wiki** offers, in one click, an example handbook in the
  editor's language (five short linked pages to edit or delete).

## Roles

| Role | Can |
|---|---|
| `editor` | Everything: write and arrange pages, create spaces and set who reads them, import, restore versions, empty the trash, mark templates, set review reminders, remove any comment of their spaces |
| `reader` | Read, search, print and download the spaces they see; comment (and edit or remove their own comments); watch pages |

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
  spaces. On a phone, the same, with the page tree behind "Pages".
- **What is the first thing they do?** Type a word ("holidays", "wifi") and
  press Enter: the matching passages, highlighted; one click opens the page.
  An editor on an empty wiki clicks "Add an example handbook" and is reading
  (and editing) a real page within seconds.
- **How many clicks for the main jobs?** Find an answer: type + Enter + 1.
  Change a page: **Edit** (1), type, **Save** (1). Write a new page: "+" next
  to a space or a page (1), a title (Enter), write, **Save**.
- **What happens after a mistake?** A deleted page comes back with *Undo*
  (or from the trash). A bad edit is undone from the history with
  **Restore**. Discarded changes come back with *Undo*. A closed tab keeps
  the draft. A removed comment comes back with *Undo* (for an hour). Only "Delete for good" in the trash cannot be undone, and it
  asks once more.

## Routes

| Route | What |
|---|---|
| `/` | Public host: says the wiki lives in the Chest (language switch) |
| `/chest` | Home: search, drafts, recently updated, spaces |
| `/chest/spaces/<id>` | A space: its pages as a table of contents |
| `/chest/spaces/<id>/settings` | Name, description, colour, who reads it, delete (editors) |
| `/chest/spaces/<id>/export` | The space as a zip of Markdown |
| `/chest/pages/<id>` | Read a page |
| `/chest/pages/<id>/edit` | Edit it (takes the lock once on screen) |
| `/chest/pages/<id>/history?v=<n>[&view=page]` | Its versions, changes, restore |
| `/chest/pages/<id>/export?format=md\|html\|zip` | Download |
| `/chest/search?q=` | Search |
| `/chest/import` | Import Markdown / Notion |
| `/chest/trash` | Deleted pages |
| `/chest/files/<id>` | Opens an image or file of a page (a fresh 15-minute link from the Chest) |
| `/chest/api/pages/<id>/upload` | POST authorises an upload, PUT records it |
| `/chest/api/import` | POST the import's files (form) |
| `/chest-events` | The members' lifecycle, signed by the Chest |
| `/chest-jobs/reviews` | The `reviews` schedule (Proposal (studio)), signed by the Chest: weekdays 07:40 |

## On a Chest

- **Capabilities**: `database`, `files` (images and attachments, import),
  `members` (names of authors and editors; the groups a space is kept to;
  who may still read a page before telling them), `notifications` (bell
  items: comments, saves of watched pages, reviews due; keyed
  `comments:<page>`, `saved:<page>`, `review:<page>`, withdrawn when the
  page goes to the trash or moves where the person cannot read it). No
  network. Schedule (proposal, `chest.proposals.json`): `reviews`,
  `40 7 * * 1-5`.
- **Database**: `migrations/0002_comments_watching_templates_reviews.sql`
  adds comments, watchers, the template flag and review reminders.
  `migrations/0001_wiki.sql` creates the `unaccent` and
  `pg_trgm` extensions (both *trusted*: the database's owner may create
  them — PostgreSQL 13+) and a text search configuration `wiki` (`simple`
  + `unaccent`), so that search works the same in every language.
- **Lifecycle**: a member who **leaves or loses access** frees the pages
  they were editing; their unsaved drafts are deleted (no one else can
  read them), and they stop watching pages. What they wrote stays, signed
  "(former member)" — pages and comments. Review reminders they owned stay
  and go to whoever last saved each page (if they still write there). An
  **erasure** also replaces their id with `erased` as author of pages,
  versions, files, spaces and comments ("Former member"), then is
  acknowledged. The
  *text* of pages is the company's: a name written in a page is not
  searched for and removed.
- **Bounds**: 5,000 pages, 200 spaces, 12 levels deep, 200 files of 25 MiB
  per page, a page's content 400,000 characters (2 MB of JSON); imports up
  to 60 MB and 500 pages, zip entries bounded (5,000 entries, 32 MiB each,
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
- **Group changes as events** (`member.updated` with `groups`): watchers
  who lose a space through a group change keep old bell items until the
  page changes (a move or the trash withdraws them).

- **The team host's address** (e.g. `CHEST_ORIGIN`, or `chest.origin()`):
  exports write links back to the wiki; today the address is taken from the
  forwarded host (`lib/origin.ts`).
- **A live channel** (server-sent events or a presence API) — for real
  co-editing some day; today a lock and drafts stand in for it.
- **Localized manifest titles**: `chest.json` has one `title`.

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
- **Mentions** (`@name`) in comments, replies in threads, comments on a
  part of the text, resolving a comment.
- **"Read and acknowledged"** for policies.
- **Watching a whole space**; watchers are not told of moves or deletes.
- A template's images stay the template's files: deleting the template for
  good breaks them in pages made from it.
- Changing a space's groups does not withdraw bell items already sent
  about its pages (moving a page or putting it in the trash does).
- **Restrictions per page**: access is per space.
- **Public pages** (a public help centre): the wiki is private only.
- **Confluence (HTML) and Word/HTML imports**: Markdown and Notion only.
- **Auto-emptying the trash**: pages stay there until deleted for good.
- The search words of a page name the pages it links to as they were
  called when it was last saved (a rename shows at once when reading, and
  in search after the next save of the linking page).

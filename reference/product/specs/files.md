# Files

**Specified 22 November 2026 from the direction of 21 November
([The company's office](../01_vision/company-office.md)); decided, to build
next after the release candidate** ([status](../03_roadmap/status.md), row
“Company office”). Paul's open choices are at the end, each with its
default. How the code does it will go into
`03_code/01_chest-by-argentic/docs/architecture.md` once built.

Files is the company's storage: folders and documents that belong to the
Chest, not to an app. It is a **place in the side bar**, a service of the
Chest every app can build on through the SDK, and the one home of every
paper — a scan, a forwarded mail, a receipt an app keeps
([Perseus, the partner](perseus-office.md) files into it).

**This supersedes one sentence of [Tool storage](tool-storage.md)** (“a
company that wants a Chest-wide drive installs a Files tool from the
catalogue”): the drive is now built in. An app's own private files
(`capabilities: ["files"]`) stay as they are, per app; Files is the shared
storage the owner chooses to give apps, folder by folder.

## The rules in short

1. **One rule for access: a folder's access is its own grants plus every
   grant of the folders above it.** A subfolder can be shared more widely
   than its parent (a grant added on `Taxes/2026` for the accountant), never
   more narrowly: there is no way to hide a subfolder from someone who sees
   its parent. Giving one file of a restricted folder to someone is left for
   later (vision, “an open question”).
2. **Private to the owner by default.** A new top-level folder is seen by
   the person who made it and the owner. The owner sees every folder; an
   admin sees only what was shared with them (being admin runs the Chest, it
   does not open the company's papers — the same principle as
   [sealed data](sealed-data.md)).
3. **Before access widens, one sentence with the exact count**: “Claire will
   see 61 documents.” The count is computed by the server, recursively, of
   the documents this share makes newly visible to these people. The same
   sentence shows when a move widens access.
4. **Every open is journaled**: who, which document, how (preview,
   download, an app, Perseus for someone), when. Never the content.
5. **Every check is the server's**, on every request, from the current tree
   and grants: the web page, the SDK, Perseus's engine and the search index
   hold no authority.
6. **Undo, never confirm.** Remove goes to *Recently removed* with an Undo
   toast; only *Delete* there is permanent.

## Users and stories

| Who | Desktop | Phone |
|---|---|---|
| **Owner** | Drags a folder of PDFs from the Mac into *Company*; shares *Accounting* with Claire, *Can edit*, reading “Claire will see 61 documents”; opens *Who has access* on *HR* and reads “Claire opened the October statement yesterday at 18:02”; marks *HR* sensitive; gives the Expenses app the *Receipts* folder; finds “CFE 2025” by a word that is only in the scan | Scans a letter (Add → Camera), it lands in Perseus's To do, then in the folder Perseus proposed; opens a document from search; shares a folder from the share sheet; restores a document removed by mistake from *Recently removed* |
| **Admin** | Creates a top-level folder *Projects* (seen by them and the owner); shares it with the team; cannot see *HR* unless shared; gives an app a folder they can edit | Same as a member |
| **Member** | Sees only the folders shared with them, under *Shared with you*; with *Can edit*, adds, renames, moves and removes inside; with *Can view*, opens and downloads only; reads who has access to what they see | Takes a photo of a receipt into a folder they can edit; searches their documents |
| **Removed member** | Loses everything at once: their sessions end (existing), their grants go, their public links die; what they added stays, “Added by Claire (former member)”; their opens stay in the journal | Same |
| **App** (through the SDK) | Reads and writes only the folders it was given, with the level given, and on a member's request only what that member also sees (choice 6) | — |
| **Agent** (personal token) | Lists, searches and reads what its member sees; writes only with a write token; never shares (a person's decision) | — |

## Screens

Navigation stays as it is: **Files** in the side bar; on a phone, behind the
three-line menu. Apple's Files is the model (list, columns, share sheet,
*Recently removed*), in the Chest's black and white editorial style.

### Desktop

```
Files                                                    [ Add ]
─────────────────────────────────────────────────────────────────────────
Company  🔒         Only you              Accounting / 2026 /
Accounting          Shared · 3            ───────────────────────────────
HR  🔒              Only you              Name               Added   Size
Projects            Shared · 6            October statement  2 Nov   212 kB
Shared with you                           CFE notice         18 Nov  98 kB
Recently removed                          …
                                          ─────────────────── Who has access
                                          You (owner)          Can edit
                                          Claire               Can edit
                                          Expenses (app)       Can view
                                          [ Share ]
                                          Opens
                                          Claire · October statement · yesterday 18:02
```

- Three panes: folders, the folder's documents, the selected document's
  preview with **Who has access** and **Opens** (Opens only for those who
  can edit the folder, and the owner).
- Keyboard: ↑↓ moves, ↵ opens, Space previews (Quick Look), ⌫ removes
  (Undo toast), ⌘K searches everywhere, drag and drop from the computer's
  folders into any folder the member can edit; a document dropped on a
  folder that widens access shows the sentence in that folder, and *File*
  confirms it (before release needs a move preview route: F3).
- Each folder row says **Only you** (FR *Vous seul*) or **Shared · n**
  (FR *Partagé · n*, the number of people and apps), a lock for sensitive.

### Phone

One action per screen, thumbs at the bottom: the folder list; a folder;
a document full screen (pages swiped); **Add** at the bottom (Camera,
Photos, Files of the phone); the **share sheet** from the bottom:

```
Share “Accounting”
Claire Martin                 Can edit ▾
Claire will see 61 documents.
                                          [ Share ]
```

### The five states

| Screen | Empty | Loading | Partial | Error | Normal |
|---|---|---|---|---|---|
| Folder list | Owner: *Company* and *To file* exist from the start ([Company](company-record.md)), so never empty for the owner; a member with nothing shared: no list, one line “Nothing is shared with you yet.” | Skeleton rows of the final layout, faded in (never a spinner; nothing under 300 ms) | Folders shown while counts fill | The last list kept, a line “Files cannot be reached. Retry” | The list |
| Folder | “No documents yet.” and **Add** | Skeleton | First page, *Show more* | Same as above | Documents |
| Document | — | Skeleton of the page | First pages, others filling | “This preview cannot be shown.” and **Download** | Pages |
| Upload | — | The row appears at once with its progress | Some files done, others continuing | A failed file keeps its row: “Not added. Retry” (room full: “The server is full: free space in Settings → Storage.”) | Added |
| Share sheet | — | The count's place keeps its width while computed | — | “The count cannot be computed. Retry” — **Share** stays disabled | The sentence and **Share** |
| Search | “No results for ‘cfe 2024’.” | Skeleton results | Names first, contents as the index answers | Names only, “Contents cannot be searched now.” | Results |
| Recently removed | “Nothing removed.” | Skeleton | — | As folder | Items, days left |

### Lexicon used

Add, Open, Share, Can view / Can edit, Remove, Restore, Delete (only in
*Recently removed*), Undo, Download, Copy (a public link), Turn off (FR
*Désactiver*, a public link), Search, Show more, Retry, Cancel (the share
sheet). *Public link* (FR *Lien public*), *Someone with the link* (FR
*Quelqu’un avec le lien*). Places and labels: *Files*,
*Only you*, *Shared*, *Shared with you*, *Recently removed*
(FR *Récemment retirés*), *Who has access*, *Opens*, *To file*
(FR *À classer*). The approved mockup's **Scan** entry is the **Camera**
choice of Add, so the lexicon stays closed (choice 3). Never *upload*, *bucket*,
*object*, *MiB* on screen.

## How it works

### Storage, on the existing volume model

- Files lives on the **workload volume**, the disk that grows
  ([Isolation](isolation.md), layer 3), in its own accounted directory
  `office/files/` — a project like a tool's, so Settings → Storage shows a
  **Files** row beside each app. No quota and no count: a write is refused
  only when the volume is full (`storage_full`, said in plain words).
  The largest file: 2 GiB (resumable uploads in 8 MiB parts, so a phone on
  a bad network continues where it stopped).
- **Blobs are named at random** (128 bits), each under a key of its own:
  two identical receipts are two blobs, and nothing on the disk, in a
  backup or in the database says they are the same. There is no
  deduplication across documents (decided 22 November 2026, closing R2 of
  the F1 security review: a shared blob told whoever holds a disk or a
  backup which papers are identical, across folders).
- **Metadata** (tree, grants, versions, journal, search index) lives in
  the office's own PostgreSQL database: the node's JSON records cannot
  hold a tree, its grants and a full-text index for years of papers. Its
  cluster is the Chest's own, run by the Chest's account (never the
  workload account, which runs the tools), its files on the Chest's side
  of the workload volume beside the blobs, its socket in a directory of
  the Chest's alone: neither a tool nor whatever escapes a tool's
  container into the workload account can read a name, nor change a
  grant or the tree. It sleeps a minute after Files was last used, keeps
  the room it needs to start again when the volume is full, as a tool's
  database does, and goes through the nightly backup, stopped, with the
  blobs (decided 22 November 2026, closing R1 of the F1 security review).

### Encryption at rest and in backups

- Every blob is encrypted before it touches the disk: XChaCha20-Poly1305
  in 64 KiB chunks, each sealed under a random nonce of its own and bound
  to its index and to whether it is the last (so a large file is read and
  previewed by range, and a chunk sent again after a failure never reuses
  a nonce), a random key per blob, wrapped by the **Files key**.
  Metadata that names things (file names, OCR text) sits in the database,
  whose files sit on the same encrypted-at-rest path once LUKS on the data
  disk is in place ([sealed data](sealed-data.md#disk-encryption-as-a-complementary-layer)).
- The **Files key** is 32 random bytes in `installation/office/files.key`
  (0600), held by the node. It goes into the nightly backup wrapped for the
  **backup identity** (choice 2), so a restored Chest always gives the
  company's papers back; it never goes into the backup in clear.
- The backup takes blobs as they are (already encrypted, unchanged ones not
  sent again, [Backups](backups.md)); a restore gives back the tree, the
  grants, the journal and every blob byte for byte.

### Access model

- **Subjects**: a member, a group, an app. A group share is refused on a
  sensitive folder (an admin manages groups; persons only there).
- **Levels**: *Can view* (open, preview, download, search) and *Can edit*
  (also add, rename, move within what they can edit, remove, restore,
  share with members and groups). The owner can edit everything, always,
  and is listed first in *Who has access*, never removable.
- **Top-level folders** are created by the owner and admins (choice 5);
  members create subfolders where they can edit.
- **The effective access** of a folder is the union of the grants on it and
  on its ancestors. Computed in one query on the tree (a closure table),
  never cached in a page. A move re-parents and so changes access: a move
  that widens it shows the sentence (“3 more people will see 12 documents”)
  in place, and Undo puts it back.
- **Sensitive folders** (a lock): set by the owner only, on any folder, and
  inherited downwards. *Company* is sensitive from the start; the owner
  marks others (*HR*). What changes: no public link, ever; persons only,
  never groups; sharing asks a recent verification ([Confirm it's you](security.md#confirm-its-you-sensitive-actions));
  given to an app only by the owner, with a sentence saying “sensitive”;
  notifications about its documents never show an amount or a name on a
  lock screen (“A document needs your attention”); Perseus answers from it
  only to people who see it (the rule for every folder, stated again).
- **Public link** (off by default, decided 22 November 2026): one file at a
  time, never in a sensitive folder (now, after a move into one, or once its
  folder is marked); made by the owner or a person who can edit the folder,
  after a recent verification ([Confirm it's you](security.md#confirm-its-you-sensitive-actions)),
  never by an app or an assistant's token; revocable (*Turn off*, under
  Undo); expiring, seven days by default and thirty at most; a new link
  replaces the one the file had. It holds only while its maker is in the
  team with *Can edit* there: a member removed or demoted ends their links.
  Each open is journaled as “Someone with the link”, with the opener's
  network. Served from the **documents host** (below) as an attachment,
  never inline, never indexed (`X-Robots-Tag: noindex`, `robots.txt`
  disallows everything, no referrer). The token (256 random bits) is shown
  once and kept as its hash only.
- **The documents host** (decided 22 November 2026): an origin of its own,
  `documents.<the tools' domain>`, under the portal's certificate — never
  the portal's origin nor an app's —, where a browser opens what has no
  session: the links apps sign (`folders.url`, `folders.uploadUrl`) and
  public links. A tool can never be named `documents`.

### The share sentence

`POST /api/files/share/preview` returns, for a folder, subjects and a level:
`{documents, folders, people: [{name}], already: n}` — the documents of the
subtree (recursively, not removed) that each new subject does not already
see. The sheet shows:

| Case | Sentence |
|---|---|
| One person | “Claire will see 61 documents.” |
| Several | “Claire and Léo will see 61 documents.” |
| A group | “Accounting (4 people) will see 61 documents.” |
| An app | “Expenses will see 61 documents.” and, on a member's request, “only those each member can see” |
| Already sees some | “Claire will see 12 more documents.” |
| Edit level from view | “Claire will be able to edit 61 documents.” |
| Empty folder | “Claire will see this folder and what is added to it.” |

The share sends `expect: {documents}`; if the subtree changed meanwhile, the
server answers 409 with the new count, and the sheet updates the sentence
without a dialog (the button stays where it is).

### The journal of opens

One line per open — the ranges a viewer or a download reads of a document
within ten minutes, the same way from the same network, are one open —:
time, document, subject (member, “Expenses for
Claire”, “Perseus for Claire”, “Someone with the link”), how (preview,
download, app read, Perseus read), the client's truncated network. Written
by the node alone, in the office database, **kept one year** (company
papers outlive a 90-day log). Shown in *Opens* of a document and of a
folder (its subtree), to the owner and to those who can edit the folder.
Shares, removals and restores are journaled the same way (*Activity*).

### Search, OCR included

- One field (⌘K, and the search at the top of Files on a phone) across
  names, contents, Company fields, Deadlines, apps and Perseus's
  conversations of the person ([Perseus](perseus-office.md)).
- Contents: the text of PDFs, Office and OpenDocument documents, and the
  **OCR text of scans and images**, in French and English. Indexed in
  PostgreSQL (`tsvector` with the `french` and `english` configurations,
  `unaccent`; `pg_trgm` on names for typos).
- **OCR runs on the server** (choice 4), in the **reader**: a pinned
  container image of the release (Tesseract 5 with `fra` and `eng`,
  Poppler, libheif), run under the workload account with no network, its
  memory and time bounded, one document at a time, fed one blob in and
  giving text, words with their boxes (for Perseus's page regions) and page
  images out. A hostile PDF breaks only that run. Built in F3
  (22 November 2026): the image is pinned by its digest in the release
  (`deploy/chest/reader-image`, the owner builds and publishes it once,
  `deploy/chest/reader/README.md`); the reader's logic is the Chest's own
  executable, mounted read-only; the reader runs as the container's
  nobody, takes 256 MiB at most per document (a larger one keeps its
  name in the search), and its answer is checked and every page image
  drawn again by the Chest before anything is kept. Office and
  OpenDocument text is read later; until the image is pinned, the search
  reads names and plain text only.
- **The filter is in the query**: a search joins the index with the
  person's effective folders; results, counts and snippets never include a
  document they cannot open. A person never learns that a word exists in a
  document they do not see.

### Upload, previews, versions

- **Desktop**: drag and drop files or whole folders (the tree is kept);
  **Add** → Files. **Phone**: Add → Camera (edges found in the browser, a
  corner to adjust, several pages into one document, joined into one PDF by
  the reader), Photos, Files. A share target of the Chest installed on the
  phone's home screen (Web Share Target) lets “Share → Chest” from any app.
- Bytes go from the browser straight to the Chest, with an upload token as
  in [Tool storage](tool-storage.md#uploads-from-the-browser): bound to the
  member, the folder (*Can edit* checked again at the end), the size, single
  use, 15 minutes, resumable.
- **Previews**: rendered by the reader as page images (PDF, Office through
  their text layer later, images, HEIC), 256 and 1,600 px, kept encrypted
  beside the blob; the browser never runs a PDF engine on the Chest's
  origin. Plain text: the first 64 KiB. Other types: an icon and
  **Download**. HTML, SVG and scripts are only downloaded.
- **Versions**: adding a document with the name of an existing one in the
  same folder keeps the old one as a version (Restore), for 30 days.

### Remove, Undo, Recently removed

- **Remove** (⌫, or the row menu) takes the items out at once; the toast
  “Removed 3 documents. Undo” stays as long as every Undo of the portal
  (seven seconds). Removed items keep their
  place in the tree in *Recently removed* for **30 days**, counted in the
  storage, visible to whoever could edit their folder, with **Restore** (to
  where they were, or to the top level if their folder is gone).
- **Delete** (in *Recently removed*, the owner only) is the one permanent
  removal; the blob goes when no version and no other file references it.
  After 30 days the Chest deletes by itself.
- Undo of a share removes the grant; Undo of a move moves back.

## Data model

Office database (`office`), owned by the Chest:

| Table | Columns |
|---|---|
| `folders` | `id` (random 128-bit), `parent_id`, `name`, `sensitive` (own flag; effective = any ancestor), `system` (`company`, `to_file` or null), `created_by`, `created_at`, `removed_at`, `removed_by` |
| `folder_paths` | closure table `(ancestor, descendant, depth)` |
| `files` | `id`, `folder_id`, `name`, `type` (recognised from content), `size`, `blob`, `pages`, `added_by` (member, `app:<name>`, `perseus`), `added_via` (`upload`, `camera`, `mail`, `app`, `perseus`), `created_at`, `removed_at`, `removed_by` |
| `file_versions` | `file_id`, `version`, `blob`, `size`, `added_by`, `created_at` (30 days) |
| `blobs` | `id` (random 128-bit, the id of the upload that wrote it), `size`, `wrapped_key` |
| `grants` | `folder_id`, `subject_kind` (`member`, `group`, `app`), `subject_id`, `level` (`view`, `edit`), `given_by`, `given_at` |
| `public_links` | `file_id`, `token_hash`, `expires_at`, `created_by` |
| `readings` | `blob` (a content: a document's, or a version's), `state` (`read`, `waiting`, `unreadable`), `tries`, `source` (`text`, `ocr`), `pages`, `text`, `words` (boxes per page, for Perseus), `tsv` (French and English, without accents) |
| `pages` | `blob`, `page`, `size` (256, 1600), `image` (a blob of its own, under its own key) |
| `journal` | `t`, `file_id` or `folder_id`, `subject`, `on_behalf_of`, `action`, `ip_prefix` |

## API

Portal routes (the member's session, same origin, CSRF rules of the portal).
Every route answers **404 for a folder or file the person cannot see**,
whether it exists or not.

| Route | Rule |
|---|---|
| `GET /api/files/folders` | top level the person sees, with *Only you* / *Shared · n* |
| `GET /api/files/folders/{id}?after=` | view on the folder |
| `POST /api/files/folders {parent?, name}` | top level: owner, admin; else edit on parent |
| `PATCH /api/files/folders/{id} {name?}` | edit |
| `PATCH /api/files/folders/{id} {sensitive}` | owner, recent verification |
| `GET /api/files/documents/{id}`, `GET /api/files/documents/{id}/pages/{n}?size=256\|1600`, `GET /api/files/documents/{id}/content` | view; content and pages are journaled opens |
| `POST /api/files/join {folder, name, files}` | edit on the folder; photos of that folder only; the photos go to *Recently removed* |
| `POST /api/files/upload {folder, name, size, type}` → token; `GET /api/files/upload/state`, `POST /api/files/upload/part` (ranges), the token in the `Chest-Upload-Token` header, never in the path | edit on folder, rechecked at the end; the room taken at the start |
| `POST /api/files/move {items, to, expect?}` | edit on every item's folder and on `to`; 409 with the sentence when access widens and `expect` is absent or stale |
| `POST /api/files/remove {items}`, `POST /api/files/restore {items}` | edit |
| `GET /api/files/removed`, `POST /api/files/delete {items}` | list: edit; delete: owner |
| `GET /api/files/access/{folder}` | view |
| `POST /api/files/share/preview`, `POST /api/files/share {folder, subjects, level, expect}` | edit on folder; app subject: owner or admin who can edit; sensitive: owner, persons only, recent verification |
| `POST /api/files/unshare {folder, subject}` | edit; inherited grants are removed on the folder that holds them |
| `GET /api/files/journal?file=&folder=` | owner, or edit on the folder |
| `GET /api/search?q=` | any member; filtered in the query |
| `POST /api/files/documents/{id}/link {days?}`, `POST /api/files/documents/{id}/link/end` | owner or edit on the folder, recent verification, not sensitive; never a token |

Agents (`/api/v1/files…`): the same routes and rules for the token's
member; writes need a write token; share, unshare, sensitive, public links
and delete are refused to tokens (a person's decision, [Security](security.md#builders-admins-and-agents)).

### For apps: the SDK

Manifest:

```json
{ "capabilities": ["folders"],
  "folders": { "purpose": "Keeps receipts with their expenses", "level": "edit" } }
```

Approval sentence: “Opens the folders of Files you give it, to keep
receipts with their expenses.” Installing gives no folder: after **Get**,
the app's page has **Folders** with **Add** (the share sheet with the
count), and the default proposal “Create the folder *Expenses* for it”.
Tool API (through `CHEST_API`, never a mount) and SDK
(`@argentic/chest-sdk/folders`, **contract 0.7, SDK 0.7.0**: 0.6 was
already published with the store presentation; decided 22 November 2026):

| SDK | Route | Rule |
|---|---|---|
| `folders.list(asker)` | `GET /folders` | the folders given; on a member's request, those the member also sees, at the lower level |
| `folders.files(asker, folderId, {after?})` | `GET /folders/{id}/files?after=` | same; the folder, its folders and a page of its documents — never the path above, who else holds it, nor who added a document |
| `folders.get(asker, fileId)` | `GET /documents/{id}` | same; journaled “Expenses for Claire” |
| `folders.url(asker, fileId, {download?})` | `POST /documents/{id}/url` | same; a link on the documents host, alive 5 minutes, bound to the document, its content then, the app and the member — checked again at each open |
| `folders.put(asker, folderId, name, bytes)` | `PUT /folders/{id}/files?name=` (Content-Length) | level *edit* granted and asked by the version; on a member's request, the member can edit too |
| `folders.uploadUrl(asker, folderId, name, size)` | `POST /folders/{id}/upload-url` | same; a link on the documents host for one document of that size, alive 15 minutes, taken once, from the app's team host only (CORS), checked again when it comes |
| `folders.remove(asker, fileId)` | `POST /documents/{id}/remove` | same as put; goes to *Recently removed* |

`asker` is the first argument of every call, never left out (decided 22
November 2026): the member's request, or `null` for nobody (a schedule, an
event). A request without a ticket is refused by the SDK itself
(`MemberRequired`): forgetting the request never reaches more.

The member is proven by the `Chest-Opener` ticket the team host gives each
member's request to a version that holds `folders` (or `sealed`): a ticket
present but not valid is **401 `member_required`**, never read as no
member; a ticket of a member no longer in the team is **403
`access_removed`**; a version that asks `view` never writes (**403
`capability_not_granted`**), and no grant to an app may exceed what its
version asks. Before the portal serves, every route is 503 `unavailable`.

**On a member's request** (the `Chest-Opener` ticket of
[sealed data](sealed-data.md#who-seals-who-opens) proves who), the app gets
the **intersection** of its grant and the member's access (choice 6).
**Without a member** (a schedule, an event), it gets its grant, and the
share sentence said so (“Expenses will see 61 documents, also when nobody
is using it”). An app never lists the tree, never learns of folders it was
not given, never shares. Events `folders.file.added`, `folders.file.removed`
(`{folder, file: {id, name, type, size}}`, never who did it) through
[events](tool-events.md), to the apps whose grants reach the document's
folder only, delivered as the members' events are.

## Threat model

| Who | Tries | Answer |
|---|---|---|
| **Outsider** | Guesses ids or links; reads a public link's neighbours; floods uploads | Random 128-bit ids, 404 for unseen and absent alike; a public link opens one file; no session, no route; uploads need a session and a token; the portal's flood rules |
| **Outsider** | Steals a disk or a provider snapshot | Blobs encrypted by the Files key, kept apart from the data disk; metadata protected by LUKS once the data disk is encrypted (residual until then, said) |
| **Insider, member** | Opens a folder by id, searches for “salary”, reads counts, moves a document to a folder they see, asks Perseus | Every route checks the current tree; search filtered in the query (no count, no snippet leaks); a move needs edit on both sides; Perseus reads with the member's rights in the node, never in the prompt ([Perseus](perseus-office.md#security)) |
| **Insider, admin** | Adds themselves to a group shared on *HR*; gives an app a folder they cannot see | Sensitive folders take persons only; an admin cannot share what they cannot edit; every grant names who gave it, in *Activity* |
| **Insider, removed member** | Uses an old tab, a token, a public link | Sessions and tokens end with the removal (existing); their grants and links go in the same change |
| **Malicious app** | Asks for a folder id it was not given, walks `..` in names, reads as a member who cannot see, writes floods, hides a script in a file | Ids checked against grants, names are labels never paths, intersection on members' requests, the workload volume bounds writes, files never served inline as HTML or SVG, the reader parses in its own container |
| **Injected document** | A PDF that exploits a parser; a scan that tells Perseus to share a folder | Parsed only in the reader (no network, bounded); Perseus never shares and proposes only what the reviewer can do ([Perseus](perseus-office.md#security)) |

## Tests

**Unit (Go, `go test -race`)**: inheritance (a grant on a parent reaches
every descendant, a child grant adds, nothing restricts); the share count
(recursive, newly visible only, removed excluded, groups expanded, 409 when
stale); every route against a table of subjects × levels × sensitive
(404 for unseen, 403 for seen but not allowed); search filtered in SQL (a
document in an unseen folder never in results, counts or snippets); move
widening; remove, Undo, restore to a gone folder, delete owner-only, 30-day
purge; versions; no blob shared by two documents; no nonce sealing two
contents; the room taken at an upload's start; encryption round trip by range;
public links (owner, not sensitive, expiry, revoked); app intersection
with and without a member ticket; removed member; journal lines for every
open path. **Web (`npm run check`)**: the five states of each screen,
keyboard, optimistic Undo.

**VM proof** (`probe-office-macos.sh --only files`, then `--clean`): two
members and an admin on a real Keycloak; upload a 300 MB file resumed after
a cut; drag a folder tree; scan fixture (a photographed letter) found by a
word only in the image; share with the exact count; Claire opens, the owner
reads the journal; admin cannot see *HR*; an app given one folder reads it
for a member who sees it and gets nothing for one who does not; Remove,
Undo, restore after a restart; the workload volume filled → plain message;
backup and restore on a fresh VM gives the files, the grants and the journal
back; Perseus's reader container killed mid-document leaves nothing broken.

## Pull requests

On the branch `office-2026-11` from the release candidate, one pull
request per step, never merged without Paul:

1. **F1 store**: the office database, tree, grants, blobs and encryption,
   journal, portal and agent routes, unit tests.
2. **F2 screens**: desktop and phone, the five states, drag and drop,
   share sheet with the sentence, *Who has access*, *Opens*, *Recently
   removed* (screens approved by Paul before merge).
3. **F3 reader**: the pinned reader image, OCR, previews, camera to PDF,
   search with ⌘K.
4. **F4 apps**: `folders` capability, contract 0.7, SDK 0.7.0, `fakeChest`,
   `npm run sync:sdk`, the store studio's reference refreshed.
5. **F5 proof**: the VM probe, `docs/architecture.md`, Settings → Storage's
   Files row, status updated.

## Paul's choices

The defaults below are applied unless Paul decides otherwise; they are
numbered as in the list handed to him with the four specs.

- **2. The Files key in the backup**: *default: wrapped for the backup
  identity, so a restore always gives the papers back* — rather than under
  the owner's recovery code like sealed values, which would lose every
  document of a company that lost both the server and its code.
- **3. The lexicon stays closed**: *default: the mockup's Scan is the
  Camera choice of Add*, rather than adding *Scan* (FR *Numériser*) to the
  lexicon.
- **4. OCR on the server**: *default: yes*, Tesseract in the reader image;
  search never sends a document out.
- **5. The owner sees every folder; admins create top-level folders and
  see only what is shared with them; no personal space per member**:
  *default: yes.*
- **6. Apps on a member's request see the intersection**: *default: yes.*

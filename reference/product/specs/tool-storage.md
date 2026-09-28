# Tool storage

**Specified 28 September 2026, approved by Paul; to build** (batch ST in
[status.md](../03_roadmap/status.md)). What exists is described in
`03_code/01_chest-by-argentic/docs/architecture.md` (“Outils serveurs”,
Fichiers); this page states what is added: uploads from the browser, a
storage request in `chest.json`, and a Storage view to administer it.

## What exists (R3, in service)

| | Today |
|---|---|
| Capability | `"capabilities": ["files"]`, sentence “Private files of its own, 1 GiB at most” |
| Access | Server side only, through `CHEST_API` (a broker, never a mount); the instance is the identity |
| SDK 0.1 | `files.put`, `get`, `list` (1,000 per page, by prefix), `delete`, `url` (signed download link, 15 min, team host only, served in a sandbox) |
| Limits | 32 MiB per object, 10,000 objects, 1 GiB per tool |
| Lifecycle | Kept across versions, removed with the tool, in the nightly archive |
| Screen | One “Space” line on the tool's overview: “Files: 3 MB of 1 GiB” |

What is missing: a browser cannot upload without passing the bytes through the
tool's server (256 MiB of memory by default); the quota is fixed; nothing lets
an owner see, find or remove a file; a public page cannot show an uploaded
image.

## Per tool, not Chest-wide

Storage stays **per tool** (per Compartment). Reasons:

1. **Isolation is the product.** A tool's bug or a hostile package reaches its
   own files only; there is no bucket policy to get wrong.
2. **Lifecycle follows the tool.** Remove, archive, export, restore, fork: the
   files go with the database and the variables, under the tool's name.
3. **Accountable usage.** Each quota belongs to one tool, one builder; the owner
   sees who fills the disk.
4. **One simple permission** instead of per-bucket rules.

Sharing between tools goes through links and events, never through a shared
folder. A company that wants a Chest-wide drive installs a Files tool from the
catalogue: it is a tool like the others. What is Chest-wide is the **view**:
the owner sees every tool's storage on one page (below).

## Manifest

```json
{
  "capabilities": ["files"],
  "files": { "quota": "5 GiB", "maxObject": "100 MiB", "publicUploads": true, "publicFiles": true }
}
```

| Key | Default | Bounds | Sentence at approval |
|---|---|---|---|
| (capability `files`) | — | — | “Keeps private files of its own, up to 1 GiB.” (the quota asked replaces 1 GiB) |
| `quota` | 1 GiB | 100 MiB to 100 GiB, and never beyond what the server's disk can give | part of the sentence above |
| `maxObject` | 32 MiB | 1 to 512 MiB | “…, 100 MiB per file” when not the default |
| `publicUploads` | false | — | “Lets visitors of its public part upload files (10 MiB each at most).” |
| `publicFiles` | false | — | “Publishes the files it puts under `public/` on its public address.” |

A later version that asks for a bigger quota or object size, or adds a public
key, needs an owner or admin approval, like any widening. The owner or an
admin can also set the quota by hand in the Storage view (lower or higher than
asked, within the server's disk); the value set wins until changed.

## Uploads from the browser

The bytes go from the browser to the Chest directly, never through the tool's
container. The tool authorises one upload; the Chest enforces it.

```ts
// Server side (a /chest route of the tool): authorise one upload
const up = await files.uploadUrl("invoices/2026/0042.pdf", {
  maxSize: 10 << 20,
  types: ["application/pdf"],
});
// → { url, method: "PUT", expiresIn: 900 }

// Browser side: send the file as it is
await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

// Server side, when the browser says it is done
const info = await files.stat("invoices/2026/0042.pdf"); // {name, type, size, updated, width?, height?} or null
```

| SDK | Chest route (tool API) | Answer |
|---|---|---|
| `files.uploadUrl(name, {maxSize?, types?, expiresIn?, public?})` | `POST /files/upload-url` | `{url, method, expiresIn}` |
| `files.stat(name)` | `GET /files/{name}?stat` | the object, or `null` |
| `files.move(from, to)` | `POST /files/move` | the object at its new name (atomic, same tool) |
| `files.url(name, {thumbnail?: 256 \| 1024, download?: boolean})` | `POST /files/url` | `{url, expiresIn}` |
| `files.publicUrl(name)` | — (computed) | the permanent public address of a `public/…` object |
| unchanged | `put`, `get`, `list`, `delete` | |

**The upload token** is signed by the Chest (HMAC under the node's files key)
and binds: tool, exact name (or a prefix, with the Chest choosing the last
segment), maximum size (≤ `maxObject`), accepted types (default: any), expiry
(≤ 15 min), single use. The browser sends it to
`https://<tool>-chest.<chest>…/_chest/files/upload/<token>`:

- **Private upload** (default): on the tool's team host, the same origin as its
  `/chest` pages, so no CORS. The member's session is required and must still
  have the tool; `Origin` of the host is required. 201 `{name, type, size}`.
- **Public upload** (`public: true`, requires `publicUploads`): on the tool's
  public host, `/_chest/upload/<token>`, no session; 10 MiB at most whatever
  the tool asks; 30 uploads a minute per client address; the name forced under
  `uploads/public/`. For forms with attachments, job applications, support
  tickets.

**Checks at upload:** declared size before reading (413 `too_large`, 429
`quota_exceeded`), the body read up to the bound and dropped at the first byte
too many; the type must be one the token accepts; for images, PDFs and
archives the first bytes must match the type (400 `type_mismatch`); nothing
of a refused upload remains. SVG, HTML and scripts are always served as
downloads, never inline. No antivirus scan at this stage (said in the docs).

**Thumbnails.** For JPEG, PNG, GIF (first frame) and WebP up to 40 megapixels,
`files.url(name, {thumbnail})` returns a 256 or 1,024 px version (JPEG, or PNG
when the image has transparency), made once in a bounded worker and kept
beside the original; thumbnails are not counted in the quota and go with the
original. `stat` gives `width` and `height` for these images. Nothing else is
converted (no video, no HEIC, no PDF pages).

**Public files** (`publicFiles`): objects under `public/` are served on the
tool's public host at `/_chest/public/<name>` without a link to sign, with
`Cache-Control: public, max-age=3600` and a revision in the address
(`publicUrl` adds `?v=<rev>`). For product images, a CMS, avatars on a public
page. Everything else stays private, as today.

**Resumable uploads** (tus-like) for files beyond 512 MiB: later, if a real tool
needs it.

## The Storage view

A **Storage** tab on the page of a tool that declares `files`, beside
Database, in the same family and the same look (Supabase Storage, in the
Chest's black and white editorial style: hairlines, regular weight, square
corners, no filled cards, no colour states).

```
Storage                                                     312 MB of 5 GiB
━━━━━━━━━━━━━━━━──────────────────────────────────────────  1,204 files

[ Search files                                    ]           Quota: 5 GiB ›

invoices / 2026 /
───────────────────────────────────────────────────────────────────────────
□  Name                          Type               Size       Updated
───────────────────────────────────────────────────────────────────────────
□  ▢ 0041.pdf                    PDF                212 kB     2 days ago
□  ▣ scan-0042.jpg               JPEG image         1.4 MB     5 min ago
□  ▢ 0043.pdf                    PDF                198 kB     today
───────────────────────────────────────────────────────────────────────────
Load more
```

| Element | Behaviour |
|---|---|
| Usage line | Used of quota as a thin black rule; object count; beyond 90 %, the line says “Almost full”; full, “Full: uploads are refused” |
| Folders | Virtual, from `/` in names; a breadcrumb; a folder row shows its object count and size |
| Search | On names, anywhere in the name, across the whole tool (server side, on the index the Chest already keeps) |
| Sort | Name, size, updated |
| Row | Icon or image thumbnail (256 px), name, type in words, size, relative date |
| Detail panel | Opens on the right: preview (image; PDF in a sandboxed frame; the first 64 KiB of plain text), full name, type, size, dimensions, updated, “Download”, “Copy private link (15 min)”, “Delete” |
| Delete | One file: a confirmation that names it and says “The tool may still refer to this file.” A selection or a folder: typing the folder name or the count to confirm |
| Quota | Owner or admin: set the quota (preset values, within the server's free disk) |
| Empty | “No files yet. The tool stores them here as it works.” |

No upload and no rename from this view: the tool owns its file names, which
its database refers to. Changes go through the tool, or through its code.

**Who:** the owner, admins and the tool's builders — those who run it (like
Database). Never a plain member. Every preview, download, link and deletion
from the view or the API is written in the tool's storage journal (who, when,
which name; never the content), kept 90 days, readable by the same people.

**Chest-wide:** Settings → **Storage** for the owner and admins: one row per
tool — files used and quota, database size, object count — and the server's
disk: used, free, reserved for backups. The first page of batch P (capacity).

## For agents

`/api/v1/tools/{app}/files` (list, search by `q`, `stat`),
`POST …/files/url` (a private link), `POST …/files/delete` (a write: read-only
tokens refused), same rights and journal as the view. MCP: `files_list`,
`files_link`, `files_delete` (two steps, like every write).

## Limits

| | Value |
|---|---|
| Quota per tool | 1 GiB by default; asked in `chest.json` up to 100 GiB; set by the owner or an admin |
| Object | 32 MiB by default, up to 512 MiB asked; 10 MiB for a public upload |
| Objects per tool | 10,000 by default, 100,000 with a quota ≥ 10 GiB |
| Upload token | 15 min, single use |
| Download link | 15 min (unchanged) |
| Thumbnails | JPEG, PNG, GIF, WebP; 40 megapixels; 256 and 1,024 px |
| Public uploads | 30 a minute per client address, per tool |

## What to build

| Where | Change |
|---|---|
| Chest | `files` manifest key and sentences; quotas per tool in the policy; upload tokens and the two upload routes; content checks; `stat`, `move`; thumbnails worker; public files route; Storage tab and Settings → Storage; storage journal; `/api/v1` routes |
| SDK 0.2.0 | `uploadUrl`, `stat`, `move`, `url` options, `publicUrl`; `fakeChest` storage |
| MCP | `files_list`, `files_link`, `files_delete` |
| Backups | Larger quotas weigh on the nightly archive: measured with batch BK before quotas above 10 GiB are offered |
| Proofs | VM proof: private upload with a session, refused without; wrong type, too large, quota full; public upload; thumbnail; deletion from the view seen by the tool |

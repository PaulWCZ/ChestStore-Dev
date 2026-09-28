# Wiki — open-source research
_Read on 2026-09-28. Replaces: Notion (docs part), Confluence, Google Sites (as company handbook)._

## The job
The company writes down how it works — handbook, procedures, onboarding, policies, meeting notes — and
everyone finds the answer without asking a colleague. Daily, 80 % of use is: search, read a page, follow
a link in the sidebar tree; a few people create and edit pages in a friendly editor (headings, lists,
links, images, tables, callouts) and see who changed what.

## Projects

### BookStack
| Field | Content |
|---|---|
| Project | BookStack, https://github.com/BookStackApp/BookStack (now "managed on Codeberg", https://codeberg.org/bookstack/bookstack) — ~19.1k stars on GitHub; latest feature release v26.03 (March 2026, per search result https://www.bookstackapp.com/blog/bookstack-release-v26-03/); `version` file on the development branch reads `v26.05-dev`. Active. |
| Licence | `MIT` — https://raw.githubusercontent.com/BookStackApp/BookStack/master/LICENSE |
| Reuse | **Code** (MIT, with attribution) |
| Stack | PHP/Laravel, MySQL; WYSIWYG editor (TinyMCE, and a newer Lexical-based editor), Markdown editor (CodeMirror). Data model and permission logic transpose to Postgres; code does not transpose to Node. |
| What it does best | "Pleasant and simple out-of-the-box experience": a fixed hierarchy anyone understands — **Shelves → Books → Chapters → Pages** (https://www.bookstackapp.com/docs/user/organising-content/); page revisions with diff and restore; per-item permissions by role; tags; PDF/HTML/plain export; draft autosave; page templates; include one page's section in another. |
| What to avoid | Rigid four-level hierarchy is the most cited limitation (https://blog.elest.io/outline-vs-bookstack-which-self-hosted-wiki-for-your-team/); two editors (WYSIWYG vs Markdown) confuse; style injection in page content needed a security release (v25.12.9, per search result) — sanitize strictly. |

### Outline
| Field | Content |
|---|---|
| Project | Outline, https://github.com/outline/outline — ~40.7k stars; latest v1.10.1, 09 Sep (2026, current year on releases page); very active. |
| Licence | `BUSL-1.1` — Additional Use Grant forbids offering a "Document Service" to third parties; Change Date 2030-09-09 → Apache-2.0 — https://raw.githubusercontent.com/outline/outline/main/LICENSE |
| Reuse | **Ideas only** |
| Stack | Node + TypeScript, React, Sequelize + PostgreSQL, Redis; ProseMirror-based editor; collaboration over WebSocket (Y.js). The closest stack to ours. |
| What it does best | The best writing UX of the group: Markdown shortcuts typed inline, `/` command menu, nested documents in "collections", instant search, `@`-mentions, shareable public links, document templates, Markdown import/export, importers for Notion and Confluence exports (importers not verified first-hand). |
| What to avoid | No built-in password login; self-hosting requires an external SSO/OIDC provider and S3-compatible storage (https://docs.getoutline.com/s/hosting/doc/authentication-7ViKRmRY5o, per search result) — irrelevant for us (Chest gives identity), but shows the ops burden. Real-time collaboration (Y.js, not verified first-hand) needs WebSocket, which Chest lacks. |

### Docmost
| Field | Content |
|---|---|
| Project | Docmost, https://github.com/docmost/docmost — ~21.8k stars; latest v0.96.0, 08 Sep (2026); active. |
| Licence | `AGPL-3.0` core — https://raw.githubusercontent.com/docmost/docmost/main/LICENSE; files under `apps/server/src/ee`, `apps/client/src/ee`, `packages/ee` are under a proprietary Enterprise licence (README). |
| Reuse | **Ideas only** |
| Stack | Node/TypeScript pnpm monorepo, React, PostgreSQL, Redis (framework details — NestJS, Tiptap, Hocuspocus/Y.js — from memory, not verified). |
| What it does best | "Confluence alternative" model non-technical staff get immediately: **Spaces** (team areas) with a nested page tree in a sidebar; space permissions by group; comments; page history; full-text search; diagrams (draw.io, Excalidraw, Mermaid); imports of Markdown, HTML, Notion and — Enterprise only — Confluence (v0.21.0, https://github.com/docmost/docmost/discussions/1270, per search result). |
| What to avoid | Pre-1.0 versioning; key features behind the Enterprise licence; collaboration relies on WebSocket. |

### Wiki.js
| Field | Content |
|---|---|
| Project | Wiki.js, https://github.com/requarks/wiki (was `requarks/wiki.js`) — ~29k stars; stable line v2.5.315 (21 Sep 2026); v3 still beta (3.0.0-beta.605, 25 Sep 2026). |
| Licence | `AGPL-3.0` — https://raw.githubusercontent.com/requarks/wiki/main/LICENSE |
| Reuse | **Ideas only** |
| Stack | Node + Vue, PostgreSQL (v3 Postgres-only). |
| What it does best | Several editors (Markdown, visual, raw HTML); path-based pages (`/hr/leave-policy`); page rules for permissions by path prefix; built-in Postgres search; Git sync/backup of content. |
| What to avoid | v3 announced in 2021, developer preview 2022, still beta in 2026 — long-standing community frustration (https://github.com/requarks/wiki/discussions/7011, https://github.com/requarks/wiki/discussions/5359); admin area very technical (modules, storage targets, renderers). |

### AFFiNE
| Field | Content |
|---|---|
| Project | AFFiNE, https://github.com/toeverything/AFFiNE — ~73.1k stars; release not verified. |
| Licence | Mixed: `MIT` for everything outside `packages/backend` and `packages/common/native`; those directories under the proprietary "AFFiNE Enterprise Edition (EE) license" — https://raw.githubusercontent.com/toeverything/AFFiNE/master/LICENSE, https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/backend/server/LICENSE |
| Reuse | **Code** only for MIT front-end parts (BlockSuite editor etc.), after checking the file's directory; backend **ideas only**. |
| Stack | TypeScript, React, BlockSuite editor, Rust CRDT (y-octo), Electron. |
| What it does best | Doc + whiteboard ("edgeless") on the same content; local-first. |
| What to avoid | Far beyond a company handbook; heavy CRDT architecture; whiteboard mental model is not "a handbook". |

Also reviewed, left out: **HedgeDoc** (https://github.com/hedgedoc/hedgedoc, ~7.4k stars, `AGPL-3.0` https://raw.githubusercontent.com/hedgedoc/hedgedoc/master/LICENSE, 1.12.0 on 21 Aug 2026; 1.x maintenance-only, 2.x rewrite in alpha) — collaborative Markdown notes, not a structured wiki, Markdown syntax visible to users. **XWiki** (https://github.com/xwiki/xwiki-platform, ~1.3k stars, `LGPL-2.1` https://raw.githubusercontent.com/xwiki/xwiki-platform/master/LICENSE) — Java, very powerful and very complex.

## Feature list of our tool
| Feature | MVP / later / never | Where the idea comes from | Note |
|---|---|---|---|
| Spaces (e.g. "Company handbook", "Sales", "HR") each with a nested page tree in the sidebar | MVP | Docmost, Confluence, Outline collections | Free nesting (not BookStack's fixed 4 levels), drag to reorder/move. |
| Rich-text editor with Markdown shortcuts and `/` menu: headings, lists, checklists, links, images, tables, callouts, code, dividers | MVP | Outline, Notion, Docmost | Tiptap (MIT). Store ProseMirror JSON + derived plain text for search; one editor only. |
| Read mode by default, "Edit" button; draft autosave | MVP | BookStack, Confluence | Most people only read. |
| Full-text search (titles weighted), FR + EN stemming | MVP | all | PostgreSQL `tsvector` with `french`/`english` configs; no external engine. |
| Page history: list of versions, who/when, view diff, restore | MVP | BookStack, Confluence | |
| Permissions per space: everyone / groups can read; groups can edit | MVP | Docmost, BookStack | Groups/roles from the Chest platform; page-level restrictions later. |
| Edit conflicts: optimistic lock ("Alice saved a newer version — review") | MVP | — | No WebSocket, so no live co-editing; poll for "someone is editing" presence. |
| Images and attachments in pages | MVP | all | Chest file API. |
| Internal links with page picker; backlinks list | MVP (links) / later (backlinks) | Outline, Notion | Links by page id, survive renames. |
| Import Notion export (Markdown & CSV zip) | MVP | Outline, Docmost | Notion's "Markdown & CSV" export is a zip with one `.md` per page named `Title <32-hex id>.md`, subpages in folders, full-page databases as `.csv` plus one `.md` per row; links point to those file names (per search result on https://www.notion.com/help/export-your-content, not read first-hand: domain blocked). Strip ids, rebuild tree and links. |
| Import Confluence space export (HTML zip) | MVP | Docmost EE, Outline | Confluence Cloud exports a space as PDF, HTML, CSV or XML (zip for HTML/CSV/XML); XML export end-of-life announced, CSV is the supported successor (per search result, https://support.atlassian.com/confluence-cloud/docs/export-content-to-word-pdf-html-and-xml/ and https://support.atlassian.com/confluence/kb/xml-export-end-of-life-confluence-cloud/, not read first-hand). Start with HTML; CSV format not verified. |
| Import Markdown / HTML files (folder zip) | MVP | Docmost, Outline | Covers Google Docs/Sites exported as HTML or Markdown. |
| Export a page or space to Markdown / HTML zip | MVP | Outline, BookStack | Reversibility. |
| Print / PDF of a page | MVP (browser print CSS) / later (server PDF) | BookStack | |
| Page templates ("Procedure", "Meeting notes", "Onboarding") | later | Confluence, BookStack | |
| Comments (inline or page-level) | later | Docmost, Confluence | Notifications via Chest inbox. |
| "Read and acknowledged" on a page (e.g. internal rules) | later | Confluence add-ons | Useful for the règlement intérieur (see below). |
| Page verification / "review every N months" reminders | later | Notion wiki verification | Needs **scheduler** primitive (SDK proposal). |
| Watch a page → notification on change | later | Confluence | Chest inbox; email needs **outbound email** (proposal). |
| Public page / public space (anonymous read, e.g. public help centre) | later | Outline share links | Requires the public part of Chest (`public-and-private` folder). |
| Real-time co-editing with cursors | never (until the platform offers WebSocket/SSE) | Outline, Docmost | Would need a Chest realtime primitive. |
| Databases/tables with typed properties, whiteboards, AI writing | never | Notion, AFFiNE | Long tail; other store tools cover structured data. |
| Git sync, multiple editors, raw HTML pages | never | Wiki.js | |

## Reusable pieces
- **Tiptap** (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`, `@tiptap/extension-details`, `@tiptap/markdown`) 3.31.3, MIT — https://github.com/ueberdosis/tiptap, LICENSE https://raw.githubusercontent.com/ueberdosis/tiptap/master/LICENSE.md. Recommended editor. Only use packages whose npm licence is MIT (some Tiptap Pro/cloud features are paid — check each package).
- **ProseMirror** (`prosemirror-model` 1.25.12, `prosemirror-markdown` 1.13.8), MIT — https://github.com/ProseMirror/prosemirror-model, LICENSE https://raw.githubusercontent.com/ProseMirror/prosemirror-model/master/LICENSE. Server-side document validation and Markdown serialization.
- **Lexical** 0.52.0, MIT — https://github.com/facebook/lexical (LICENSE https://raw.githubusercontent.com/facebook/lexical/master/LICENSE). Alternative editor (used by BookStack's new editor); pre-1.0 API.
- **Milkdown** (`@milkdown/core`, `@milkdown/crepe`) 7.22.2, MIT — https://github.com/Milkdown/milkdown. Markdown-first WYSIWYG; alternative if we store Markdown.
- **markdown-it** 15.0.2 (published 2026-09-11), MIT — https://github.com/markdown-it/markdown-it. Parse imported Notion/Markdown files (CommonMark, safe by default: raw HTML off).
- **marked** 18.0.14 (published 2026-09-22), MIT — https://github.com/markedjs/marked. Faster alternative; does **not** sanitize.
- **turndown** 7.2.4, MIT — HTML → Markdown, for Confluence/Google HTML imports and Markdown export.
- **sanitize-html** 2.17.7, MIT — https://github.com/apostrophecms/sanitize-html. Server-side allow-list sanitizer (Node, no DOM needed) for imported HTML.
- **DOMPurify** 3.4.16, `(MPL-2.0 OR Apache-2.0)` — https://github.com/cure53/DOMPurify (take it under Apache-2.0). Browser sanitizer; on the server needs **jsdom** 30.1.1 (MIT) or **isomorphic-dompurify** 4.4.0 (MIT).
- **jszip** 3.10.2, `(MIT OR GPL-3.0-or-later)` — read Notion/Confluence zips in memory (no disk writes), used under MIT.
- **diff** (jsdiff) 9.0.0, BSD-3-Clause — text diffs between page versions.
- **BookStack** (MIT) — permission model and revision logic can be read and adapted with attribution.
- Search: PostgreSQL full-text search (built-in), no library needed; **minisearch** 7.2.0 (MIT) only if client-side search of the tree is wanted.
- Versions/licences above read from the npm registry (`registry.npmjs.org/<pkg>/latest`) on 2026-09-28.

## Legal and security notes
- **XSS is the main risk**: pages are written by employees and imported from third-party zips. Store editor JSON (schema-validated server side with ProseMirror), render to HTML with an allow-list, sanitize every imported HTML/Markdown (no `<script>`, `<style>`, `on*` attributes, `javascript:` URLs, inline `style`). BookStack's v25.12.9 security release for style injection shows the class of bug.
- **Imports**: zip bombs and path traversal in zip entries — cap total uncompressed size and entry count, ignore paths, process in memory (Chest forbids disk writes); never fetch remote images during import (needs declared outbound network); report what was skipped.
- **GDPR**: pages may hold personal data (org charts, phone lists, HR procedures). Access by space/group; page history keeps deleted content — deletion of a page must be able to purge its revisions; author fields store member ids only.
- **French labour law — règlement intérieur**: it must be brought "by any means" to the knowledge of people with access to the workplace; the intranet is an accepted channel, alongside physical posting (Code du travail art. R1321-1, https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033292501, per search result; https://code.travail.gouv.fr/code-du-travail/r1321-1). The wiki can host it, but does not replace the other formalities (CSE consultation, filing with the conseil de prud'hommes, labour inspectorate) — docs must say so. An "acknowledged" button (later) would help show employees were informed.
- No invoicing/accounting rule applies.

## Sources
- https://github.com/BookStackApp/BookStack, https://raw.githubusercontent.com/BookStackApp/BookStack/master/LICENSE, https://raw.githubusercontent.com/BookStackApp/BookStack/development/readme.md, https://raw.githubusercontent.com/BookStackApp/BookStack/development/version
- https://www.bookstackapp.com/blog/bookstack-release-v26-03/, https://www.bookstackapp.com/blog/bookstack-release-v25-12-3/, https://www.bookstackapp.com/docs/user/organising-content/ (search results)
- https://blog.elest.io/outline-vs-bookstack-which-self-hosted-wiki-for-your-team/ (search result)
- https://github.com/outline/outline, https://github.com/outline/outline/releases, https://raw.githubusercontent.com/outline/outline/main/LICENSE
- https://docs.getoutline.com/s/hosting/doc/authentication-7ViKRmRY5o (search result)
- https://github.com/docmost/docmost, https://github.com/docmost/docmost/releases, https://raw.githubusercontent.com/docmost/docmost/main/LICENSE, https://raw.githubusercontent.com/docmost/docmost/main/README.md
- https://github.com/docmost/docmost/discussions/1270, https://docmost.com/docs/user-guide/import-export, https://wz-it.com/en/blog/docmost-community-vs-enterprise-edition/ (search results)
- https://github.com/requarks/wiki, https://github.com/requarks/wiki/releases, https://raw.githubusercontent.com/requarks/wiki/main/LICENSE
- https://github.com/requarks/wiki/discussions/7011, https://github.com/requarks/wiki/discussions/5359 (search results)
- https://github.com/toeverything/AFFiNE, https://raw.githubusercontent.com/toeverything/AFFiNE/master/LICENSE, https://raw.githubusercontent.com/toeverything/AFFiNE/canary/packages/backend/server/LICENSE
- https://github.com/hedgedoc/hedgedoc, https://github.com/hedgedoc/hedgedoc/releases, https://raw.githubusercontent.com/hedgedoc/hedgedoc/master/LICENSE
- https://github.com/xwiki/xwiki-platform, https://raw.githubusercontent.com/xwiki/xwiki-platform/master/LICENSE
- https://www.notion.com/help/export-your-content (search result; domain blocked)
- https://support.atlassian.com/confluence-cloud/docs/export-content-to-word-pdf-html-and-xml/, https://support.atlassian.com/confluence/kb/xml-export-end-of-life-confluence-cloud/ (search results; domain blocked)
- https://raw.githubusercontent.com/ueberdosis/tiptap/master/LICENSE.md, https://raw.githubusercontent.com/ProseMirror/prosemirror-model/master/LICENSE, https://raw.githubusercontent.com/facebook/lexical/master/LICENSE, https://raw.githubusercontent.com/Milkdown/milkdown/master/LICENSE, https://raw.githubusercontent.com/markdown-it/markdown-it/master/LICENSE, https://raw.githubusercontent.com/markedjs/marked/master/LICENSE, https://raw.githubusercontent.com/cure53/DOMPurify/main/LICENSE, https://raw.githubusercontent.com/cure53/DOMPurify/main/README.md, https://raw.githubusercontent.com/apostrophecms/sanitize-html/master/LICENSE
- https://registry.npmjs.org/ (versions/licences: @tiptap/*, prosemirror-*, lexical, @milkdown/*, markdown-it, marked, dompurify, isomorphic-dompurify, jsdom, sanitize-html, turndown, jszip, diff, minisearch)
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033292501, https://code.travail.gouv.fr/code-du-travail/r1321-1 (search results)

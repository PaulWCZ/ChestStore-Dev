# Third-party material

| What | Source | Licence | Where |
|---|---|---|---|
| Newsreader (font) | [productiontype/Newsreader](https://github.com/productiontype/Newsreader), via `@fontsource-variable/newsreader` 5.3.0 | OFL-1.1 | `public/fonts/newsreader-*`, licence in `public/fonts/LICENSE-newsreader.txt` |
| Source Sans 3 (font) | [adobe-fonts/source-sans](https://github.com/adobe-fonts/source-sans), via `@fontsource-variable/source-sans-3` 5.3.0 | OFL-1.1 | `public/fonts/source-sans-3-*`, licence in `public/fonts/LICENSE-source-sans-3.txt` |
| Tiptap editor | [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) 3.31.3: `@tiptap/core`, `react`, `pm`, `starter-kit`, `extension-image`, `extension-table`, `extension-list`, `extensions` | MIT | npm dependencies; the wiki's own nodes (note box, link to a page) are in `app/chest/pages/[id]/edit/extensions.ts` |
| ProseMirror base styles | [ProseMirror/prosemirror-view](https://github.com/ProseMirror/prosemirror-view) `style/prosemirror.css` | MIT | the `.ProseMirror` rules of `app/globals.css` follow it (loaded from our CSS because the page's policy forbids injected style elements) |
| markdown-it | [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) 15.0.2 | MIT | npm dependency, reads imported Markdown (`lib/markdown.ts`), raw HTML off |
| jsdiff | [kpdecker/jsdiff](https://github.com/kpdecker/jsdiff) (`diff`) 9.0.0 | BSD-3-Clause | npm dependency, the history's comparison (`lib/history.ts`) |
| Comments, watching, templates (ideas and wording) | BookStack (MIT): "Page is a template", watch "page changes and new comments", no repeated mails for further edits; Outline (BUSL-1.1): "Subscribe" to a document, viewers may comment, "New from template"; Wiki.js (AGPL-3.0): page comments — read from their English language files on 2026-09-28 (https://raw.githubusercontent.com/BookStackApp/BookStack/development/lang/en/entities.php, https://raw.githubusercontent.com/outline/outline/main/shared/i18n/locales/en_US/translation.json) | — | ideas only; **no code copied** |
| Notion export layout, spaces with page trees, revisions with restore (ideas) | Outline (BUSL-1.1), Docmost (AGPL-3.0), BookStack (MIT) — see `reports/02-open-source/wiki.md` of the studio | — | ideas only; **no code copied** |
| htmlparser2 | [fb55/htmlparser2](https://github.com/fb55/htmlparser2) 12.0.0 (with `domhandler`, `domutils`, `domelementtype`, `entities` — BSD-2-Clause — and `dom-serializer` — MIT —, same author) | MIT | npm dependency: reads imported HTML pages (`lib/html.ts`) and Word's XML (`lib/docx.ts`); nothing it parses is kept as HTML — only the wiki's own schema, then `normalize()` |
| Confluence space export (HTML) format | Atlassian's documentation, read through a web search on 2026-09-29 (the pages themselves were not reachable from the studio's network): "Export content to Word, PDF, HTML and XML" — https://confluence.atlassian.com/doc/export-content-to-word-pdf-html-and-xml-139475.html and https://support.atlassian.com/confluence-cloud/docs/export-content-to-word-pdf-html-and-xml/ (the space's details and page list in `index.html`, page attachments in `attachments/<page id>/`); "How to get the page tree structure in an HTML export" — https://support.atlassian.com/confluence/kb/how-to-get-the-page-tree-structure-in-an-html-export/ (the tree is only in `index.html`'s "Available Pages", each child in a list of its own; breadcrumbs otherwise); the markup of pages (`#title-text`, `#main-content`, `#breadcrumbs`, the attachments section, information/note/tip/warning macros, code macros, inline task lists, `data-linked-resource-*` links) as Confluence writes it | — | the format only: `lib/html.ts`, `lib/importer.ts`; fixtures written by hand in that shape, `test/fixtures/confluence/` (not a real customer's export) |
| Google Docs "Web page (.html, zipped)" format | the download of Google Docs (File → Download): one HTML file whose styles are classes in `<style>`, `images/`, links wrapped in `https://www.google.com/url?q=` | — | the format only; fixture written by hand in that shape, `test/fixtures/google-docs/` |
| Word (.docx) format | Office Open XML, ECMA-376 (https://ecma-international.org/publications-and-standards/standards/ecma-376/): `word/document.xml`, `styles.xml`, `numbering.xml`, relations | — | the format only: `lib/docx.ts`; the fixture `test/fixtures/word/Livret-accueil.docx` is written by [python-docx](https://github.com/python-openxml/python-docx) (MIT, not a dependency) from its default template (`test/fixtures/word/make.py`) |
| "Read and acknowledged", per-space edit rights, "/" menu, @mentions (ideas) | Confluence (space permissions; read confirmations are Marketplace add-ons), Notion (page sharing "can edit / can view", the "/" menu, "@" mentions) — as described in the studio's critique of this tool | — | ideas only; **no code copied** |

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` and `@argentic/chest-ui` (MIT, the
studio's working copies in `vendor/`: the SDK, and the UI kit — themes,
shared components; the kit writes the `@font-face` rules for the fonts
above from its registry). The ZIP reader and writer
(`lib/zip.ts`), the document checker and renderer (`lib/doc.ts`,
`lib/render.ts`) and the icons (`components/icons.tsx`) are written for
this tool.

## From the studio's News tool

`migrations/0005_stems.sql` copies the French and English stemming
configurations of News (`tools/private/news/migrations/0003_reach.sql`,
`news_en` / `news_fr`, MIT, © 2026 Argentic) as `wiki_en` / `wiki_fr`; the
same studio, the same licence, copied rather than imported (one tool, one
folder).

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

Dependencies installed from npm under their own licences: `next`, `react`,
`react-dom` (MIT), `postgres` (Unlicense), `@argentic/chest-sdk` (MIT, the
studio's working copy in `vendor/`). The ZIP reader and writer
(`lib/zip.ts`), the document checker and renderer (`lib/doc.ts`,
`lib/render.ts`) and the icons (`components/icons.tsx`) are written for
this tool.

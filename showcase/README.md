# showcase/

`index.html`, built by `scripts/build-showcase.mjs` (`node scripts/build-showcase.mjs`,
re-run whenever a tool changes). One static page: it opens with a double-click —
no server, no network, no script; screenshots and fonts by relative paths into
`tools/`.

What it shows:

- **Every tool's identity side by side** (brief/05, the style contest): icon, name,
  description, adjectives, type specimen, palette, why, and its screenshots
  (`docs/screens/`, desktop and phone). Each screenshot's caption names its look
  when it is not the tool's own.
- **A switch at the top, "Show the whole store in"**: Every screenshot (the
  default, everything as before) · Own identity · Chest look · Brand: Atelier
  Martin · Brand: Café du Port. A look shows only the screenshots taken in that
  look, so a visitor sees the whole store in one look; a tool with none says so.
  Radio buttons and CSS `:has()`, keyboard-operable.
- **Looks, side by side** (`#looks`): per tool, the same page in the four looks a
  company can choose (report 04): the tool's own identity, the Chest look (the
  sober catalogue theme), and the harness's two company brands (`brand:sample`,
  Atelier Martin; `brand:port`, Café du Port). The build picks the page
  automatically, then lists under "What is missing" every look that had to come
  from another page.

How the looks are read: each tool's `docs/screens.json` entry may carry a
`"look": {"all": …, "tool": …}` (lab/chest-dev/screens.mjs). What the screenshot
wears is the tool-level choice when set (not `"inherit"`), else the choice for all
tools, else the tool's own identity. A page outside `/chest` is public, and public
pages never wear a catalogue theme — the Chest look included — so such a shot is
counted as the own identity (report 04, "Public pages"; checked on Status: its
`status-page-chest` and `public-theme-all` shots are the plain status page). A
screenshot with no entry in `screens.json` gets its look from its name (`-port`,
`-brand`, `-chest`, `-theme`). Other catalogue themes (Library, Workshop…) appear
only in "Every screenshot"; the UI kit's gallery (linked at the top) shows every
theme.

How the compared page is picked: among the pages (the `path` in `screens.json`)
that have an own-identity shot, the one with the most looks photographed in the
same device (light mode counts more than dark), desktop before phone, the team side
before the public side, then the earlier entry. In each look it prefers light, no
actions, English.

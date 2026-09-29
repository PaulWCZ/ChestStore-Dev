# Themes and the UI kit — one look per company, or one per tool

*Written 2026-09-28; components, glossary and their migration plan added
2026-09-29 (sections 13–15). What is verified is marked as such; the rest
is design or assumption, said so.*

## 1. In short

The owner wants each company to personalise its Chest: **keep each tool's
own identity**, **pick one theme for all its tools**, or **wear its own
brand** (colours, fonts, logo) — and, on top, **choose otherwise for any one
tool**. Same features; only the look changes; every text stays readable.

What now exists:

| Piece | Where | State |
|---|---|---|
| The UI kit `@argentic/chest-ui` 0.2.0-studio.1 | `ui/` (working copy, like `sdk/`), vendored by `scripts/add-ui.mjs` | 68 tests pass; package check passes (Node, esbuild, TS bundler + nodenext, server rendering of the components); 231 KB packed |
| **Shared components** (0.2.0) | `ui/src/components/`, `@argentic/chest-ui/components` (+ `/components/logic`, `/components.css`) | 28 components (section 13); 37 of the tests; gallery hydrated in Chromium with no mismatch, axe clean in 4 looks × 2 modes × 2 languages, 14 keyboard/mouse flows pass |
| **Store glossary + lint** | `lab/GLOSSARY.md`, `scripts/lint-words.mjs` | run on the 18 tools: 1,175 errors, 0 warnings (section 15) |
| The token contract | `ui/tokens/CONTRACT.md`, typed in `ui/src/contract.ts` | 81 tokens (47 colours and 3 effects per mode, 31 shared); 59 measured pairs per mode (text 4.5:1, non-text 3:1) |
| The catalogue: 17 tool identities + "Chest" + "High contrast" | `ui/src/themes.ts` | all 19 pass every pair, light and dark (tested) |
| Brand derivation `deriveTheme(brand)` | `ui/src/derive.ts` | AA guaranteed: 1,500 seeded random brands in the tests (and 3,000 more in a one-off run) with zero failure; notes in English and French |
| Brand import `importBrand(text, filename)` | `ui/src/import.ts` | W3C design tokens, Tokens Studio, CSS, colour lists; 6 realistic fixtures in `ui/test/fixtures/` |
| Runtime | `resolveTheme`, `themeStyle`, `<ThemeStyle>` | server-side only, no client script; strict CSP unchanged |
| SDK proposal `chest.theme()` | `sdk/client/src/chest.ts`, SDK 0.3.0-studio.11 | two levels (all tools, per tool), `fakeChest({theme, themeFiles})`; 5 new tests, 65 pass; package check passes |
| Harness | `lab/chest-dev/` | "/_dev → Look": all tools / this tool; serves the kit's fonts and a sample brand; `screens.mjs` and `audit.mjs` take `"look"` |
| Gallery | `ui/gallery/index.html` (`npm run gallery`), linked from `showcase/index.html` | 19 themes side by side, light and dark, EN/FR; "Your brand" live demo; opens offline (verified: no request leaves the page) |
| Pilot | `lab/template` migrated (themes, then components: section 14) | tests (PGlite and PostgreSQL), build, manifest check, screenshots in 4 looks, axe audit (WCAG 2.1 A/AA) in all looks, light and dark: pass |

## 2. How it works

```
Owner, in the Chest's admin
  "How your tools look": each its own | a theme for all | our brand      ← level 1: all tools
  per tool: same as all | its own look | a theme | our brand              ← level 2: this tool
        │  (brand: colours, fonts, corners, density, logo — previewed live with the kit's notes)
        ▼
Chest API  GET /theme  (resolved for the asking tool: its override, else the choice for all)
        │  {mode: "own" | "catalogue" | "brand", …, scope: "tool" | "chest" | "default"}
        ▼
Tool, per request (server):   look = resolveTheme(await chest.theme(), identity)
        │  catalogue → the kit's theme;  brand → deriveTheme(brand);  own / unknown / error → identity
        ▼
<head><style nonce="…">@font-face…  :root{--bg:…;--accent:…}  @media (prefers-color-scheme: dark){…}</style>
        │  fonts and logo from /_chest/theme/… on the tool's own origin
        ▼
The tool's CSS names only contract tokens → the same page, in the chosen look
```

The tool never stores the choice, has no switch of its own and runs no
script for it. `chest.theme()` and `resolveTheme()` never throw: a Chest
without themes, an unreachable Chest, an unknown theme id or an unreadable
brand all fall back to the tool's own identity (the reason goes to the
logs, never the page).

## 3. The token contract — derived from the tools

Inventory of the 17 tools' `app/tokens.css` (2026-09-28): the names most
tools already shared kept their meaning — `--ink` and `--ink-2` (17 of 17),
`--line`, `--focus` (16), `--surface` (15), `--bg`, `--accent`,
`--accent-ink` (14), `--surface-2` (13), `--danger` (13), `--accent-soft`
(12), `--line-strong` (11), `--ok` (7), the space scale (17), `--radius-s/m`
(16), `--text-xs…xl` (16–17), `--fast/--slow/--ease` (16–17). Everything
else was a tool's own (between 5 for News and 27 for Leave and Timesheets).

What the contract adds, and why:

- **`--accent-line`** — the edge of an accent-filled control. Workshop's sun
  yellow is 1.4:1 on white: the tool draws an ink outline. Without this
  token another theme could not be told "outline your buttons".
- **`--accent-text`** — the accent as text (links). People and Rooms had
  one; Tasks used a separate `--link`. A light accent can never be text.
- **States as three tokens** (`--ok`, `--ok-soft`, `--ok-ink`; same for
  `wait`, `danger`): the text colour, a soft ground, the text on that
  ground. Leave, Booking, Clients, Expenses, Equipment, Goals and Status each
  had their own names for the same idea.
- **`--highlight`** — the marker pen (Wiki's `--marker`, News'
  `--highlight`, Support's notes).
- **The categorical palette** (below): 24 tokens.
- **`--weight-strong`, `--display-weight`, `--display-tracking`,
  `--font-accent`** — needed by the Chest theme (weight 400 only, hierarchy
  by size and tracking, a serif for the wordmark) and useful to every
  identity (Young Serif and Caslon headings are 400).
- **`--control-h`** (44 px) — a constant no theme may change.

### The categorical palette: a palette per theme, not `color-mix()`

Many tools need colours that only mean "different": Tasks' labels, Leave's
kinds, Booking's types, Timesheets' projects, Wiki's spaces, People's
arches, Status's states. Two options were weighed:

- `color-mix(in oklch, …)` from contract tokens in each tool: free, follows
  any theme, but its contrast is unknown until rendered — a tint that reads
  on Library's cream fails on Instrument's dark green, and a label's text on
  it cannot be guaranteed without every tool re-checking every theme.
- **Chosen: each theme provides eight slots** (`--cat-N` for dots and bars
  at 3:1, `--cat-N-soft` for grounds, `--cat-N-ink` for labels at 4.5:1),
  generated in OKLCH against the theme's own surfaces and **checked once
  where the theme is made**. The slots are the same families, in the same
  order, in every theme (1 blue, 2 green, 3 orange, 4 violet, 5 pink,
  6 teal, 7 ochre, 8 slate), so a tool maps "holiday → 1" once and a holiday
  stays bluish everywhere; each identity keeps its own shades (Leave's
  kinds, Booking's swatches, Status's Okabe–Ito states are its slots).

`color-mix()` stays allowed for decoration that carries no text and no
meaning (a grid, a weekend shade, a contour line).

## 4. The catalogue

| Theme | From | What changed from the tool's own values |
|---|---|---|
| Workshop | Tasks | dark `--accent-soft` set (`#33301f`) so links read on it; the 8 label fills are slots' soft grounds (Tasks had 9: slate and sand share slot 8's family) |
| Library | Wiki | `--line-strong` was `#cfc3ab` (1.6:1) / `#4a4436` (1.7:1) → derived at 3:1 |
| Seaside | Leave | `--line-strong` `#b8c8da` (1.6:1) / `#3d4f63` (1.9:1) → derived |
| Newsprint | News | none (no `--surface-2`, `--danger`: derived) |
| Portrait gallery | People | `--line-strong` `#d9c7b3` (1.5:1) / `#56435a` (1.8:1) → derived |
| Sales desk | Clients | `--line-strong` `#aeb8c5` (1.9:1) / `#3a4859` (1.9:1) → derived |
| Receipt | Expenses | none |
| Calm counter | Support | none |
| Blueprint | Rooms | `--accent` is the navy action (Rooms' `--action`); its orange is slot 3; `--accent-soft` set so links read on it |
| Instrument | Timesheets | none (the dark panel is the tool's own, below) |
| Appointment card | Booking | `--line-strong` `#cbbdae` (1.7:1) / `#54475f` (2.0:1) → derived |
| Magazine | Hiring | none (paper/card/cobalt renamed to bg/surface/accent) |
| Tool crib | Equipment | none |
| Confetti | Polls | dark `--line-strong` `#56648a` (2.7:1) → derived |
| Trail map | Goals | none |
| Letterpress | Quotes | none |
| Control room | Status | `--line-strong` `#b4bec9` (1.7:1) / `#3a4552` (1.8:1) → derived |
| **Chest** | the portal's sheet | see below |
| **High contrast** | — | black and white, 2 px lines, Atkinson Hyperlegible, 17 px body |

**A finding for the tools themselves**: nine tools define a
`--line-strong` under 3:1. If they use it for field borders, those fields
fail WCAG 1.4.11 (non-text contrast) — axe-core does not test that rule,
which is why the audits passed. Not verified tool by tool here (tools were
out of scope); the migration fixes it by construction.

**The Chest theme — an exception to brief/05, at the owner's request.**
Brief/05 says a tool's own identity must not look like the portal. This is
not a tool identity: it is an option a company may pick for all its tools
(or one), so that its tools look like its Chest. It follows the portal's
design sheet: warm off-white `#fafaf9`, ink `#171716`, rules `#deded8`,
radius 0, no shadow but popovers, weight 400 everywhere with
`font-synthesis: none`, hierarchy by size and tracking (`--display-tracking`
−0.04em), 15 px body at 1.45, blue `#0061fe` for focus only, brick
`#8a3028` for errors only, 150 ms fades. **No dark mode** (`modes:
"light"`): the page says `color-scheme: light` and stays light on a dark
computer. **States are not colours** in it: tools must show a shape and a
word (the kit's specimen: a filled square for OK, an outlined one for
waiting) — which WCAG 1.4.1 asks of every theme anyway. **Its categories are
warm greys**: in this theme a category is told by its label only, which
every tool must show anyway; a tool that relied on colour alone for
categories would lose information here — that is the limit to know. One
deliberate deviation: the sheet's field border `#bfbfb7` is 1.8:1 on white,
below WCAG 1.4.11's 3:1; its hover grey `#92928b` is 3.1:1 on white but
3.0:1 (2.998) on the page — so the theme's `--line-strong` is `#8a8a83`
(3.5:1 on white, 3.3:1 on the page). The Suisse fonts are **declared, not
shipped** (`'Suisse', Arial, sans-serif` and `'Works', Georgia, serif`): a
Chest holding a licence serves them through the choice's `faces`; pages
render with Arial and Georgia otherwise (the gallery and the pilot's
screenshot show the fallback).

## 5. Fonts: served by the Chest

The catalogue names 30 fonts, all SIL OFL-1.1, from Fontsource 5.3.0 (the
same packages and versions the tools self-host): latin and latin-ext
subsets, WOFF2 only — **84 font files and 30 licences, 2.5 MB, in `ui/fonts/`**
(each font with its `LICENSE-<id>.txt`) (`npm run fonts` fetches them again).

**Decision: the Chest serves them; tools do not carry them.**

- *Size*: carrying the catalogue would add 2.5 MB to each of 17+ tool
  repositories (and to the studio's git at every re-vendor) for fonts most
  companies never choose. The npm package holds only the registry (the kit
  packs to 112 KB).
- *CSP*: the Chest's front serves them **on the tool's own hosts**, under
  `/_chest/theme/fonts/` (and a brand's fonts and logo under
  `/_chest/theme/brand/`): `font-src 'self'` and `img-src 'self'` admit
  them, the tools' strict policy is unchanged, and the `<style>` naming
  them carries the page's nonce.
- *Licences*: OFL-1.1 allows redistribution with the licence; the Chest
  serves the licence beside each font. A company's uploaded font is its
  responsibility (the admin confirms a web licence when uploading).
  Suisse: only a Chest with a licence serves it.
- *A tool's own identity* keeps its fonts in its `public/fonts/` (served at
  `/fonts`, as today); the kit writes their `@font-face` from the same file
  names.
- *Before the Chest serves them*: a real Chest answers no theme, so nothing
  asks for them; a missing font falls back to its stack.

The harness serves `ui/fonts/` at that path; the gallery inlines the latin
subsets (1.2 MB of its 2.0 MB).

## 6. A company's brand

`deriveTheme({primary, secondary?, neutral?, display?, body?, corners,
density, logo?})` works in OKLCH (lightness as the eye sees it, hue kept):

1. Greys (grounds, lines, text) take a whisper of the grey tint, or of the
   main colour; secondary text and field borders are solved for 4.5:1 and
   3:1 against all grounds.
2. The main colour stays the button's fill when white text reads on it; a
   light colour (a yellow) keeps its fill with dark text and a dark edge
   (as Workshop does); otherwise its lightness moves just enough. Links
   use it, or a deeper shade. In dark mode it is lightened to read on dark
   grounds, with dark text on it.
3. The second colour becomes the marker pen and, with the main one, takes
   its family's slot in the categorical palette.
4. States keep their usual hues; a note warns when the brand's colour is
   close to the red of errors or the green of success.
5. Every pair is measured; a failure would be the kit's bug.

Each move is said in plain words, in both languages — for example, for
`#e4572e`: "Your red was darkened a little so the white text on buttons is
easy to read." / "Votre rouge a été un peu foncé pour que le texte blanc des
boutons se lise facilement." The owner sees them live while editing the
brand (the gallery's "Your brand" panel is that preview).

`importBrand(text, filename)` reads what designers export — W3C design
tokens (groups, inherited types, aliases, colour objects), Tokens Studio
(sets, aliases without the set), CSS custom properties (with `var()`
followed, French names too), or a list of colours — and guesses the main,
second and grey colours by name (primary, brand, secondary, neutral, and
their French words), else by vividness; fonts by role name; corners by the
typical radius. Every guess is a note. No network, no evaluation, 1 MiB
and 5,000 tokens at most.

## 7. What the Chest must provide (the SDK proposal)

`chest.theme()` (SDK 0.3.0-studio.11, `sdk/README.md` "`theme`") asks
`GET /theme` and keeps the answer as long as the Chest says (≤ 5 min). The
Chest must:

1. **Offer the choice in its admin, at two levels**: "All tools: each its
   own look / one theme / our brand", and per tool "Same as all tools / its
   own look / a theme / our brand". A preview of a real tool page in each
   choice, and the kit's notes as the owner edits the brand.
2. **Answer `GET /theme` resolved for the asking tool** (its override, else
   the choice for all), with `scope`, and `Cache-Control: max-age`.
3. **Serve `/_chest/theme/…` on every tool host** (team and public): the
   catalogue's fonts (from the kit's `fonts/`) with their licences, and the
   brand's uploads.
4. **Take the brand's uploads safely**: logo (and its dark variant) as PNG,
   WebP, JPEG or SVG — **an SVG served on the tool's origin must be
   sanitised or served with `Content-Security-Policy: default-src 'none'`
   and `X-Content-Type-Options: nosniff`**, or rasterised, since it would
   otherwise run script on that origin if opened directly; fonts as WOFF2
   (checked by magic bytes, bounded size), with the admin confirming a web
   licence.
5. **Embed the kit** for the admin's preview and to validate a brand before
   saving it (a brand the kit cannot read is refused with its code).

No manifest key and no approval: a look is not a permission. Tests and the
harness use `fakeChest({ theme: { all, tools }, themeFiles })`.

## 8. What a theme may change, and what it may not

A theme changes **the look**: colours, fonts, weights and tracking, the type
scale (body 15 px at least), spacing, corners, line width, shadows, motion
speed, dark mode or not. It never changes **layout, wording or
accessibility**: 44 px targets, the presence of the focus ring, the
contrast pairs, what is on a page and in which order, what a button says,
and the rule that a state or a category always carries a word (and a state
a shape). `validateTheme` and `checkTheme` refuse a theme that would break
one of these. A theme also cannot change a tool's own icon (`chest/icon.svg`
on the portal's tile) — in brand mode the company's logo shows beside the
tool's name inside the tool.

## 9. The pilot: `lab/template`

- Vendored the SDK (studio.11) and the kit; the identity ("Notes": Figtree,
  warm paper, one blue) is `defineTheme` in `lib/theme.ts`; the look is
  resolved once per request (`React.cache`) and written by `<ThemeStyle>`
  in the root layout with the page's nonce; `viewport.themeColor` follows
  the look.
- `app/tokens.css` now holds only the tool's own tokens, defined from
  contract tokens (`--note-pinned: var(--accent-line)`); `app/globals.css`
  names only contract tokens (field borders became `--line-strong`, button
  edges `--accent-line`, weights `--weight-strong`); `app/fonts/figtree.css`
  is gone (the kit writes the `@font-face` for `/fonts/…`).
- In brand mode the header shows the company's logo (`<picture>` with its
  dark variant) beside "Notes".
- `test/theme.test.ts`: the identity passes the contract; its fonts are in
  `public/fonts/`; the look follows `fakeChest` (all tools, this tool's
  override, own, an unknown theme, no Chest); no colour literal in any
  stylesheet.
- **Verified**: `npm test` 14/14 with PGlite and with PostgreSQL 16; a clean
  `npm ci` from a copy of the folder, then `npm test`; `npm run build`;
  `scripts/check-manifest.mjs` (one old warning: folder name); on the
  harness (port 6700) the served `<style>` nonce equals the response's CSP
  nonce, fonts and logo answer 200 on the tool's origin; screenshots
  `docs/screens/notes-*` (own), `notes-theme-*` (Newsprint), `notes-brand-*`
  (the sample brand, French, light and dark), `notes-chest-desktop.png`
  (looked at, one by one); `lab/chest-dev/audit.mjs` — no WCAG A/AA rule
  broken on 7 screens in their looks, desktop and phone, light and dark.

## 10. Migration plan for the 17 tools

Common steps (per tool): `add-ui.mjs` and `add-sdk.mjs`; `lib/theme.ts` with
`identityOf("<tool>")` (the catalogue is the single source of the
identity) and `currentLook`; `<ThemeStyle>` in the root layout and
`generateViewport`; delete `app/fonts/*.css` (fonts stay in
`public/fonts/`); rewrite `app/tokens.css` as tool tokens aliased to
contract tokens; replace literal colours in CSS and TSX (icons' strokes,
inline `themeColor`); rename non-contract names in `globals.css`; a
`test/theme.test.ts` like the template's; `docs/screens.json` entries with
`"look"` (one catalogue theme, the sample brand, Chest); run the audit in
all looks; show the logo in brand mode.

Counts measured 2026-09-28 (tokens in `app/tokens.css`; literal colours
outside it, in CSS and TSX).

| Tool | Theme | Contract names already used | Tool tokens → where they go | Literal colours to replace | Effort |
|---|---|---|---|---|---|
| News | newsprint | 32 | 5: `--rule` → `--line-strong`, `--hairline` → `--line`, `--shadow-pop` → `--shadow-2`, display sizes stay | 0 CSS, 2 TSX | S (1–2 h) |
| Support | counter | 30 | 8: customer and note → slots 3 and 7 soft; `--font` → `--font-body`; `--shadow(-lift)` → `--shadow-1/2` | 1, 6 | S |
| Rooms | blueprint | 35 | 8: `--action` → `--accent`, orange → slot 3, `--link` → `--accent-text`, grid → `color-mix` | 0, 7 | S–M (2–3 h: the accent swap touches many rules) |
| People | gallery | 39 | 9: arches → slots' soft grounds; `--plum` → inverse pair (`--ink` / `--bg`) | 0, 2 | S |
| Expenses | receipt | 29 | 9: green/red/amber → ok/danger/wait (+soft); `--rule` → `--line-strong` | 8, 7 | S–M |
| Quotes | letterpress | 28 | 11: desk/paper/paper-2 → bg/surface/surface-2; serif/sans → display/body; `--shadow-paper` stays (from `--shadow-2`) | 1, 2 | M (2–3 h: renames) |
| Hiring | magazine | 33 | 13: paper/card/cobalt → bg/surface/accent; tomato → slot 3; `--text-display` stays | 6, 6 | M |
| Tasks | workshop | 32 | 16: labels → slots (9 → 8: pick which two share); `--link` → `--accent-text`; `--shadow(-lift)` → `--shadow-1/2`; `--border` → `--border-width` | **27**, 8 | M (3–4 h: most literals) |
| Goals | trail | 32 | 16: on/risk/off → ok/wait/danger; sunrise → slot 3; the dark header (`--top-*`) → inverse pair, contours → `color-mix` | 1, 7 | M |
| Equipment | labels | 36 | 19: `--st-*` statuses → states and slots 1/8; steel shelf → inverse pair; tag → accent | 10, 8 | M |
| Polls | confetti | 31 | 19: coral → accent (ledge → `--accent-line`), mint/sun → ok/wait, `--no` → `--surface-2`; confetti colours → slots | 10, 12 | M (3–4 h) |
| Status | control-room | 37 | 19: `--s-*` states → ok/wait/danger + slots 1/3/7 (maintenance, partial, degraded); `--link` → `--accent-text` | 8, 8 | M |
| Wiki | library | 34 | 20: marker → `--highlight`; added/removed → ok/danger soft; spaces → slots; `--font-read/ui` → display/body; code ground → `--surface-2` | 9, 6 | M |
| Booking | appointment | 36 | 22: free → ok, today → wait, `--c-*` → slots | 1, 8 | M–L (3–5 h: many `--c-*` uses) |
| Clients | sales-desk | 25 | 24: renames (`--sans`/`--mono`, `--text-sm/md/lg`, `--radius-1..3`), won/lost/today/late → ok/danger/wait, `--muted` → `--ink-2` | 1, 7 | L (4–6 h: renames everywhere) |
| Leave | seaside | 40 | 27: 8 kinds → slots (soft + ink, exactly its pairs), "away" → `--surface-2`/`--ink-2`, calendar weekend/holiday/today → `color-mix` and `--wait-soft`/`--accent-text` | 3, 6 | L (4–5 h) |
| Timesheets | instrument | 36 | 27: projects → slots; the dark instrument panel (`--panel-*`, `--signal`) → inverse pair + `--highlight`; charts → slots | 1, 2 | L (4–6 h: the panel is dark in light mode, becomes light in dark mode) |

Roughly **50–60 agent-hours** for the 17, one tool at a time, each
re-verified (tests, build, audit in all looks, screenshots). Order: the S
tools first (they validate the path on real pages), then Leave and Booking
(which prove the categorical palette), then the renames (Clients).

A new tool appeared while this was written — `tools/public-and-private/forms`
(18th). It is not in the catalogue yet: its identity becomes a theme once
its design settles, and it migrates like the others.

## 11. Decisions, and why

| Decision | Why |
|---|---|
| One contract of semantic tokens, not a component library in this step | Tools already share most names; a contract lets every tool keep its components while wearing any look. Components come next (same tokens). |
| Themes are data (`defineTheme`), checked where made | A theme that fails AA is refused before any page sees it; tools need no checks of their own. |
| OKLCH for every derivation | Lightness as the eye sees it: "darker" keeps the hue; brand colours stay recognisable. |
| A per-theme categorical palette | Contrast guaranteed per theme; stable families across themes (section 3). |
| The Chest resolves the two levels | The tool receives one answer; admin logic stays in the Chest; the SDK stays small. |
| Fonts served by the Chest on the tool's origin | Size, unchanged CSP, one place for licences (section 5). |
| `theme()` never throws; kept per Chest's max-age | The look must never break a page; a change shows within minutes without restarting tools. |
| No client script for theming | Works with JavaScript off; no flash of the wrong theme; nothing to hydrate. |
| A dark logo variant in the brand | The sample logo's grey wordmark vanished on dark pages (seen in the pilot's screenshots). |

## 12. Open questions

1. **The portal's Suisse fonts**: does the Chest hold a web licence it can
   serve to tools' origins? If not, the Chest theme renders in Arial and
   Georgia (as shown).
2. **Should an owner pick "light only" for any theme** (not just Chest)?
   The contract supports it (`modes`); the admin does not offer it yet.
3. **Brand approval flow**: should a brand change reach tools at once (as
   designed, within the Chest's max-age) or after a preview is confirmed?
   The design assumes confirm-then-publish in the admin.
4. **Tool icons**: the portal's tiles keep each tool's icon; should brand
   mode tint them? Out of scope here (the icon is `chest/icon.svg`, fixed).
5. **The nine `--line-strong` values under 3:1** in the tools today: fix
   them now, or with the migration?
6. **Custom tools** (the agent that builds tools for customers): they would
   start from the template and default to the company's brand when one is
   set — to confirm with the owner.

## 13. The shared components (0.2.0-studio.1)

The critique (reports/05-critique/_store.md §3) found every tool had built
the same pieces again — 18 copies of one toast, 11 of one dialog, four
kinds of people picker, a native date field in 16 tools. They are now in
the kit, each rebuilt from the best implementation it named and held to
the store's behaviour rules (§2). API: `ui/README.md` "Components".

| Component | Started from | What the kit adds (the critique's point) |
|---|---|---|
| `Toasts` / `useToast` | the identical `components/toast.tsx` | **Undo that tells the truth**: waits while hovered or focused, ≥ 6 s more once the keyboard leaves (WCAG 2.2.1); one toast per action id; `sent` never offers Undo (and removes it from an earlier toast of that id); Undo runs once and says "Undone." or why not; Ctrl+Z / ⌘Z; errors in an assertive region; French « Annuler l’action » |
| `Dialog`, `Confirm` | the identical `components/dialog.tsx` (native `<dialog>`, first field focused) | `useId` ids; `dirty` → Escape, close and backdrop ask "Discard your changes?" inside the dialog; `Confirm` = `alertdialog` for irreversible acts (opens on Cancel, backdrop inert); never `window.confirm`; a bottom sheet on phones |
| `PeoplePicker` | Tasks' card-panel combobox + Equipment's search rule | ARIA 1.2 combobox (`aria-activedescendant`, wrapping arrows, Enter, Escape, Backspace), accent-folding search on any word of the name, Chest groups with their size, recent first, chips, hidden inputs; data from the tool's async `search` |
| `DateField`, `Calendar` | — (native `type="date"` in 16 tools) | typed in the tool's language (`parseDate`: "29/9", "29 sept", "1er octobre", "demain", ISO), the day in words under the field, Today/Tomorrow chips, WAI-ARIA grid calendar; value ISO; `today` from the server |
| `DayStrip` | Rooms' `day-strip.tsx` | links or buttons, names from the words (no Intl) |
| `TimeSelect` + `moveStart`/`moveEnd` | Booking's `time-select.tsx` | step, 24:00 end, odd values kept; the start keeps the duration (the Rooms bug) |
| `FilePicker` + `putWithProgress` | Helpdesk's `file-picker.tsx` | drag and drop, limits stated first, per-file refusals, progress (XHR), remove aborts, retry; server sniffing stays the tool's |
| `DataTable`, `Menu` | Quotes' `ledger.tsx` / `list-page.tsx` | sticky header and totals, `aria-sort`, row headers, a keyboard-complete row menu, empty state, server sort by address or local sort after a click |
| `Filters`, `SearchBox` | Helpdesk's `inbox-filters.tsx`, Quotes' chips, CRM's `slash-search.tsx` | chips as links (`filterHref`: toggles, keeps the search, resets the page), counts, Clear; "/" shortcut |
| `EmptyState` | Status' "Start with an example" | `action` only for who may act, `note` for the others |
| `Avatar`, `AvatarStack` | the 232dc1… avatar, People's portrait | sizes by class (no inline style); a stack whose faces all stay readable, names said once |
| `StatusBadge` | Status' `state.tsx` | a shape per state and a word, never colour alone; category chips on the palette |
| `Tabs`, `Segmented` | Booking's tabs, CRM's segmented | link tabs with counts or a roving tab list; native radios, 2–4 options |
| `AppShell`, `Nav`, `NavLink`, `PageHeader`, `MemberChip`, `NoAccess` | the tools' headers | **the one phone rule**: labelled tabs, never icon-only, never hidden; a row of their own under 760 px; the page's main action at the top (full width on a phone) |
| `LanguageSwitch`, `BrandMark`, `useAutoRefresh`/`AutoRefresh` | the identical `language-switch.tsx`, the template's `brand-mark.tsx`, the identical `auto-refresh.tsx` | framework-free (the tool passes its `Link`, its path, `router.refresh`) |

`mark.tsx` stays in each tool (it is 18 different drawings: it is the
tool's identity, not a component).

**Decisions.**

| Decision | Why |
|---|---|
| A `/components` subpath (client, `"use client"`, named exports) and a server-safe `/components/logic` (pure rules + words) | Next.js turns every export of a client module into a client reference: a server component calling `formatDate` or reading `storeLanguages` from the client barrel would break. `export *` is refused in a client boundary. |
| No word in the kit's components: `labels` props, with `en` and `fr` given as data | Words stay the tool's (one catalogue file per language); a server component can pass them. |
| Dates from the words, never `Intl`; "today" from the tool; sorting by a folded code-point order, not `localeCompare` | Node and browsers write dates (and collate) differently: hydration error 418 (lab/BUILDING.md). Verified: rendering under two time zones gives the same markup; the gallery hydrates with no mismatch. |
| One stylesheet file, classes `ck-…`, contract tokens only; no layer | A file the tool imports: the nonce policy is unchanged, no runtime injection. No `@layer`: a tool's plain element rules (`button {…}`) would otherwise beat every kit rule. Tested: no colour literal, every `var()` a contract token, every class written is styled and vice versa. |
| No inline styles | The CSP allows style attributes today, but nothing needs them (avatar sizes are classes). |
| Keyboards as pure reducers (`listKey`, `menuKey`, `tabKey`, `calendarKey`, `toastReducer`) | Tested without a browser; the components only apply them. |
| Function props (`search`, `upload`, `link`, `onChange`) passed from the tool's own client component | Functions cannot cross from a server component; documented as the one pattern. |
| Ctrl+Z runs the newest Undo | A keyboard user reaches Undo without hunting for the toast; outside text fields only. |

**Verified** (2026-09-29): `npm test` in `ui/` 68/68; `npm run
check:package` passes (packs, installs, imports every subpath from Node and
through esbuild, renders `DateField` inside `Toasts` on the server,
type-checks a consumer); `ui/gallery/components.html` (built by `npm run
gallery`, server-rendered then hydrated) in Chromium: no hydration error,
no console error, no request, axe WCAG 2.1 A/AA clean in Chest, Workshop,
Library and a derived brand, light and dark, English and French, no
sideways scroll at 390 px (`ui/scripts/gallery/check-page.mjs`); 14
keyboard and mouse flows pass (`check-flows.mjs`: Ctrl+Z, hover pause,
sent, one toast per id, failed Undo and focus, dirty dialog on Escape and
backdrop, Confirm, combobox, typed and wrong dates, calendar keys, duration
kept, sort, "/", row menu, tabs). One real bug found by the flows and
fixed: "Keep editing" could not refocus the field while the body was still
inert.

**Not done / limits.** No virtualisation in `DataTable` (fine to a few
hundred rows; beyond, paginate on the server). No CSV export button in
`DataTable` yet (the critique asked for one; each tool's export route
differs). `PeoplePicker` has no "create a person" row (CRM's company
combobox keeps its own). The calendar has no range selection (Leave's
periods). The gallery shows the phone rule at 390 px only in its
screenshot, not side by side.

## 14. Migrating the tools to the components

**The pilot, done: `lab/template`.** Kit re-vendored (0.2.0-studio.1);
`app/chest/layout.tsx` is the kit's `AppShell` with `BrandMark`,
`MemberChip` and `NoAccess`; the notes view uses `Toasts`/`useToast` (one
toast per note, Undo that reports a failure), `Avatar`, `EmptyState`; the
public page `BrandMark` + `LanguageSwitch`; `not-found` `EmptyState`;
`components/toast.tsx`, `avatar.tsx`, `language-switch.tsx`,
`brand-mark.tsx` and `lib/initials.ts` deleted, `auto-refresh.tsx` is three
lines over `useAutoRefresh`; the catalogues gained a `toast` section
(`ToastWords`) and pass the lint (0 errors); `globals.css` lost its shell,
avatar, empty and toast rules. **Verified**: `npm test` 14/14, `npm run
build` (with `tsc`), harness on port 9800 (`--prod --reset`), 14
screenshots (two new: `notes-undo-desktop.png` — the French toast with
« Annuler l’action »; `notes-undone-phone.png` — "Action annulée." after
the Undo), all looked at; `audit.mjs`: no WCAG A/AA rule broken on 9
screens, desktop and phone, light and dark.

**Common steps per tool** (after the theme migration of section 10, or
with it): `node scripts/add-ui.mjs <tool>`; import
`@argentic/chest-ui/components.css` in `app/layout.tsx`; add the kit's
word sections the tool uses to its catalogues (typed `ToastWords`,
`DateWords`…) — « Annuler l’action » for Undo; replace the components
below; delete the tool's copies; `docs/screens.json` entries for a toast
and a dialog; re-run tests, build, screens, audit; `lint-words.mjs` to 0.

| Tool | Kit component → what it replaces | Notes / effort |
|---|---|---|
| Tasks | Toasts (`toast.tsx`), Dialog (`dialog.tsx`), PeoplePicker (`people-picker.tsx`, card-panel assign list + @mention search), DateField (1 `type="date"`), AppShell/Nav (header, icon-only phone nav), Avatar, NavLink, LanguageSwitch, AutoRefresh | the @mention combobox inside the editor stays (text insertion), but uses `searchChoices`; M |
| Wiki | Toasts, Dialog (+ its own confirm → `Confirm`), Menu (`menu.tsx`), AppShell (`shell.tsx` sidebar + hamburger → labelled tabs on phones), Avatar, SearchBox | the sidebar of spaces may stay on desktop; phone rule applies; M |
| Leave | Toasts (already « Annuler l’action »), Dialog, DateField (4 `type="date"`), PeoplePicker (approver select in every row), DataTable (People table), AppShell (nav hidden on phones), Avatar | ranges: two DateFields until a range calendar exists; M |
| News | Toasts, Confirm (2 `confirm(`), DateField, TimeSelect (the composer's schedule), AppShell (nav hidden on phones), SearchBox, Avatar | S–M |
| People | Toasts, DateField (5), PeoplePicker (arrivals "Choose a person"), DataTable (4 tables), AppShell (icon-only phone nav), Avatar/AvatarStack (portrait stays for the gallery's arches) | M |
| Clients (crm) | Toasts, Dialog (11 uses), DateField (3), SearchBox (`slash-search.tsx` → its "/" handler), DataTable, Segmented (Board/List), PeoplePicker (owner select), AppShell ("···" nav) | its company Combobox stays (creates companies); M |
| Expenses | Toasts, Dialog, FilePicker (receipts; `upload.ts` becomes the `upload` function), DateField (2), DataTable, StatusBadge (PAID boxes), AppShell | S–M |
| Support (helpdesk) | Toasts, FilePicker (its own, the model), Filters (`inbox-filters.tsx`), Confirm (2), Menu (`folder-menu.tsx`), AppShell (sidebar), Avatar, StatusBadge (`badges.tsx`) | M |
| Rooms | Toasts (the « Annuler » collision), Dialog, DayStrip (its own, the model), DateField, TimeSelect + `moveStart` (the duration bug), PeoplePicker (guest buttons), AvatarStack (cropped initials), Segmented/Tabs (the overflowing desk toolbar), AppShell | 10 Remove/Supprimer lint errors to settle; M |
| Timesheets | Toasts ("Rétablir" → « Annuler l’action »), DateField (5), DataTable (4), AppShell, Avatar | `work-picker.tsx` (projects) keeps its combobox; M |
| Booking | Toasts, Confirm (`window.confirm` in `type-form.tsx`), TimeSelect (its own, the model), DateField, Tabs (bookings), AppShell; the public month grid stays | S–M |
| Hiring | Toasts (**`sent` for the reject email**; the double toast on drop becomes one id), Dialog, PeoplePicker (interviewers `<select>`), FilePicker (CV; `lib/cv.ts` sniffing stays), DateField (2), AppShell, EmptyState | M |
| Equipment | Toasts, Dialog, PeoplePicker (its own, the rule's source), Filters (four selects → chips), DataTable, StatusBadge (IN USE boxes), Confirm, FilePicker (import), AppShell | M |
| Polls | Toasts, DateField (date polls), EmptyState, AppShell (almost no nav today), AvatarStack, DataTable (results) | S |
| Goals | Toasts, Dialog, Confirm (the red Remove of an objective → Delete + Undo), DateField, AppShell, Avatar (`person.tsx`), StatusBadge (on/risk/off) | S–M |
| Quotes | Toasts, Dialog, DataTable + Filters + SearchBox (`ledger.tsx`, `list-page.tsx`: the models), DateField (its new `date-field.tsx` and 4 `type="date"`), AppShell (`bottom-bar.tsx` check against the phone rule), StatusBadge | its client/item pickers stay (records, not people); M |
| Status | Toasts, TimeSelect (its own + the hour/minute pair), DateField (3), StatusBadge (`state.tsx`, the model), Confirm, AppShell, EmptyState | the public page keeps its identity; M |
| Forms | Toasts, Dialog, DateField (2 in the builder; the runner's date question too), FilePicker (the file question), DataTable (answers), AppShell, Avatar | the runner is public: labels from the respondent's language; M |

Estimate (assumption, from the pilot): 2–4 agent-hours per tool (S 2 h,
M 3–4 h), ≈ 55 h for the 18, best done in the same pass as each tool's
theme migration (section 10) since both touch the same files and need the
same verification. Order: Rooms, Hiring, Booking and Timesheets first
(they carry the four behaviour bugs the kit fixes: the Undo/Cancel
collision, Undo after an email, `window.confirm`, "Rétablir"), then the
16 native date fields.

## 15. The glossary and its lint

`lab/GLOSSARY.md`: Remove / Delete / Erase = Retirer / Supprimer /
Effacer (and when each applies), Undo = « Annuler l’action », Cancel =
« Annuler », Settings = « Réglages », Assign = « Attribuer » / Give =
« Donner », Save, Archive, Restore, Send; confirmations (Undo first,
`Confirm` only for the irreversible, never after an email); date and
time phrasing (relative for recency, absolute for deadlines, day/month/
year, 24-hour); French typography (narrow no-break space before `: ; ? !`
and inside « », guillemets, ’, …). `scripts/lint-words.mjs <tool>` checks
`lib/i18n/en.ts` and `fr.ts` key by key (report only; `--json`; exit 1 on
errors). The kit's words and the template pass it.

Run on the 18 tools, 2026-09-29 (tools unchanged; other builders are
editing them, so these counts move):

| Tool | Errors | of which French spacing | Undo | Remove/Delete/Erase | Settings | Rétablir |
|---|---|---|---|---|---|---|
| crm | 71 | 69 | 1 | 1 | 0 | 0 |
| equipment | 93 | 91 | 1 | 1 | 0 | 0 |
| expenses | 78 | 71 | 2 | 5 | 0 | 0 |
| goals | 35 | 30 | 4 | 1 | 0 | 0 |
| leave | 50 | 50 | 0 | 0 | 0 | 0 |
| news | 60 | 55 | 4 | 0 | 1 | 0 |
| people | 6 | 0 | 5 | 1 | 0 | 0 |
| polls | 51 | 49 | 2 | 0 | 0 | 0 |
| quotes | 136 | 129 | 1 | 6 | 0 | 0 |
| rooms | 48 | 37 | 1 | 10 | 0 | 0 |
| tasks | 75 | 72 | 1 | 2 | 0 | 0 |
| timesheets | 59 | 56 | 1 | 1 | 0 | 1 |
| wiki | 66 | 58 | 4 | 2 | 2 | 0 |
| booking | 75 | 71 | 0 | 2 | 2 | 0 |
| forms | 58 | 52 | 2 | 4 | 0 | 0 |
| helpdesk | 43 | 36 | 3 | 4 | 0 | 0 |
| hiring | 77 | 76 | 1 | 0 | 0 | 0 |
| status | 94 | 88 | 1 | 5 | 0 | 0 |
| **All** | **1,175** | **1,090** | **34** | **45** | **5** | **1** |

No warning fired (no straight quotes, `...`, straight apostrophes,
« Assigner » or "Are you sure" in any tool). The French spacing errors
are almost all a plain space before `:` or inside « » — a mechanical fix
(one script per tool, reviewed); the 34 Undo and 45 verb errors are
wording decisions (some English strings are the ones to change: "This
page … was removed" means deleted). Only People has no spacing error (it
already uses U+202F).

## 16. 0.2.1-studio.1: what the first migrations found (2026-09-29)

The migrations of Booking, Rooms, Timesheets, Hiring, Tasks and Leave
reported 30 gaps; 0.2.1 closes 29 of them, each with a test, and stays
backward compatible (optional props and words, widened types): a tool on
0.2.0 re-vendors with no code change (`lab/template` re-vendored: its
tests and build pass). The full list is the kit's README, "Changelog".
What matters beyond the kit:

- **Layout shift under the pointer.** `DateField` wrote the date in words
  on blur, one line below the field: pressing a button under it blurred
  the field, the line appeared, the button moved, the release landed
  elsewhere and the click was lost. The line is now always reserved.
  The gallery's flows click a button right after typing, and fail
  without the fix. The same class of bug is worth looking for in tools'
  own forms (any text that appears on blur above a button).
- **The categorical palette lost its families.** Workshop's slot inks
  were all black (Rooms, which paints "yours" with `--cat-3-ink`, showed
  black in Workshop); Control room's slot 5 was a red (the danger colour)
  instead of a pink; Magazine's dark slot 3 ground was a plum.
  `checkPalette` (contract) now holds every theme and every derived brand
  to its families; `deriveTheme` lends a brand's colour to a family only
  when it belongs to it (within 30°). Rooms should still paint a fill
  with `--cat-3` (3:1), not with the ink.
- **Signatures kept.** Instrument's `--highlight` is Timesheets' own lime
  `#c6ff3a` (0.2.0 had a pale `#e4f9b0`). The 17 identities were compared
  with their tools' `app/tokens.css` before migration (commit `f703465`):
  the other signatures were kept (accents, markers, the orange, tomato
  and sunrise moved to slot 3 as section 10 planned); a test now holds
  21 of them.
- **Popovers inside dialogs and tables** were clipped by the scrolling
  box around them. Inside any box that scrolls (a `<dialog>`,
  `.ck-table-wrap`), the picker's list, the calendar and the row menu are
  now placed `fixed` against the viewport through the CSSOM (no style
  attribute: the nonce policy is unchanged), flipped above when there is
  no room below. Checked in the browser (the bottom of the list is hit
  by `elementFromPoint` past the dialog's edge).
- **Next.js's `Link`** is a forwardRef object, not a function: the kit's
  link types asked for a function returning an element, so Booking had
  to cast — and `DayStrip` *called* its link, which would have thrown
  with Next's. Types now take a component returning `ReactNode`, and
  `npm run check:package` type-checks the real `next/link` (16.3.6) in
  every link prop.
- **The bell's narrow no-break spaces (Rooms).** The SDK's fake does not
  collapse them: `sdk/client/src/testing.ts` (`cleanTitle`, line 237;
  `cleanText`, line 238) only turns tabs and line breaks into spaces,
  drops control and reordering characters, and trims the ends —
  `String.prototype.trim` does remove a U+202F at the very start or end,
  never inside; `notifications.ts` (line 44) removes the same characters
  and nothing else; the harness's bell (`lab/chest-dev/page.mjs`, line
  28) only escapes HTML. The collapse Rooms saw most likely comes from
  its test's reading of the page: Playwright's text matchers normalise
  whitespace with `\s`, which matches U+202F. Assert on
  `textContent` (or a regex with ` `) to check the character.
- **Not done: a date range.** Leave uses two `DateField`s; a
  `DateRangeField` (one calendar, two ends) is listed for 0.3.

## 17. 0.2.2-studio.1: what sixteen migrations found (2026-09-29)

Sixteen tools on the kit, plus Forms and Quotes migrating, reported
their gaps (the lead's list, one line per finding and tool). All kit items are in 0.2.2, **backward
compatible** (a tool on 0.2.1 re-vendors with no code change: new props
and words optional, types widened, a hand-made 0.2.1 theme still valid).
The changelog in `ui/README.md` has the whole list; what mattered most:

- **A real bug: nested dialogs closed each other (Expenses).** React
  passes a nested `<dialog>`'s `cancel` and `close` events up its own
  tree, so a `Confirm` opened from a `Dialog` closed both. Each dialog now
  answers only its own events. The browser flow (Cancel, Escape and the
  Confirm's action, the Dialog must stay open) fails on 0.2.1's code and
  passes on 0.2.2's — checked both ways.
- **44 px for real.** `ck-button-small` was 36 px (Menu's shown label,
  the calendar's close); sortable headers and link buttons too. Every
  control is now 44 px, or reaches it with an invisible margin (a chip's
  remove button, a segment). check-page measures every control of the
  gallery on a desk and a phone — by its box, or by what answers the
  pointer 22 px around its centre — and the phone header's parts against
  the screen's edge (the member's name sat past it: Quotes).
- **Four contract tokens.** `--inverse` (with `-ink`, `-ink-2`,
  `-line`, measured): a band of its own colour, dark in both modes —
  Equipment's steel bar had collapsed to the ink (black in Chest and
  Blueprint), Timesheets' and Goals' panels turned light in dark mode.
  `--font-read`: long text in a face drawn for it — the Wiki showed
  articles in display faces (Barlow Semi Condensed, Fredoka, Young
  Serif) under other themes; Library reads in Newsreader, Letterpress in
  Libre Caslon Text, the rest in their body face. `--radius-chip`: chips
  and badges square in a square theme. `--field-pad-x`. The 20 themes,
  `defineTheme`, `deriveTheme` (a brand's band is its main colour's deep
  shade) and 1,500 random brands pass the new pairs.
- **Forms is the 20th theme**, "Invitation", with DM Serif Display and
  DM Sans added to the registry (the same Fontsource 5.3.0 files Forms
  serves, byte for byte); its berry is pinned. Fonts declared from files
  now carry a `unicode-range` (two subset files hid each other).
- **What tools had rebuilt around the kit**: a single `PeoplePicker`
  that can be emptied, a `DateRangeField` (0.2.1's deferred item), a
  `Switch`, a `Calendar` of several days, a `Segmented` of links (a view
  in the address), a `Filters` group as a select (30 categories) and one
  scrolling line per group on a phone, `FilePicker` "Take a photo" with a
  preview slot, `DataTable` rows that open a page, a sticky first column
  and cards on a phone, `Menu` items with a second line and downloads,
  toast `onExpire` for deletes done late, `className` everywhere a tool
  restyles.
- **Words.** "Accepted: image" is now "images" / « images », types are
  named once by their extension (JPG, VCF, ODT); the screen-reader
  separator is the words' (a narrow space in French). `lint-words` lets a
  tool quote another product's interface (« Paramètres » of Google) with
  an explicit, listed escape (`quotedUi`, lab/GLOSSARY.md).
- **Server components (Wiki, Support).** Checked in a Next 16.3.6
  production build of a copy of the template: `next/link` imported in a
  server page and passed to `Tabs` is refused ("Functions cannot be
  passed directly to Client Components"); the same `Link` re-exported
  from a one-line `"use client"` file is a client reference and renders.
  The kit's link props now all take a component (`Tabs` and the new
  `Segmented`, `Menu`, `DataTable` included), `LanguageSwitch` takes its
  address as a pattern, and the README gives the one-line re-export.
- **Backward compatibility, checked.** Each of the 18 tools was copied
  to a scratch folder with its own `node_modules` but the 0.2.2 working
  copy in place of its vendored kit, then type-checked (`next typegen` +
  `tsc`) and tested: 0 type errors, every test passing, except one theme
  test each in Tasks and Hiring, which fails the same way on 0.2.1 (both
  are still vendored on 0.2.0: their identity sources predate 0.2.1's
  palette fixes — a tool change, not a kit one). The check found one
  regression, fixed before release: `Tabs`' link prop as a union of two
  function types left an inline `props => <Link …/>` untyped (Rooms);
  it is one function type again, with a test. `lab/template` re-vendored:
  14 tests, build passes.
- **Not in the kit**: the tool bugs of the list (News' raw mention
  tokens in search snippets; the 30 s frame-origin cache in Support,
  Booking, Forms, Status) belong to those tools. The sixteen tools and
  Forms/Quotes must re-vendor (`node scripts/add-ui.mjs <tool>`); the kit
  did not touch `tools/`.

## 18. 0.2.3-studio.1: what the re-vendor and the second critique found (2026-09-29)

The eighteen tools re-vendored 0.2.2 and reported what they still worked
around; the lead added decisions from the store's second critique. All in
0.2.3, **backward compatible** (a tool on 0.2.2 re-vendors with no code
change; a hand-made 0.2.2 theme stays valid). The whole list is the
changelog in `ui/README.md`; what mattered most:

- **Leave's mixed dates were the kit's.** Tabbing into the last day
  selects its text; the blur of the first day moves the last day from
  outside; DateField copied that into its text in an effect, and React's
  write dropped the selection — what the person typed was added after the
  new date ("06/01/202708/01/2027"). The text now follows the value in
  the render (the previous value kept in state), a person's typing is
  kept until read, and a whole date selected stays selected when it
  changes. Two browser flows reproduce it — a value changed after an
  await (the text is checked in the very commit that carries the value),
  and a range's first day then its last day typed at once — and both
  fail on 0.2.2's DateField and pass on 0.2.3's (checked both ways, on a
  copy of the kit with 0.2.2's `date-field.tsx`). Leave's `key` that
  redrew the field can go.
- **The camera's input (Expenses)** stayed, unlabelled, in the tab order
  on a desk (axe "label", critical): hidden with its label now. The
  gallery shows a picker with `camera`; axe fails on 0.2.2's CSS and
  passes on 0.2.3's; the phone still gets "Take a photo" (checked with
  touch emulation — a second page of one browser did not match `pointer:
  coarse` from its options alone, which the phone checks now ask for).
- **The signal on a dark band.** Timesheets' lime and Goals' marker were
  `--highlight`, a dark ground in dark looks: 1.3:1 to 2.6:1 on the band
  in the catalogue's dark schemes. `--inverse-signal` and
  `--inverse-signal-ink` are measured on the band (4.5:1) in every theme,
  mode and brand; Instrument pins its lime in both modes.
- **Public pages** (lead): `resolveTheme(…, { surface: "public" })` — the
  brand in brand mode, the tool's own identity otherwise; never a
  catalogue theme chosen for the team, never the Chest's sheet.
- **Decoration** (critique): `--decor` is `0` in a brand, the Chest's
  sheet and High contrast, `1` elsewhere; a tool keys its patterns on it.
  **High contrast** is AAA: every text pair 7:1 (its category labels
  were 5.4–6.9:1). **Ten hard brands** (near-white, neons, near-black,
  brown, two alike, pure yellow, grey, a red like the errors', a pastel,
  a light yellow) pass every pair and keep the palette's families; the
  harness has a second sample brand (`brand:port`, Café du Port: a light
  yellow, navy, sharp, compact).
- **Phone navigation** (critique): a section's name broke inside a word
  in a wide face ("Entrepris/es"). It wraps at spaces only; a word too
  wide ends in "…" (the link's name stays whole). check-page reads every
  word's lines in every look, both languages, at 390 and 320 px and in a
  wide face; it fails on 0.2.2's CSS. "Or drop them here" is gone on
  touch screens.
- **The Chest theme stays light only** (the owner's sheet): intended and
  documented — `color-scheme: light` gives light scrollbars and fields on
  a dark computer, the browser's bar gets the light ground. A tool must
  not set `color-scheme` or change colours in its own
  `prefers-color-scheme: dark` block (Equipment, Goals and Forms have
  such blocks; Goals' can now use `--inverse-signal`).
- **Components**: `Filters` sections (optgroups), `allLabel`, the
  in-page mode (`value`/`onChange`), no "Clear filters" beside a lone
  select's own "All", and colours on a coloured band set from the band's
  measured pair (axe-checked on the orange slot's band in five looks);
  `DateRangeField` `keepLength`, `ids`, `below`, `chips`, `length`;
  `DataTable`'s phone cards no longer label their header; the member
  chip keeps one line; `FilePicker` `previewSize` and `storedFile()`;
  `Checkbox`, with the rule — at once: `Switch`; on Save: checkbox.
  Sales desk's chips are square in the catalogue itself (`radius.chip`
  3), so CRM can drop its `.ck-badge` override and stay equal to it.
- **Backward compatibility, checked** — see the list of tools below (each
  copied once, then checked with the packed 0.2.2 and with the packed
  0.2.3 on the same copy: `next typegen` + `tsc`, and its tests). All
  eighteen give identical results with both kits. Twelve are clean (CRM,
  Equipment, Goals, Leave, News, Polls, Timesheets, Wiki, Forms, Support,
  Hiring, Status: 0 type errors, every test passing). Six were being
  edited by their own sessions while this ran and fail the same way on
  0.2.2 as on 0.2.3, which makes them tool changes: Expenses (3 tests),
  People (4 type errors, 1 test), Tasks (31 type errors, 8 test files),
  Rooms (1 test), Booking (8 tests), Quotes (3 type errors, 1 test). An
  earlier full run of an intermediate 0.2.3 build had all of these at 0 type
  errors, with only Leave failing tests (in the same mid-edit window).
  `lab/template` re-vendored: 14 tests, build passes. `check:package`
  passes (the size budget moved from 300 to 350 KB: 308 KB packed).
- **Tool matters, not the kit's**: Quotes' logo hint repeats the kit's
  "Accepted: PNG, JPG" line (the kit says the limits; a tool's hint never
  repeats them); CRM's `.ck-badge { border-radius: var(--radius-s) }`
  overrides every theme's corners (now unneeded); Leave's `key={endField}`
  (now unneeded); Timesheets and Goals should move their band's signal to
  `--inverse-signal`; seed content's language is each tool's.

## 19. 0.2.4-studio.1: what the tools found on 0.2.3 (2026-09-29)

Four reports from the tools on 0.2.3, and a check of every item still
open in the lead's list. All in 0.2.4, **backward compatible** (new
props optional, no type narrowed, no token renamed: a tool on 0.2.3
re-vendors with no code change). The whole list is the changelog in
`ui/README.md`; what mattered most:

- **A refused date left the old one to be saved (Timesheets).** DateField
  already said "Choose … or later." under a day typed before `min`, but
  the tool's state and the hidden input still held the previous date, so
  Save sent "today" in place of refusing. Now the typed text stays, the
  field is `aria-invalid` and reads the sentence (`aria-describedby`),
  the input carries it as its custom validity — **a form's submit stops
  on the field** and the browser points at it — the hidden input of
  `name` is empty, and `onProblem` tells a tool whose Save is a button's
  `onClick` to wait. The same holds after `max` and for a text it cannot
  read. The rule is a pure function, `readTypedDate` (in
  `/components/logic`, tested in both languages); check-flows plays the
  case (a day before `min`, then Save: the previous day is not saved;
  then a good day: saved) and fails with the validity line taken out.
  **Decision: `onChange` is not called on a refused text.** Sending
  `null` was built first and dropped: of the tools' 43 files with a
  `DateField`, Tasks saves a card's start or due date on every
  `onChange` (`updateCard(card.id, { due })`), so a typo would have
  erased the date on the server. A Save that is a button's `onClick`
  rather than a form's submit needs `onProblem` to refuse; which tools'
  Saves are such was not checked field by field.
- **"À rembour…" (Expenses).** 0.2.3's rule (wrap at spaces, "…" for a
  word too wide) held, but the tabs were equal slices of the row
  (`minmax(64px, 1fr)`), so a word wider than its slice — "rembourser",
  "Entreprises" — ended in "…" while "Accueil" had room to spare. The
  row is now `minmax(min-content, 1fr)`: equal while every word fits, a
  tab widened by its longest word otherwise; padding 2 px, a face of at
  most 12 px (13 px in Library, Seaside, Portrait gallery, Counter,
  Magazine, Confetti, Trail and High contrast); "…" only for one word
  wider than 40% of the row. Measured in the gallery's frame (338 px
  inside a 390 px phone): no name cut in any of the five looks; before,
  "À rembourser" and "Entreprises" were cut in four. At 320 px the five
  French names need a little more than the row and it scrolls sideways
  a few pixels (it did in 0.2.3 too, with names cut). Counts moved 6 px
  right (`50% + 12px`): they touched the icon's right edge before.
  check-page fails on either, and does on 0.2.3's CSS (checked both:
  four looks with both names cut; two counts on their icons).
- **Stacked tables clipped long labels (Forms).** A line's label was
  `flex: none`: a form's question kept its full width and pushed its
  answer past the card. It wraps now, at most 60% of the line. check-page
  gives four lines a long question on a phone and fails on 0.2.3's CSS
  (the label overflowed its cell by about 160 px), passes on 0.2.4's.
- **Already done, checked in the code and tests:** "Or drop it here" on
  touch screens (0.2.3: hidden under `pointer: coarse` and `hover: none`
  — Forms, now on 0.2.3, keeps a local rule written before it); the row header's `data-label` (0.2.3);
  `acceptText`'s JPG once, VCF, ODT/ODS/ODP and "images" in words
  (0.2.2); Menu item `id`, `ck-button-small` at 44 px, `PeoplePicker
  clearable`, Filters optgroups (0.2.2–0.2.3). `acceptText` now also
  names ODG, ODF, XLSM, DOCM, PPTM, ICO, EPUB and GZ, and never a
  "+suffix" or a version number ("GRAPHICS", "12" before).
- **Not the kit's:** Wiki's save status cut off on phones is Wiki's own
  `.save-status` (`white-space: nowrap` + ellipsis in its
  `globals.css`), no kit component; News' raw `@[mbr_…]` in search
  snippets and the frame-origin cache in Support/Booking/Forms/Status
  stay tool bugs. After re-vendoring, Forms can drop two local rules
  (`.ck-drop-hint`, the stacked label's `flex`).
- **Checks:** 148 node tests (139 before, 9 in `test/kit-024.test.tsx`),
  check-page and check-flows pass, `check:package` passes. The tools
  are not re-vendored in this step (the lead does it).

## 20. 0.2.5-studio.1: a corrected date and Save in one move (2026-09-29)

- **The bug (Support's "day off" form, Quotes' payment dialog).** 0.2.4
  said a refused date in a sentence under the field and read the typed
  text only on blur. A person who corrected the date and clicked the
  Save below the field blurred it with the press: the sentence went,
  everything below moved up by its height before the release, and the
  click landed on nothing. Nothing was saved and nothing said so.
- **The fix.** The DateField re-reads its text on every input with the
  same rule (`readTypedDate`). A new problem is still said only on blur.
  A problem already said goes as soon as the text reads as an accepted
  date; when that text is a whole date — `typedDateComplete` (new, pure,
  in `/components/logic`): a four-digit year at its end, ISO, eight
  digits, ymd with a two-digit day, or today/tomorrow/yesterday — the
  date is sent at once (`onChange`, `onProblem(null)`, the hidden
  input). A text that could still grow into another day ("29/10";
  "1/1/20", which the parser reads as 2020) only hides the sentence and
  is read on blur, the field staying invalid (validity, empty hidden
  input, `onProblem` not yet null) until then; "1/1/2" never reads. The
  validity and `onProblem` moved to a layout effect so the click that
  follows a blur finds them already set. Without a problem nothing is
  read before blur (an auto-saving field is not sent each day on the
  way). `DateRangeField` uses two DateFields and inherits it.
- **Verified.** check-flows, in Chromium with `page.click`: refuse
  "01/01/2020" (blur, sentence shown), fill a date 40 days ahead, click
  Save — the new date is saved and the button is where it was. Run on
  0.2.4 first: it failed (the previous day stayed saved). It also plays
  "29/10"-style text (sentence gone, value not sent, saved on the
  click's blur), "1/1/2" (sentence stays, value untouched), and a
  range's end corrected after a refusal (sentence gone and length
  counted before any blur). `test/kit-025.test.tsx` types a dozen dates
  a character at a time in three orders and checks no prefix is ever
  sent as another day. 153 node tests (148 before, 5 new; kit-024's
  exact version check became "0.2.4 or later"), check-flows, check-page
  and `check:package` pass; dist and gallery rebuilt.
- **Assumed, not checked.** A tool that shows its own error from
  `onProblem` (in place of the kit's sentence) still loses the kit's
  help for a date typed without its year: its line goes on blur. The
  tools are not re-vendored in this step.

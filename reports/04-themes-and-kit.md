# Themes and the UI kit — one look per company, or one per tool

*Written 2026-09-28. What is verified is marked as such; the rest is design
or assumption, said so.*

## 1. In short

The owner wants each company to personalise its Chest: **keep each tool's
own identity**, **pick one theme for all its tools**, or **wear its own
brand** (colours, fonts, logo) — and, on top, **choose otherwise for any one
tool**. Same features; only the look changes; every text stays readable.

What now exists:

| Piece | Where | State |
|---|---|---|
| The UI kit `@argentic/chest-ui` 0.1.0-studio.1 | `ui/` (working copy, like `sdk/`), vendored by `scripts/add-ui.mjs` | 31 tests pass; package check passes (Node, esbuild, TS bundler + nodenext); 112 KB packed |
| The token contract | `ui/tokens/CONTRACT.md`, typed in `ui/src/contract.ts` | 81 tokens (47 colours and 3 effects per mode, 31 shared); 59 measured pairs per mode (text 4.5:1, non-text 3:1) |
| The catalogue: 17 tool identities + "Chest" + "High contrast" | `ui/src/themes.ts` | all 19 pass every pair, light and dark (tested) |
| Brand derivation `deriveTheme(brand)` | `ui/src/derive.ts` | AA guaranteed: 1,500 seeded random brands in the tests (and 3,000 more in a one-off run) with zero failure; notes in English and French |
| Brand import `importBrand(text, filename)` | `ui/src/import.ts` | W3C design tokens, Tokens Studio, CSS, colour lists; 6 realistic fixtures in `ui/test/fixtures/` |
| Runtime | `resolveTheme`, `themeStyle`, `<ThemeStyle>` | server-side only, no client script; strict CSP unchanged |
| SDK proposal `chest.theme()` | `sdk/client/src/chest.ts`, SDK 0.3.0-studio.11 | two levels (all tools, per tool), `fakeChest({theme, themeFiles})`; 5 new tests, 65 pass; package check passes |
| Harness | `lab/chest-dev/` | "/_dev → Look": all tools / this tool; serves the kit's fonts and a sample brand; `screens.mjs` and `audit.mjs` take `"look"` |
| Gallery | `ui/gallery/index.html` (`npm run gallery`), linked from `showcase/index.html` | 19 themes side by side, light and dark, EN/FR; "Your brand" live demo; opens offline (verified: no request leaves the page) |
| Pilot | `lab/template` migrated | tests (PGlite and PostgreSQL), build, manifest check, screenshots in 4 looks, axe audit (WCAG 2.1 A/AA) in all looks, light and dark: pass |

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

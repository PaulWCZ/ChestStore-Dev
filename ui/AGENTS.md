# Using `@argentic/chest-ui` — a guide for AI agents

For an agent building or migrating a Chest tool (a store tool, or a custom
tool for a customer). `README.md` is the reference; `tokens/CONTRACT.md`
the list of tokens; this page is the short path and the mistakes to avoid.

## The short path

1. `node scripts/add-ui.mjs <tool folder>` (and `scripts/add-sdk.mjs` for
   `chest.theme()`, SDK 0.3.0-studio.11 or later).
2. The tool's identity: `defineTheme({...})` in `lib/theme.ts` (or
   `identityOf("<tool>")` for a store tool of the catalogue). Its fonts:
   registered ids (`font("inter")`…), files in `public/fonts/` with the
   same names (`scripts/add-font.mjs` copies them; its `app/fonts/*.css` is
   then not needed — the kit writes the `@font-face`).
3. `currentLook = cache(async () => resolveTheme(await chest.theme(), identity))`;
   the pages of a public host use `resolveTheme(…, identity, { surface:
   "public" })` (0.2.3: the brand, or the tool's own look — never a
   catalogue theme chosen for the team).
4. `<head><ThemeStyle look={look} nonce={nonce} /></head>` in the root
   layout; `themeColor: lookColors(look)` in `generateViewport`.
5. CSS: contract tokens only. Tool tokens are aliases of contract tokens.
6. Test: `checkTheme(identity)` and `validateTheme(identity)` are empty; the
   look follows `fakeChest({ theme: { all, tools } })`; no colour literal in
   the tool's CSS (model: `lab/template/test/theme.test.ts`).
7. Harness: `/_dev` → "Look": all tools / this tool; `docs/screens.json`
   entries may carry `"look": {"all": "catalogue:<id>", "tool": "brand:sample"}`
   and `lab/chest-dev/audit.mjs` audits them.

## Rules

- **Never a colour in a tool's CSS.** `#fff`, `white`, `rgb()` do not follow
  the theme. Use `--surface`, `--ink`… A needed colour that is not in the
  contract is a tool token defined from contract tokens.
- **Text only on measured pairs.** Text on `--accent` is `--accent-ink`;
  on `--cat-N-soft` it is `--cat-N-ink`; on `--highlight`, `--ink`; on a
  state's soft ground, its `-ink`. `color-mix()` is for decoration only,
  and `in oklab` (never `in oklch`: a white or a grey has no hue, and
  Chrome swings the mix through pink or blue).
- **Field borders are `--line-strong`**, hairlines `--line`. A control's
  edge that must be seen uses `--accent-line` (Workshop's yellow buttons
  need an ink edge).
- **A state or a category always has a word** (and a shape for a state):
  in the Chest theme they have no colour at all.
- **Weights come from tokens**: headings `--display-weight`, emphasis
  `--weight-strong` (400 in the Chest theme, which forbids synthetic bold).
- **Targets stay 44 px** (`--control-h`); motion uses `--fast`/`--slow`
  (0 under reduced motion).
- **Map categories once**: slot 1 blue, 2 green, 3 orange, 4 violet,
  5 pink, 6 teal, 7 ochre, 8 slate in every theme.
- **The look is resolved on the server**: no client script, no cookie of
  the tool's own, no switch in the tool — the company chooses in its Chest.
- **Show `look.logo` in brand mode** beside the tool's name, with its dark
  variant in a `<picture>`; the tool's own mark otherwise.
- **Log `look.problem`**, never show it: the page falls back to the
  identity.

## Components (`@argentic/chest-ui/components`)

- Use the kit's component before writing one: toast, dialog, people
  picker, date/time fields, file picker, table, filters, search, empty
  state, avatars, badges, tabs, the shell (README "Components").
- `import "@argentic/chest-ui/components.css"` once, in the root layout.
- Words: `labels={kitWords[locale].<section>}` (from
  `@argentic/chest-ui/components/logic`), or the tool's own catalogue
  section of the same type. Never an English string in a component call.
- `today` for date components comes from the server (the Chest's time
  zone); never `new Date()` in a client render.
- Function props (`search`, `upload`, `onChange`, `link`) are passed from
  the tool's own `"use client"` component, not from a server component.
- Reversible act → toast with `undo`; the act already left (email, bell) →
  `sent: true`; irreversible → `Confirm`. Never `window.confirm`.
- Navigation: `AppShell` + `Nav` (labelled tabs); the page's main action in
  `PageHeader`. Pass Next's `Link` as it is (`link={Link}`, 0.2.1: no
  wrapper, no cast); a section current on other paths takes `also`.
- A category's fill is `--cat-N` (3:1) or `--cat-N-soft`; `--cat-N-ink`
  is for its text. A catalogue's date words go through `dateWords()`.
- `useToast()` returns `ShowToast`, `(input) => string` (the toast's id).
  Where a callback must return nothing — React's `startTransition`, a
  prop typed `() => void` in a strict position — use braces:
  `startTransition(() => { toast(t.saved); })`, not
  `startTransition(() => toast(t.saved))` (a `string` is not `void`
  there). An act done late (a delete sent once its Undo can no longer be
  used) goes in `onExpire` (0.2.2).
- A region of its own colour (a header bar, a panel) is `--inverse` with
  `--inverse-ink` / `--inverse-ink-2` / `--inverse-line` (0.2.2), never
  `--ink` as a ground; the tool's signal there (a current tab's rule, a
  Start button) is `--inverse-signal` with `--inverse-signal-ink` on its
  fill (0.2.3), never `--highlight` (a dark ground in dark looks); long text (an article, a page) is
  `font-family: var(--font-read)`; a tool's own field lines up with the
  kit's with `padding: 0 var(--field-pad-x)`; a chip or badge of the
  tool's own takes `border-radius: var(--radius-chip)`.
- Controlled `Segmented`: change the value you pass at once (state or
  `useOptimistic`) when `onChange` starts something slow; a view kept in
  the address is its link variant (options with `href`).
- On/off (0.2.3): takes effect at once → `Switch`; waits for the form's
  Save → `Checkbox` (never a switch that looks done before Save).
- Decoration (graph paper, stripes, a sunset) reads `--decor` (0.2.3):
  `opacity: var(--decor)` on its layer, or a mix at `calc(var(--decor) *
  40%)` — it steps aside in a brand, the Chest's sheet, High contrast.
- Filters kept in the page (a dialog, a panel): `value` + `onChange`
  (0.2.3). On a coloured band set `--ck-filters-ink` / `--ck-filters-link`
  on the band to its measured pair (`--cat-N-ink` on `--cat-N-soft`).
- A file stored before (an expense's receipt): `storedFile({ ref, name,
  size })` in the FilePicker's list (0.2.3).
  The FilePicker says its limits (how many, how big, which kinds): a
  tool's own hint beside it never repeats them.
- Every control stays 44 px: `ck-button-small` is smaller words, not a
  smaller target (0.2.2). A row that opens a page: `DataTable rowHref`,
  not an `onClick` on a `<tr>`.
- A `Confirm` inside a `Dialog` is fine (0.2.2: each closes alone).
- A server component may pass `link={Link}` only as a client reference:
  `next/link` imported there is a plain function and React refuses it.
  Keep `components/link.tsx`: `"use client"; export { default as Link }
  from "next/link";` and import `Link` from it in server components.
  `LanguageSwitch href="/p/{code}"` is plain data. `search`, `onChange`,
  `upload`, `onNavigate` still come from a client component.

## Pitfalls

| Symptom | Cause |
|---|---|
| The theme's `<style>` is blocked | No nonce: read it from the request's `content-security-policy` (`nonceOf`) — `proxy.ts` sets it there. |
| Fonts do not load in catalogue mode | The Chest (or the harness) does not serve `/_chest/theme/fonts/`; pages fall back to the stacks. Check `dev.mjs` found `ui/fonts/`. |
| `Cannot find module next/headers` in tests | A module the tests import reads `next/headers`: keep the nonce in the layout, not in `lib/theme.ts`. |
| Colours stay the identity's with a catalogue choice | `chest.theme()` answer kept: the real Chest's max-age (≤ 5 min); in tests `forgetTheme()`. |
| `validateTheme` refuses a stack | Quote family names with spaces (`'Segoe UI'`), no `var()`, no `;`. |
| `Attempted to call … from the server` | A pure helper was imported from `/components` (a client boundary) into server code: import it from `/components/logic`. |
| Hydration error 418 around a date | A date formatted with `Intl` or `new Date()` in a client render: use `formatDate(iso, words)` and a `today` from the server. |
| A brand's font is missing | Its `id` is not in the registry: `deriveTheme` uses Inter and says so in `notes`. |
| A region's colours vanish (transparent, or the page's) | Its CSS redefines `--accent` (or another token) from a tool token that is itself `var(--accent)`: a cycle, which the browser drops. Take the region's colour from a contract token that never names it (tokens/CONTRACT.md, "A tool's own tokens", rule 5). |
| Two subset files of a font of the tool's own hide each other | Give each file its `range` (unicode-range) in the `FontSpec` (0.2.2), or use a registered font id. |
| `Functions cannot be passed directly to Client Components … link: function` | `next/link` passed from a server component: import `Link` from a `"use client"` re-export instead (above). |
| A Save sends the old date after a day before `min` was typed | Kit 0.2.3: re-vendor 0.2.4 — a form's submit then stops on the field. A Save that is a button's `onClick` (not a form's submit) listens to `onProblem` and waits while it is not `null`. |
| A click on Save right after correcting a refused date does nothing | Kit 0.2.4: re-vendor 0.2.5 — the sentence under the field goes while the good date is typed, so the blur of the press moves nothing. A tool's own `error` shown from `onProblem` still moves on blur for a date without its year ("29/10"); prefer the kit's sentence. |
| A section's name ends in "…" on a phone ("À rembour…") | Kit 0.2.3: re-vendor 0.2.4 (whole names first). A tool's own rule for the nav's labels, a stacked table's labels or the drop hint on touch screens can go. |
| A date typed right after another field moved it shows both texts | Kit 0.2.2's DateField: re-vendor 0.2.3 (the text follows the value in the render); a `key` that redraws the field is no longer needed. |
| The current tab's rule or a Start button vanishes on a dark band in a dark look | It uses `--highlight` (a dark ground in dark looks): use `--inverse-signal` / `--inverse-signal-ink` (0.2.3). |
| A public page wears a catalogue theme (or the Chest's sheet) | Its look is resolved without `{ surface: "public" }` (0.2.3). |
| `lint-words` flags another product's menu (« Paramètres » of Google) | Quote it in guillemets and list it in `export const quotedUi = […]` beside the catalogue (lab/GLOSSARY.md, "Quoting another product"). |

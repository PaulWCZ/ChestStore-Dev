# Chest UI kit

`@argentic/chest-ui` is the look of a Chest tool. A company chooses once, in
its Chest, how its tools look — **each tool keeps its own identity**, or
**one theme of the catalogue** for all of them, or **its own brand** (its
colours, fonts, corners and logo) — and may choose otherwise for one tool.
The kit makes all three work in any tool, with the same features, and
keeps every text readable (WCAG 2.2 AA) whatever the choice:

- a **token contract** (`tokens/CONTRACT.md`): the CSS custom properties
  every theme defines, light and dark, and the contrast pairs every theme
  must pass;
- a **catalogue** of 19 themes: the 17 identities of the store's tools,
  "Chest" (the portal's own sheet, light only) and "High contrast";
- **`deriveTheme(brand)`**: a whole theme from a company's colours, fonts,
  corners and density, light and dark, AA guaranteed, and plain notes (in
  English and French) of what was adjusted;
- **`importBrand(text, filename)`**: the company's brand file — W3C design
  tokens, Figma Tokens Studio, a CSS file, a list of colours — read into a
  brand, with notes of each guess;
- the **runtime**: `resolveTheme()` (the Chest's choice first, the tool's
  identity otherwise) and `themeStyle()` / `<ThemeStyle>` (one `<style>`
  with the page's nonce). No script runs in the browser for theming.

It is the studio's working copy (like `sdk/`): it is never published. A
tool gets a packed copy in its own `vendor/`:

```sh
node scripts/add-ui.mjs tools/private/<name>    # packs ui/ into the tool's vendor/, sets the dependency, reinstalls
```

Node 22 or later, ESM, TypeScript declarations included. No dependency;
React is an optional peer (only for `@argentic/chest-ui/react`).

## Imports

| Import | Gives |
|---|---|
| `@argentic/chest-ui/runtime` | `resolveTheme`, `themeStyle`, `lookCss`, `lookColors`, `lookNotes`, `nonceOf`, types `Look`, `ThemeChoice`: the page's look, on the server |
| `@argentic/chest-ui/react` | `ThemeStyle`: the same `<style>`, as a React element (a server component in Next.js) |
| `@argentic/chest-ui/themes` | `catalogue`, `themes`, `themeOf(id)`, `identityOf(tool)`, `catalogueFonts` |
| `@argentic/chest-ui/derive` | `deriveTheme`, `BrandError`, `logoUrlPattern`, types `Brand`, `BrandFont`, `BrandLogo`, `Derived`, `Corners`, `Density` |
| `@argentic/chest-ui/import` | `importBrand`, `maxImportSize`, types `Imported`, `ImportFormat` |
| `@argentic/chest-ui/contract` | `colorTokens`, `effectTokens`, `staticTokens`, `allTokens`, `pairs`, `checkTheme`, `ratios`, `validateTheme`, `categories`, `controlHeight`, `themeIdPattern`, types `Theme`, `Scheme`, `Pair`, `Failure`, `Words` |
| `@argentic/chest-ui/fonts` | `registry`, `font(id)`, `systemFont`, `uploadedFont`, `fontFaces`, `fontFiles`, `closestFont`, patterns, types `FontSpec`, `FontEntry`, `FontSource` |
| `@argentic/chest-ui/color` | `parseColor`, `hex`, `oklch`, `oklchHex`, `contrast`, `luminance`, `fit`, `mix`, `hueDistance`, `colourWord`… |
| `@argentic/chest-ui` | all of the above but React, and `defineTheme` (a tool's own identity), `completeScheme`, `category`, `note`, `themeCss`, `staticDeclarations`, `schemeDeclarations`, `themeColors` |

## A tool, in four steps

**1. Its own identity is a theme.** Every colour of the tool lives here,
nowhere else; what it leaves out (states' soft grounds, the categorical
palette, lines that must be seen…) is derived with the contract's contrast.

```ts
// lib/theme.ts
import { defineTheme } from "@argentic/chest-ui";
export const identity = defineTheme({
  id: "notes",
  name: { en: "Notes", fr: "Notes" },
  description: { en: "Calm, plain, friendly.", fr: "Calme, simple, amical." },
  fonts: { display: "figtree", body: "figtree" },     // registered fonts, files in the tool's public/fonts/
  radius: { s: 6, m: 10, l: 16 },
  light: { bg: "#f7f6f2", surface: "#ffffff", ink: "#1c1b18", "ink-2": "#57544c", line: "#dedbd1", accent: "#2b59c3", "accent-ink": "#ffffff" },
  dark:  { bg: "#161614", surface: "#201f1c", ink: "#f2f0ea", "ink-2": "#b5b1a6", line: "#3a3833", accent: "#8fb0ff", "accent-ink": "#0f1a33" },
});
```

A tool whose identity is in the catalogue may use it directly:
`identityOf("tasks")`.

**2. The look of a request: the Chest's choice, else the identity.**

```ts
import * as chest from "@argentic/chest-sdk/chest";          // SDK 0.3.0-studio.11 (Proposal (studio))
import { resolveTheme } from "@argentic/chest-ui/runtime";
import { cache } from "react";
export const currentLook = cache(async () => resolveTheme(await chest.theme(), identity));
```

`chest.theme()` never throws (outside a Chest, or on a Chest without
themes, it answers "own"); `resolveTheme` never throws either — a theme id
it does not know, or a brand it cannot read, is the identity, with the
reason in `look.problem` for the logs.

**3. One `<style>` in the head, with the page's nonce.**

```tsx
// app/layout.tsx (Next.js)
import { ThemeStyle } from "@argentic/chest-ui/react";
import { lookColors, nonceOf } from "@argentic/chest-ui/runtime";
export async function generateViewport() { return { themeColor: lookColors(await currentLook()) }; }
export default async function RootLayout({ children }) {
  const look = await currentLook();
  const nonce = nonceOf((await headers()).get("content-security-policy"));
  return <html lang={locale}><head><ThemeStyle look={look} nonce={nonce} /></head><body>{children}</body></html>;
}
```

A plain `node:http` tool writes `themeStyle(look, nonce)` into its
`<head>`. The strict policy of the studio's tools (`style-src 'self'
'nonce-…'`, `font-src 'self'`, `img-src 'self'`) admits it as it is.

**4. CSS names only contract tokens.** `var(--accent)`, `var(--ink-2)`,
`var(--cat-3-soft)`, `var(--radius-m)`, `var(--control-h)`… — never a
colour. A tool's own tokens are defined from contract tokens
(`tokens/CONTRACT.md`, "A tool's own tokens"). In brand mode,
`look.logo` (`{url, alt, dark}`) is the company's logo, to show beside the
tool's name (a `<picture>` with its dark variant).

## Themes

| Id | Name (en / fr) | From | Fonts |
|---|---|---|---|
| `workshop` | Workshop / Atelier | Tasks | Space Grotesk + Inter |
| `library` | Library / Bibliothèque | Wiki | Newsreader + Source Sans 3 |
| `seaside` | Seaside / Bord de mer | Leave | Nunito + Nunito Sans |
| `newsprint` | Newsprint / Papier journal | News | Fraunces + Libre Franklin |
| `gallery` | Portrait gallery / Galerie de portraits | People | Outfit |
| `sales-desk` | Sales desk / Bureau des ventes | Clients | IBM Plex Sans + Mono |
| `receipt` | Receipt / Ticket de caisse | Expenses | Public Sans + JetBrains Mono |
| `counter` | Calm counter / Comptoir calme | Support | Atkinson Hyperlegible |
| `blueprint` | Blueprint / Plan d’architecte | Rooms | Albert Sans + DM Mono |
| `instrument` | Instrument / Instrument | Timesheets | Manrope + Martian Mono |
| `appointment` | Appointment card / Carte de rendez-vous | Booking | Young Serif + Figtree |
| `magazine` | Magazine / Magazine | Hiring | Bricolage Grotesque + Instrument Sans |
| `labels` | Tool crib / Magasin d’outillage | Equipment | IBM Plex Sans + Mono |
| `confetti` | Confetti / Confettis | Polls | Fredoka + Plus Jakarta Sans |
| `trail` | Trail map / Carte de randonnée | Goals | Barlow Semi Condensed + Work Sans |
| `letterpress` | Letterpress / Typographie | Quotes & invoices | Libre Caslon Text + Hanken Grotesk |
| `control-room` | Control room / Salle de contrôle | Status | Red Hat Text + Mono |
| `chest` | Chest / Chest | the portal's sheet | "Suisse" (Arial) + "Works" (Georgia); light only |
| `high-contrast` | High contrast / Contraste élevé | — | Atkinson Hyperlegible |

All 19 pass every pair of the contract in both modes (the tests hold them
to it). `ui/gallery/index.html` shows them side by side (`npm run
gallery`).

**The "Chest" theme** follows the portal's design sheet at the owner's
request: black and white, radius 0, weight 400 only with
`font-synthesis: none`, hierarchy by size and tracking, blue only for
focus, brick only for errors, **no dark mode** (`modes: "light"`). States
are not colours in it (tools show them with a shape and a word), and its
categories are warm greys (told apart by their label). The sheet's field
border (`#bfbfb7`, 1.8:1 on white) is below WCAG 1.4.11's 3:1: the theme's
`--line-strong` is `#8a8a83` (3.5:1). The Suisse fonts are declared, not
shipped: a Chest that holds a licence serves them (`faces` of the
choice), otherwise pages use Arial and Georgia.

## Brands

```ts
import { deriveTheme } from "@argentic/chest-ui/derive";
const { theme, notes, logo } = deriveTheme({
  name: "Atelier Martin",
  primary: "#e4572e", secondary: "#17bebb", neutral: "#5e6b68",
  display: { id: "young-serif" }, body: { id: "work-sans" },  // or { family, files: [{url, weight, style}] } for the company's own font
  corners: "round", density: "comfortable",
  logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" },
});
// notes[0].en: "Your red was darkened a little so the white text on buttons is easy to read."
// notes[0].fr: "Votre rouge a été un peu foncé pour que le texte blanc des boutons se lise facilement."
```

How: in OKLCH (lightness as the eye sees it, hue kept). Greys take a
whisper of the grey tint (or of the main colour). The main colour is kept
as the button's fill when white text reads on it (4.5:1); a light colour
(a yellow) keeps its fill with dark text and a dark edge; otherwise its
lightness moves just enough. In dark mode it is lightened to read on dark
grounds. The second colour becomes the marker pen and joins the
categorical palette with the main one; states keep their usual hues (a
note warns when the brand's colour is close to the red of errors or the
green of success). Every pair is then measured; a failure is the kit's
bug, never the company's (`deriveTheme` throws a plain `Error`). The
tests derive 1,500 seeded random brands and extreme ones (black, white,
pure yellow, grey) with zero failure. `BrandError` (`code`:
`invalid_primary`, `invalid_secondary`, `invalid_neutral`, `invalid_font`,
`invalid_logo`, `invalid_name`, `invalid_option`) is a brand the kit cannot
read. Results are cached (16 brands) — a page derives once.

## Brand files

```ts
import { importBrand } from "@argentic/chest-ui/import";
const { brand, notes, format, colours, fonts } = importBrand(text, "brand.tokens.json");
if (brand) deriveTheme(brand);
```

| Format | Read |
|---|---|
| W3C Design Tokens (`$value`, `$type`) | groups, inherited `$type`, aliases `{a.b}`, colour strings and `{colorSpace, components, hex}`, `fontFamily`, `typography.fontFamily`, `dimension` radii |
| Tokens Studio (`value`, `type`) | sets, aliases without the set name, `color`, `fontFamilies`, `borderRadius`, `typography` |
| CSS | custom properties (`var()` followed), `font-family` of `h1`–`h3` and `body`, `border-radius`; French names too (`--couleur-marque`, `--police-titres`, `--arrondi`) |
| A list | hex, `rgb()`, `hsl()`, `oklch()`, one per line or not, named by the words before them ("Primary: #0E7C66") |

Guesses: the main colour is the one named primary (primaire, principal),
then brand (marque), then main or accent — in a scale, its middle
(500/600), and the most vivid; else the most vivid of the file. The
second is named secondary, else the next vivid of another hue (35° away).
State colours (success, error, warning…) are never taken. Fonts: named
heading/display/title, and body/text; one unknown to the kit is replaced
by one of its kind, and the note says so. Corners: the file's typical
radius. At most 1 MiB and 5,000 tokens; no network, no evaluation.

## Fonts

The catalogue's 30 fonts are OFL-1.1, from Fontsource 5.3.0 (the packages
and versions the tools already self-host), latin and latin-ext subsets,
WOFF2 only: **2.5 MB in `ui/fonts/`, each with its licence file**
(`LICENSE-<id>.txt`), fetched by `npm run fonts`.

**They are served by the Chest, not shipped in each tool.** The npm
package holds only their registry (`src/fonts-data.ts`): 112 KB packed. A
tool keeps its own identity's fonts in its `public/fonts/` (served at
`/fonts`, as today). When the company chose a catalogue theme or a brand,
the Chest's front serves the fonts under `/_chest/theme/fonts/` on the
tool's own hosts (and a brand's uploaded fonts and logo under
`/_chest/theme/brand/`). Why:

- **size**: every catalogue font in every tool would be 2.5 MB × 17
  repositories (and in the studio's git, at every re-vendor), for fonts
  most companies never pick;
- **CSP**: the files are on the tool's origin, so `font-src 'self'` and
  `img-src 'self'` admit them, with no policy change; the `<style>` that
  names them carries the page's nonce;
- **licences**: OFL-1.1 allows redistribution with the licence: the Chest
  serves `LICENSE-<id>.txt` beside each font. A company's uploaded font is
  the company's responsibility (the admin confirms its web licence when
  uploading); the portal's Suisse is served only by a Chest that holds a
  licence for it;
- **before the Chest serves them** (a real Chest today): `chest.theme()`
  answers "own", so nothing asks for them; a catalogue theme whose fonts
  are missing still renders with its fallback stacks.

The studio's harness serves `ui/fonts/` exactly there
(`lab/chest-dev/dev.mjs`), and the gallery inlines the latin subsets.

## Safety

- `themeCss` writes only values `validateTheme` accepted: colours as
  `#rrggbb`, shadows and overlays of a fixed grammar, font stacks of names,
  font and logo addresses as paths on the tool's origin; and any `<` is
  escaped, so a theme can never close its `<style>`.
- `themeStyle` / `ThemeStyle` refuse a nonce that is not base64.
- Brand names are cleaned of control characters and bounded; an uploaded
  font's family is renamed "Brand <family>" so it is never mistaken for
  an installed font.

## Develop

```sh
npm ci
npm test                # build dist/, compile the tests into build/, run them (node --test)
npm run check:package   # npm pack, install into a temp project, import every subpath from Node and esbuild, type-check a TS consumer
npm run gallery         # ui/gallery/index.html
npm run fonts           # fetch the catalogue's fonts again (network)
```

`src/` holds the modules, `test/` the tests and `test/fixtures/` realistic
brand files, `scripts/` the fonts, gallery and package scripts,
`tokens/CONTRACT.md` the contract. TypeScript strict, ES2022, NodeNext.
Adding a theme: a source in `src/themes.ts` (the tests then hold it to
the contract), its fonts in `scripts/fetch-fonts.mjs`. Adding a language:
one more entry per message in `src/notes.ts` and in each theme's `name`
and `description`.

## Licence

MIT (`LICENSE`), © 2026 Argentic. The fonts in `fonts/` are under the SIL
Open Font License 1.1, each with its licence file.

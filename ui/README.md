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
- a **catalogue** of 20 themes: the 18 identities of the store's tools,
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
React is an optional peer (only for `@argentic/chest-ui/react` and the
components).

## Imports

| Import | Gives |
|---|---|
| `@argentic/chest-ui/runtime` | `resolveTheme`, `themeStyle`, `lookCss`, `lookColors`, `lookNotes`, `nonceOf`, types `Look`, `ThemeChoice`: the page's look, on the server |
| `@argentic/chest-ui/react` | `ThemeStyle`: the same `<style>`, as a React element (a server component in Next.js) |
| `@argentic/chest-ui/components` | the store's shared React components (client components): `Toasts`/`useToast`, `Dialog`, `Confirm`, `PeoplePicker`, `DateField`, `DateRangeField`, `Calendar`, `MonthField`, `DayStrip`, `TimeSelect`, `FilePicker`, `DataTable`, `Menu`, `Filters`, `SearchBox`, `EmptyState`, `Avatar`, `AvatarStack`, `StatusBadge`, `Tabs`, `Segmented`, `Switch`, `Checkbox`, `AppShell`, `Nav`, `NavLink`, `PageHeader`, `MemberChip`, `NoAccess`, `LanguageSwitch`, `BrandMark`, `AutoRefresh`/`useAutoRefresh`, the hook `useFloat` and `storedFile` (see "Components") |
| `@argentic/chest-ui/components/logic` | their rules as pure, server-safe functions, and their default words `en`, `fr`, `kitWords`, `wordsFor(locale)`, `storeLanguages` |
| `@argentic/chest-ui/components.css` | the components' stylesheet (contract tokens only) |
| `@argentic/chest-ui/themes` | `catalogue`, `themes`, `themeOf(id)`, `identityOf(tool)`, `catalogueFonts` |
| `@argentic/chest-ui/derive` | `deriveTheme`, `BrandError`, `logoUrlPattern`, types `Brand`, `BrandFont`, `BrandLogo`, `Derived`, `Corners`, `Density` |
| `@argentic/chest-ui/import` | `importBrand`, `maxImportSize`, types `Imported`, `ImportFormat` |
| `@argentic/chest-ui/contract` | `colorTokens`, `optionalColorTokens`, `schemeWithDefaults`, `effectTokens`, `staticTokens`, `allTokens`, `pairs`, `checkTheme`, `checkPalette`, `categoryFamilies`, `paletteLimits`, `ratios`, `validateTheme`, `categories`, `controlHeight`, `themeIdPattern`, types `Theme`, `Scheme`, `Pair`, `Failure`, `Words` |
| `@argentic/chest-ui/fonts` | `registry`, `font(id)`, `systemFont`, `uploadedFont`, `fontFaces`, `fontFiles`, `closestFont`, patterns, types `FontSpec`, `FontEntry`, `FontSource` |
| `@argentic/chest-ui/color` | `parseColor`, `hex`, `oklch`, `oklchHex`, `contrast`, `luminance`, `fit`, `mix`, `hueDistance`, `colourWord`… |
| `@argentic/chest-ui` | all of the above but React, and `defineTheme` (a tool's own identity), `completeScheme`, `category`, `note`, `themeCss`, `staticDeclarations`, `schemeDeclarations`, `themeColors`, `chipRadius` |

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

**A public page (0.2.3)** — the tool's public host: careers, a status
page, a booking page, a contact or public form — passes the surface:

```ts
export const publicLook = cache(async () => resolveTheme(await chest.theme(), identity, { surface: "public" }));
```

It wears the company's **brand** in brand mode and the tool's **own
identity** otherwise: a catalogue theme is a choice made for the team's
pages (for all tools, or for this one), and the Chest's sheet never
dresses a public page (brief/05). The team's pages keep the default
(`surface: "team"`).

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
| `forms` | Invitation / Invitation | Forms | DM Serif Display + DM Sans (0.2.2) |
| `chest` | Chest / Chest | the portal's sheet | "Suisse" (Arial) + "Works" (Georgia); light only |
| `high-contrast` | High contrast / Contraste élevé | — | Atkinson Hyperlegible |

Long text reads in each theme's `--font-read` (0.2.2): its body face,
except Library (Newsreader) and Letterpress (Libre Caslon Text), faces
drawn for reading. Each theme also has a band of its own colour,
`--inverse` (a header bar, a panel), dark in both modes: Tool crib's
steel, Instrument's ink-green panel, Trail map's forest margin; the ink
elsewhere (tokens/CONTRACT.md). On that band a tool's signal —
Timesheets' lime Start and current tab, Goals' marker — is
`--inverse-signal`, with `--inverse-signal-ink` for words on its fill
(0.2.3): measured on the band in every theme and mode (the marker pen,
`--highlight`, is a *dark* ground in dark looks and vanished there).
Instrument pins its lime in both modes. `--decor` (0.2.3) is `1`, or `0`
where the tool's decoration steps aside (graph paper, stripes, a sunset):
a company's brand, the Chest's sheet, High contrast. High contrast holds
every text pair at 7:1 (WCAG AAA, 0.2.3). Sales desk's badges and chips
are square (`radius.chip` 3, 0.2.3: CRM's look, now in the catalogue's
identity, so CRM's own copy stays equal to it and another theme gives
CRM its own corners).

All 20 pass every pair of the contract in both modes, and all but Chest
keep each categorical slot in its colour family (`checkPalette`) (the
tests hold them to it). `ui/gallery/index.html` shows them side by side (`npm run
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
tests derive 1,500 seeded random brands, extreme ones (black, white,
pure yellow, grey) and ten hard ones (a near-white, neons, near-blacks, a
brown, two alike, a red like the errors', a pastel, Café du Port's
yellow) with zero failure (0.2.3). A brand's theme says `decor: false`
(`--decor: 0`): its pages are the company's, not the tool's. `BrandError` (`code`:
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

The catalogue's 32 fonts are OFL-1.1, from Fontsource 5.3.0 (the packages
and versions the tools already self-host), latin and latin-ext subsets,
WOFF2 only: **2.4 MB in `ui/fonts/`, each with its licence file**
(`LICENSE-<id>.txt`), fetched by `npm run fonts`.

**They are served by the Chest, not shipped in each tool.** The npm
package holds only their registry (`src/fonts-data.ts`): 112 KB packed. A
tool keeps its own identity's fonts in its `public/fonts/` (served at
`/fonts`, as today). When the company chose a catalogue theme or a brand,
the Chest's front serves the fonts under `/_chest/theme/fonts/` on the
tool's own hosts (and a brand's uploaded fonts and logo under
`/_chest/theme/brand/`). Why:

- **size**: every catalogue font in every tool would be 2.4 MB × 18
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


## Components

`@argentic/chest-ui/components` holds the pieces every store tool had
built for itself (reports/05-critique/_store.md §3), rebuilt once from the
best of the 18 tools, and held to the store's behaviour rules (§2): an
Undo that tells the truth, dialogs that never lose what was typed, one
phone navigation rule, never the browser's date field.

**Rules they all follow.**

- **Styled only by contract tokens** (`css/components.css`, every class
  `ck-…`): they wear the tool's identity, any catalogue theme, any brand,
  light and dark. Import the stylesheet once, in the root layout:
  `import "@argentic/chest-ui/components.css";` — a file, no runtime
  style injection, no inline style: the studio's nonce policy is
  unchanged.
- **No word of their own.** Every text comes from a `labels` prop, typed
  (`ToastWords`, `DateWords`…). The kit gives English and French:
  `import { kitWords } from "@argentic/chest-ui/components/logic"` then
  `labels={kitWords[locale].toast}` — plain data, so a server component
  may pass it. French follows the store glossary (`lab/GLOSSARY.md`):
  Undo is « Annuler l’action », narrow no-break spaces before `: ; ? !`.
- **Server-render safe.** No `Intl` formatting, no clock, no random in a
  render: dates are written from the words, "today" is given by the tool
  (from `chest.timeZone()`, on the server), sorting uses a
  machine-independent order. The tests render every component under two
  time zones and compare; the gallery hydrates them in a browser and shows
  any mismatch (React error 418).
- **Accessible, keyboard complete** (WCAG 2.1 AA): the ARIA patterns
  (combobox, menu button, tabs, grid date picker, alertdialog), 44 px
  targets, visible focus, live regions present from the first render; the
  keyboards are pure functions (`listKey`, `menuKey`, `tabKey`,
  `calendarKey`) with their own tests.
- **Client components** (`"use client"`, named exports only, as Next.js
  requires). Functions cannot cross from a server component: a prop that
  is a function (`search`, `onChange`, `upload`) is passed from the
  tool's own client component. A **link component** can, as a client
  reference (0.2.2): `next/link` imported in a server component is a plain
  function, which React refuses to send ("Functions cannot be passed
  directly to Client Components"); re-exported from a `"use client"` file
  it is a reference, which React sends. So a tool keeps one line —
  `components/link.tsx`: `"use client"; export { default as Link } from
  "next/link";` — and a server component writes `<Tabs link={Link} …>`,
  `<Segmented link={Link} …>`, `<LanguageSwitch link={Link} …>`,
  `<Menu link={Link} …>`. Checked in a Next 16.3.6 production build of
  the template (a server page: `next/link` directly gives the error
  above; the re-export renders the links). What stays a function has a
  data form: `LanguageSwitch href="/p/{code}/pricing"`.

### Toasts — Undo that tells the truth

```tsx
<Toasts labels={kitWords[locale].toast}>{page}</Toasts>        // once, around the page
const toast = useToast();
toast({ id: `delete-${id}`, text: t.deleted, undo: async () => (await restore(id)).ok || t.errors.tooLate });
toast({ id: `reject-${id}`, text: t.rejectionSent, sent: true });   // the email left: never an Undo
toast({ text: t.errors.unavailable, tone: "error" });
```

`undo` resolves `true`/nothing when it worked, `false` or a sentence (in
the reader's language) when it did not; the toast then says "Undone." or
why. A toast waits while hovered or focused and gets at least 6 s more
once the keyboard leaves it (WCAG 2.2.1); 6 s plain, 10 s with Undo or an
error; **one toast per `id`** (showing it again replaces it); at most
three. `sent: true` never offers Undo, even if one was passed, and turns
an earlier toast of the same id into "sent". **Ctrl+Z / ⌘Z**, outside a
text field, runs the newest Undo (`aria-keyshortcuts`). `action: { label,
run }` (0.2.1) is one more button beside Undo ("Keep 1 min", "Open"):
`run` is called once and the toast goes (`close: false` keeps it); a
toast with an action stays 10 s. It never reverses the act — that is
`undo`. Rules in
`toast-state.ts` (`toastReducer`, tested without a browser).

`onExpire` (0.2.2) is called once when a toast goes while what it tells
still stands — its time is up, it was dismissed, replaced by one of the
same id, pushed out by newer ones, or its Undo failed; never after an
Undo that worked. For an act done late (a delete sent to the server only
when its Undo can no longer be used): `toast({ id, text: t.deleted, undo:
() => { cancel(id); return true; }, onExpire: () => void erase(id) })`. A
page closed before never calls it: such an act must be safe to lose.

### Dialog and Confirm

```tsx
<Dialog open={open} title={t.newBoard} onClose={close} dirty={name !== ""} labels={kitWords[locale].dialog}
  footer={<><button className="ck-button ck-button-quiet" onClick={close}>{t.cancel}</button><button className="ck-button">{t.create}</button></>}>
  …fields…
</Dialog>
<Confirm open={asking} title={t.eraseTitle} body={t.eraseBody} confirmLabel={t.erase} cancelLabel={t.cancel} onConfirm={erase} onCancel={() => setAsking(false)} />
```

Native `<dialog>` (focus trapped and restored by the browser). Opens on
its first field; ids from `useId`. `dirty`: Escape, the close button and
the backdrop ask "Discard your changes?" inside the dialog (never
`window.confirm`); "Keep editing" returns to the field. `Confirm` is an
`alertdialog` for irreversible acts only: opens on Cancel, the backdrop
does nothing, Escape cancels. `size`: `s`, `m`, `l`; a bottom sheet under
520 px.

A `Confirm` (or a `Dialog`) opened from inside a `Dialog` closes alone
(0.2.2): each dialog answers only its own `cancel` and `close` events —
React passed a nested dialog's events up to the one around it, and
closing the inner one closed both (Expenses).

### PeoplePicker

```tsx
<PeoplePicker label={t.guests} multiple value={guests} onChange={setGuests} name="guests"
  search={q => searchPeople(q)}               // the tool's server action, or localSearch(team)
  suggestions={recentPeople} labels={kitWords[locale].peoplePicker} lang={locale} />
```

The ARIA 1.2 combobox (`aria-activedescendant`, arrows wrap, Enter
chooses, Escape closes, Backspace removes the last chip). While an answer
is on its way the list says so (`aria-busy`) and nothing in it is active:
Enter then chooses nothing, and Enter in the picker never sends the form
around it while its list is shown (0.2.1). `suggestionsLabel` names the
suggestions when they are not the person's recent choices
(`labels.suggested`: "Suggested" / « Suggestions »); `hideLabel` keeps the
label for screen readers only (a picker in a table cell). Choices are
`{ kind?: "member" | "group", id, name, detail?, photo?, size? }`: Chest
groups appear under their own heading with their size. Nothing typed:
`suggestions` (the person's recent choices first — keep them with
`rememberRecent`). The search rule (`matches`, `searchChoices`,
`localSearch`): accents and case aside, the start of any word of the name,
words in any order ("lé", "mor", "lea mo"), recent first, then groups,
then people, 50 at most. With `name`, hidden inputs carry the ids.

`clearable` (0.2.2): a single choice that may be left empty shows a
button that takes the person away (`onChange([])`, named "Remove Léa
Moreau"); erasing the name did it too, but nobody saw it. `className`.

### DateField, Calendar, DayStrip, TimeSelect

```tsx
<DateField label={t.due} value={due} onChange={setDue} today={today} min={today} name="due" labels={kitWords[locale].date} />
<DayStrip days={next10} current={day} today={today} href={d => `/chest?day=${d}`} link={Link} labels={kitWords[locale].date} />
<TimeSelect id="start" value={slot.start} onChange={s => setSlot(moveStart(slot, s))} step={15} />
<TimeSelect id="end" value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end />
```

`DateField`'s value is an ISO date or `null`. It reads what people type in
their language (`parseDate`: "29/09/2026", "29/9", "29 sept", "1er
octobre", "Oct 5, 2026", "demain", ISO), says a wrong date in words,
writes the day in full under the field ("Tomorrow · Wednesday 30
September 2026"), offers Today and Tomorrow chips (or `chips`), and a
calendar popover (the WAI-ARIA date picker: arrows, Home/End, Page
Up/Down, Shift for a year). Never `<input type="date">`. `DayStrip`:
Rooms' strip of big day tiles (links or buttons), scrolling sideways on a
phone. `TimeSelect`: a 24-hour list every `step` minutes, `end` offers
24:00; `moveStart` keeps the duration when the start moves (the Rooms
bug), `moveEnd` never lets the end pass the start.

`MonthField` (0.2.1): a month (`"2026-09"`), the month in words in a list
with the previous and next month one tap away (`min`/`max`, default a
year back and two ahead; words from `DateWords`). `TimeSelect` takes
`empty="No break"` for an optional time: a first choice whose value is
`""` in a form and `null` for `onChange`. The date words of a tool's own
catalogue (a JSON file, where `order` is a string and `weekStart` a
number) go through `dateWords(words)` (from `/components/logic`), which
checks them and gives `DateWords`. The date in words under a `DateField`
keeps its line even while empty (0.2.1): it appears on blur, and a line
appearing then moved the button under the pointer.

**Popovers escape their frame (0.2.1).** The picker's list, the
calendar and a row's menu inside a `<dialog>`, a table's scrolling frame
or any box that scrolls are placed over it (fixed to the viewport,
flipped above the field when there is no room below), never cut at its
edge; elsewhere the CSS places them as before.

**0.2.2.** `DateField`: `label` may hold more than words (a required
mark); `hideLabel`; `describedBy` (the tool's own lines, read after the
kit's); `variant="compact"` — the field and its calendar only, no chips,
the date in words read but not shown (a table cell); `onEnter(iso)`
(Enter, once the date is read: a tool that sends its form on Enter);
`className` and `data-*` on its root. `Calendar`: `multiple` with
`selected` (several days; a click, Enter or Space adds or takes one away
and the calendar stays; `aria-multiselectable`), `inline` (part of the
page), `labelledBy`; `onClose` is optional.

**0.2.3.** A value changed from outside (the other end of a range moved
it, a reset, a server's answer) is the field's text in the same render —
0.2.2 copied it in an effect, later, and a person who had just tabbed
into the field and typed got both texts ("25/01/20272027-01-28",
Leave). While the person is typing, their text stays until it is read
(blur, Enter); a whole date selected when it changes stays selected, so
typing replaces it. A tool no longer needs to redraw the field (Leave's
`key={endField}` can go). Words passed as a new object each render no
longer reset what is being typed.

```tsx
<DateRangeField label={t.leave} value={range} onChange={setRange} today={today} min={today}
  names={{ from: "from", to: "to" }} labels={kitWords[locale].date} lang={locale} />
```

`DateRangeField` (0.2.2, the range 0.2.1 deferred): two `DateField`s
under one name ("From" / « Du », "To" / « Au »), how many days under them
("3 days", both ends counted). Moving the first day keeps the length
(`moveRangeStart`), the last is never before the first (`moveRangeEnd`,
`rangeDays` — in `/components/logic`). Its words are optional
(`rangeFrom`, `rangeTo`, `rangeDays` in `DateWords`).

**0.2.3.** `keepLength={false}`: moving the first day leaves the last
(unless passed) — a filter's "from … to …" (`moveRangeStart(range, from,
{ keepLength })`); `ids` (`{ from, to }`, the two text fields'); `below`
(`{ from, to }`: something of the tool's own under each end — Leave's
half days); `chips` (the first day's: `true` for Today and Tomorrow, or a
list); `length` (the tool's own count in place of "3 days": "2.5 days
off"). Without them, 0.2.2's markup.

### FilePicker

```tsx
const [files, setFiles] = useState<readonly PickedFile[]>([]);
<FilePicker label={t.receipts} files={files} onChange={setFiles} maxFiles={5} maxSize={10 << 20}
  accept={["image/*", ".pdf"]} capture="environment" name="receipts" labels={kitWords[locale].files}
  upload={async (file, { onProgress, signal }) => {
    const grant = await askUploadUrl(file.type, file.size);          // the tool's server: files.uploadUrl
    if (!grant.ok) return { ok: false, error: t.errors[grant.error] };
    const sent = await putWithProgress(grant.url, file, { headers: { "Content-Type": file.type }, onProgress, signal });
    return sent.status < 300 ? { ok: true, ref: grant.name } : { ok: false, error: t.errors.upload };
  }} />
```

Several files by the button or by dropping them; the limits said before
one tries ("Up to 5 files, 10 MB each. Accepted: image, PDF."); refusals
per file (too big, wrong kind, too many); progress per file; remove
(aborts an upload in flight) and retry. `filesReady(files)` before a
form submits. Without `upload`, files stay in the browser (an importer
reads `file`). **Sniffing the bytes on the server stays the tool's job**
(Hiring's `lib/cv.ts`). With `maxFiles={1}` it says "or drop it here"
(`labels.dropOne`, « ou déposez-le ici »); full, only its button fades —
the limits beside it stay readable (0.2.1).

**0.2.2.** `camera` (a phone's "Take a photo" beside "Choose a file";
elsewhere the one button — `capture` alone still opens only the camera);
`preview(file)`: something of the tool's own before each file's name (a
thumbnail: the stored file's own address once sent, or
`URL.createObjectURL(file.file)` where the tool's policy has `img-src
blob:` — the kit does not know the tool's policy, so it draws none);
`showLabel`; `id` (the file input's); `className`.
"Accepted:" names families in words (`image/*` → "images" / « images »),
each type once by its usual extension (JPG and JPEG are one; `text/vcard`,
`text/x-vcard` and `.vcf` are VCF; OpenDocument is ODT/ODS/ODP), and
leaves out what a family already says (`acceptText(accept, words)`). The
words between the button and the field's name come from the words
(`separator`: ": ", French « » + narrow space). New words (`takePhoto`,
`chooseFile`, `kinds`, `separator`) are optional: a 0.2.1 catalogue gets
the kit's English for them.

**0.2.3.** The camera's input is hidden with its label off a touch
screen (`display: none`: no tab stop, nothing read — 0.2.2 left the
input, unlabelled, in the tab order: axe "label"); "Take a photo" is a
phone's only. `previewSize` (`"s"` 40 px, `"m"` 64 px, `"l"` 96 px: a
receipt one recognises). `storedFile({ ref, name, size?, type? })` (in
`/components` and `/components/logic`): a file stored before the page
opened — a form that edits an expense shows its receipt, "Saved"
(`labels.stored`, optional), removable, sent back as its `ref`, never
uploaded again:

```tsx
const [files, setFiles] = useState(() => expense.receipts.map(r => storedFile({ ref: r.name, name: r.filename, size: r.size })));
```

### DataTable and Menu

```tsx
<DataTable caption={t.quotes} rows={rows} rowKey={r => r.id} rowName={r => r.number}
  columns={[
    { key: "number", label: t.number, value: r => r.number, rowHeader: true, width: "narrow" },
    { key: "client", label: t.client, value: r => r.client },
    { key: "state", label: t.state, render: r => <StatusBadge tone={tones[r.state]} label={t.states[r.state]} /> },
    { key: "total", label: t.total, value: r => r.total, render: r => r.totalText, align: "end" },
  ]}
  totals={{ total: grandTotalText }} actions={r => [{ label: t.duplicate, onSelect: … }, { label: t.delete, tone: "danger", onSelect: … }]}
  sort={sort} sortHref={s => `?sort=${s.key}&dir=${s.dir}`} empty={<EmptyState … />} labels={kitWords[locale].table} />
```

Sticky header (and totals) inside a scrolling region reachable by the
keyboard; sortable columns (those with `value`) with `aria-sort`; sorting
by the tool (`sort` + `onSort`, or `sortHref` for a server sort in the
address) or, without them, here after a click; a row header per row;
`hideOnPhone` columns; a `Menu` of rare actions per row (the ARIA menu
button: arrows, Home/End, a letter, Escape returns focus). `Menu` is also
usable alone. `rowProps={r => ({ className, "data-state": … })}` gives a
row its own class and data- attributes (nothing else) (0.2.1). A sortable
header's button inherits the header's typography (case, tracking, small
caps).

**0.2.2.** `DataTable`: `header` on a column (what its header shows —
an icon, a line break; `label` stays its name), `className` on a column's
cells, `className` and `id` on the table; `stickyFirst` (the first column
stays while the table scrolls sideways); `phone="stack"` (under 640 px,
each row a card of labelled lines — the header hides, so sorting is on
wider screens); `rowHref(row)` with `link` (the whole row opens a page: its
header cell is the link, the rest of the row answers the pointer, its own
buttons and links keep working; with `stickyFirst` the link covers its
cell only). `Menu`: `id` on an item (two items of one label — two people
named alike — no longer share a key), `note` (a second line), `download`
(a link that downloads: a plain `<a>`), `link` (Next's `Link` for `href`
items), `size` ("s", the default, or "m") for a shown label — both 44 px —
and `className`.

**0.2.3.** `phone="stack"`: the row's header heads its card
("F-2026-014"), it is no longer a labelled line of it ("Number
F-2026-014").

### Filters and SearchBox

```tsx
<Filters path="/chest/quotes" params={searchParams} link={Link} labels={kitWords[locale].filters}
  groups={[{ key: "state", label: t.state, all: true, options: states.map(s => ({ value: s, label: t.states[s], count: counts[s] })) }]} />
<SearchBox action="/chest/quotes" value={q} keep={{ state }} labels={kitWords[locale].search} />
```

Filters are links (`filterHref`: a chip toggles, the search stays, the
page resets): a filtered list is shareable and Back works, with or without
script; counts on each chip; "Clear filters" when one is on. A group
with `multiple: true` holds several values, comma-separated in the
address (`f=screen,dock`): each chip adds or takes away its own
(`paramValues` reads them). A group with `required: true` always has one
value (`value` when the address names none): no "All", no let-go, and
"Clear filters" leaves it (0.2.1). `SearchBox` is a GET form
(`role="search"`), "/" focuses it from anywhere but a field
(`shortcut`), or `onSearch` for a list filtered in the page; `maxLength`
(200 by default) and `autoFocus` (0.2.1).

**0.2.2.** `clearAlso`: other parameters "Clear filters" takes away too,
and that make it appear (a date range). `as: "select"` on a group: a list
to choose from, for a group of many options — it goes to its address when
chosen (`onNavigate(href)` from a client component, else its form is
sent; a "Show" button where no script runs). `phone="scroll"`: on a
phone each group keeps one line that scrolls sideways. `className`.
`SearchBox`: `minLength`, `required`, a list of values in `keep`
(`{ tag: ["a", "b"] }`), `className`.

**0.2.3.** A select's options may name their section (`group: "Hardware"`):
each section is an `<optgroup>`, in the order they first appear, options
without one first. `allLabel` on a group: the words of its "All" chip or
its select's empty choice ("Anyone", "Every category"). "Clear filters"
no longer shows when one select is the only filter on (its own "All"
does the same). **In-page mode**: `value` and `onChange(next)` in place
of `path`/`params` — the filters are the page's state (a list in a
dialog, a panel): chips are buttons (`aria-pressed`), a select and
"Clear filters" call `onChange` with the next values, by the address's
rules (`filterValues`, `clearValues` in `/components/logic`).

```tsx
const [value, setValue] = useState<Record<string, string>>({});
<Filters value={value} onChange={setValue} labels={kitWords[locale].filters} groups={[…]} />
```

**On a band of its own colour** (Tasks' board colour), set on the band
the two colours the filters write there, to the band's measured pair:
`--ck-filters-ink` (the groups' names; default `--ink-2`) and
`--ck-filters-link` ("Clear filters"; default `--accent-text`) — on
`--cat-N-soft` both `var(--cat-N-ink)`; on `--accent-soft`, `--ink` and
`--accent-text`; on `--inverse`, `--inverse-ink-2` and `--inverse-ink`.
The chips keep their own ground. The gallery measures it (axe) on the
orange slot's band in every look.

### EmptyState, Avatar, AvatarStack, StatusBadge, Tabs, Segmented

- `EmptyState({ title, body, action, example, note, icon })`: pass
  `action` only when the viewer may act; otherwise `note` says who can
  ("An admin adds the rooms."); `example` is "Start with an example".
- `Avatar({ name, photo, size: "s"|"m"|"l"|"xl", label })`: decorative
  unless `label`; `AvatarStack({ people, max })`: every face readable,
  "+2", the names said once.
- `StatusBadge({ tone: "ok"|"wait"|"danger"|"info"|"neutral", label })`:
  a shape **and** a word; `category={1…8}` for a category chip (its label
  is what tells it). Faces in a stack never cover each other's initials
  (no overlap at `s`, 0.2.1); `initials` leaves out a trailing note in
  brackets ("Léa Dubois (former member)" → "LD").
- `Tabs({ items: [{ id, label, count, href }], current, label })`: links
  when the items have `href` (the usual case), else a tab list with a
  roving focus and a panel. `Segmented`: 2 to 4 native radios; `disabled`
  on it or on one option; the word is the target (the radio is hidden
  without covering it) (0.2.1).

**0.2.2.** `StatusBadge`: `className`; `icon` with a `category` (in
place of its dot); `empty` — the dashed badge of what is not there yet
("No owner yet"). Badges, chips, counters and filter chips take
`--radius-chip`: square in a square theme (the Chest), pills elsewhere.
`Segmented` is controlled: a tool whose `onChange` starts something slow
(a server action, then a refresh) changes the value it passes at once
(its own state, or React's `useOptimistic`), or the choice shows the old
value until the answer comes, then jumps (People). A view kept in the
address is the **link variant**: options with `href` are links, the
current one `aria-current="page"` (CRM's Board / List). `className` on
`Segmented` and `Tabs`; `Tabs`' `link` takes any link component.
`Switch({ label, checked, onChange, name, hint })`: something on or off
that takes effect at once (a checkbox with the switch role; Space
toggles; a form sends `value` when on) — not for a choice that waits for
a Save.

**0.2.3 — the rule for on/off.** An act that takes effect at once is a
`Switch`; a choice that waits for the form's Save is a checkbox, which
never looks like it already did something: `Checkbox({ label, checked |
defaultChecked, onChange?, name, value, hint, required })` — the native
box at 20 px in the accent, its words the 44 px target, controlled or
left to the form (no script needed).

### AppShell, Nav, PageHeader — the one navigation rule

```tsx
// components/shell.tsx of a Next.js tool ("use client")
const path = usePathname();
<AppShell brand={<a href="/chest"><Mark />{t.name}</a>} nav={items} path={path} link={Link}
  member={{ name, role: t.roles[role], photo }} labels={kitWords[locale].shell}>{children}</AppShell>
```

Sections are **labelled tabs, never icons alone, never hidden** (no
hamburger, no "···"): in the header on a wide screen, in a row of their
own under it under 760 px (icon above the word, five at most). The member
chip at the right ("Camille Martin · Manager"; on a phone the name is
read, the avatar shown). `PageHeader({ title, intro, action, size })`:
the page's main action at the right of its title, a full-width button
under it on a phone; `size="m"` for a smaller title (`--text-xl`;
default `"l"`, `--text-2xl`) (0.2.1). `NoAccess` for a role that gives
nothing; `LanguageSwitch` (public part) with `storeLanguages` (from
`/components/logic`); `BrandMark({ logo, ground })` for `look.logo`
(`ground="inverse"` on a dark header in a light look, and the other way
round; `"dark"`/`"light"` for a ground that stays so — 0.2.1; the logo is
scaled whole, at most `--ck-logo-max` wide, 160 px by default, a third of
a phone's width); `NavLink` / `isCurrent` for other links;
`useAutoRefresh(router.refresh, 20)` (the Chest has no WebSocket).

**Links (0.2.1).** Every `link` prop (`AppShell`, `Nav`, `NavLink`,
`Tabs`, `DayStrip`, `Filters`, `LanguageSwitch`) takes Next.js's `Link`
as it is — `import Link from "next/link"; … link={Link}`, no wrapper, no
cast: a link component returns a `ReactNode` (`LinkComponent`,
`LinkProps`). A wrapper written for 0.2.0 still fits. A section stays
current on other pages with `also` (path prefixes: `{ href: "/chest",
label: t.bookings, also: ["/chest/new", "/chest/b"] }`), and `match:
"exact" | "prefix"` says how its own path matches (default `"prefix"`,
but `"/chest"` is exact unless `match: "prefix"`).

Every component is in `gallery/components.html` (`npm run gallery`), in
the Chest look, Workshop, Library, Instrument (0.2.3) and a brand, light
and dark, English and French, working.

**0.2.2.** `AppShell`: `width="full"` takes the header to the edges too;
`toolsOn` ("all", "wide" — hidden under 760 px —, "phone"), and the
classes `ck-wide-only` / `ck-phone-only` for one tool of several;
`className`. On a phone the member's name is read, not shown, and no
longer lies past the screen's edge (Quotes); a section's count sits at the
top right of its icon, never over it, with five sections (Expenses).
`NavItem.className`. `PageHeader`: `intro` that is not a sentence is a
`<div>` (a line with a badge, two paragraphs); `className`.
`LanguageSwitch`: `href` as a pattern (`"/p/{code}/pricing"`), `className`.
`useFloat(anchor, popover, open, options)` is exported: a tool's own
popover in a dialog or a table's frame is placed over it as the kit's are.

**0.2.3.** On a wide screen the member chip keeps its name and role on
one line each (`white-space: nowrap`, the chip does not shrink): a full
header gives way elsewhere (Hiring).

## Changelog

### 0.2.3-studio.1 (2026-09-29)

What the eighteen tools reported when they re-vendored 0.2.2, and the
lead's decisions after the store's second critique. **Backward
compatible**: every tool on 0.2.2 re-vendors with no code change — all
eighteen were copied, pointed at this kit, type-checked (`next typegen`
+ `tsc`) and tested (reports/04, §18). New props and words are optional;
a theme made by hand for 0.2.2 stays valid (the two new colour tokens
and `--decor` get defaults).

- **Bug — DateField (Leave)**: an outside change of the value reached
  the text in an effect, after the commit, and a person who had tabbed
  into the field and typed got both texts ("06/01/202708/01/2027"). The
  text now follows the value during the render (the previous value kept
  in state); a person's typing is kept until read; a whole date selected
  stays selected when it changes. check-flows plays the race (a value
  changed after an await, then the same field typed; a range's first day
  moved, then its last day typed at once) — it fails on 0.2.2.
- **Bug — FilePicker camera (Expenses)**: the camera's input stayed in
  the tab order and the accessibility tree, unlabelled, on a desk (axe
  "label", critical). It is hidden with its label off a touch screen;
  the gallery now shows a picker with `camera`, and check-page runs axe
  on it on a desk and checks the button on a phone.
- **Contract**: `--inverse-signal`, `--inverse-signal-ink` — a tool's
  signal on its band, measured there in every theme and mode (the marker
  pen is a dark ground in dark looks: 1.3:1 to 2.6:1 on the band);
  Instrument's lime pinned on its panel; `optionalColorTokens` and
  `schemeWithDefaults` for themes made before. `--decor` (`1`/`0`,
  `Theme.decor`): the tool's decoration steps aside in a brand, the
  Chest's sheet and High contrast. **High contrast** reaches AAA (every
  text pair 7:1). Sales desk's chips are square (`radius.chip` 3, in the
  catalogue's identity: `identityAdditions` carry a `chip`).
- **Runtime**: `resolveTheme(choice, own, { surface: "public" })` — a
  public page wears the brand in brand mode, the tool's own identity
  otherwise; never a catalogue theme, never the Chest's sheet.
- **Components**: `Filters` — select sections (`group` on an option →
  `<optgroup>`), `allLabel`, no "Clear filters" when one select is the
  only filter on, the in-page mode (`value`/`onChange`; `filterValues`,
  `clearValues`), colours on a coloured band (`--ck-filters-ink`,
  `--ck-filters-link`, measured by axe on a band in the gallery);
  `DateRangeField` — `keepLength`, `ids`, `below`, `chips`, `length`;
  `DataTable` stack layout no longer labels the row header; the member
  chip keeps one line on wide screens; `FilePicker` — `previewSize`,
  `storedFile()` and the word `stored`; **`Checkbox`** (new) and the
  rule: at once → `Switch`, on Save → checkbox.
- **Brands**: ten hard brands in the tests; a second sample brand for the
  harness (Café du Port: `brand:port` in `lab/chest-dev`).
- **Gallery**: Instrument joins the looks; demos of the race, a leave,
  a period, a camera picker with a stored photo, in-page filters on a
  band, a band with its signal, a checkbox; check-page measures the
  signal's rule on the band.

### 0.2.2-studio.1 (2026-09-29)

What the sixteen migrated tools reported (Wiki, People, Expenses, CRM,
Support, Equipment, Booking), then Forms and Quotes. **Backward
compatible**: a tool on 0.2.1 re-vendors with no code change — new props
and words are optional, types only widened, a theme made by hand for
0.2.1 stays valid (the new tokens get defaults).

- **Bug — nested dialogs**: a `Confirm` opened from a `Dialog` closed
  both (Cancel, Escape or its action). Each dialog answers only its own
  events; played in the browser (check-flows), and the flow fails
  without the fix.
- **Bug — toast**: a short toast's close button no longer drops to a
  second line (no wrap; the text shrinks first) — tested in the CSS and
  measured in the browser.
- **Targets**: every control is 44 px (`--control-h`): `ck-button-small`
  (36 px before) and `ck-button-link`, sortable headers, calendar days;
  a chip's remove button and a segment reach it with an invisible margin;
  the skip link. check-page measures every control of the gallery, on a
  desk and a phone (its box, or what answers the pointer 22 px around
  it). `Menu` with a shown label: `size`.
- **Components**: `PeoplePicker` `clearable`; `Menu` item `id`, `note`,
  `download`, `link`; `Filters` `clearAlso`, `as: "select"`,
  `phone="scroll"`, `onNavigate`; `SearchBox` `minLength`, `required`,
  lists in `keep`; `FilePicker` `camera`, `preview`, `showLabel`, `id`,
  friendly "Accepted:" (families in words, JPG once, MIME types as
  extensions, ODT/ODS/ODP, VCF), the separator from the words (French
  narrow space); `className` on `StatusBadge`, `DateField`, `DataTable`
  (and `id`), `NavItem`, `Segmented`, `Tabs`, `Menu`, `Filters`,
  `SearchBox`, `PeoplePicker`, `FilePicker`, `PageHeader`, `AppShell`,
  `LanguageSwitch`; `DateField` label as a node, `hideLabel`,
  `describedBy`, `variant="compact"`, `onEnter`, `data-*`; toast
  `onExpire`; `useFloat` exported; `AppShell` `width="full"` header,
  `toolsOn`, the phone's member name in place, nav counts beside their
  icon; `LanguageSwitch` `href` pattern and link components from server
  components (through a `"use client"` re-export of `Link`); `Segmented` link variant (and its controlled state
  documented); `StatusBadge` `icon` with a category and `empty`;
  `PageHeader` intro as a `<div>`; `DataTable` column `header` and
  `className`, `stickyFirst`, `phone="stack"`, `rowHref`; `Calendar`
  `multiple` and `inline`; **`DateRangeField`** (new, 0.2.1's deferred
  range); **`Switch`** (new).
- **Contract**: `--inverse`, `--inverse-ink`, `--inverse-ink-2`,
  `--inverse-line` — a region of its own colour, dark in both modes, with
  measured pairs (Equipment's steel bar no longer collapses to the ink);
  `--font-read` — each theme's face for long text (Library: Newsreader,
  Letterpress: Libre Caslon Text, the body face elsewhere, never a
  display face); `--radius-chip` (badges and chips follow the theme's
  corners); `--field-pad-x` (fields' padding). `checkTheme`,
  `defineTheme`, `deriveTheme` (a brand's band is its main colour's deep
  shade) and the 20 themes carry them — the five identities with values
  of their own (three bands, two reading faces) get them from
  `identityAdditions`, which `defineTheme` applies to a source of that id
  and tool, so a tool's own copy of its identity still equals the
  catalogue's with no change; tokens/CONTRACT.md documents them,
  and the safe way to recolour a region (never `--accent` from a token
  that is `--accent`: it loops).
- **Forms joins the catalogue** as "Invitation" (the 20th theme), with DM
  Serif Display and DM Sans in the registry (`npm run fonts`; the files
  are the ones Forms serves) and its berry pinned by the signature test.
- **Fonts from files** take a `range` (unicode-range): two subset files
  of one face no longer hide each other (Forms).
- **Docs**: `useToast()` returns the toast's id — in a callback that must
  return nothing, use braces (AGENTS.md).

### 0.2.1-studio.1 (2026-09-29)

Fixes and gaps reported by the first migrations (Booking, Rooms,
Timesheets, Hiring, Tasks, Leave). **Backward compatible**: a tool on
0.2.0 re-vendors with no code change (new props are optional, new words
optional, types only widened).

- **DateField**: the date in words keeps its line while empty — a click
  right after typing no longer misses the button under the field.
- **Links**: Next.js's `Link` fits every `link` prop without a cast
  (`LinkComponent` returns `ReactNode`); `DayStrip` renders its link as
  an element (it called it as a function, which a forwardRef component
  is not).
- **Nav**: `also` (other path prefixes) and `match` on `NavItem` and
  `NavLink`; `isCurrent(path, href, rule)` takes the same rule.
- **AvatarStack**: no overlap at `s`, less at the other sizes — initials
  are never covered (measured in the browser at every size and look).
- **Filters**: `multiple` groups (`f=screen,dock`), `required` groups;
  `paramValues`. **SearchBox**: `maxLength` (200), `autoFocus`.
- **Palette**: slots keep their colour family in every theme —
  `checkPalette` (hue within 35° of the family, label and colour not grey
  for slots 1–7); Workshop's labels are deep inks of their family (they
  were all black), Control room's slot 5 is a pink (it was a red),
  Magazine's dark slot 3 ground an orange; `deriveTheme` gives a brand's
  colour to a family only when it belongs to it. All 19 themes and 1,500
  random brands pass `checkTheme` and `checkPalette` (Chest's greys
  excepted by design).
- **Instrument**: `--highlight` is Timesheets' electric lime `#c6ff3a`
  (it was a pale `#e4f9b0`); every identity's signature colour is held to
  its tool's former `tokens.css` by a test.
- **PageHeader** `size` (`"l"`, `"m"`). **BrandMark** `ground` and a
  logo scaled whole (`--ck-logo-max`). **Toast** `action`.
  **Segmented** `disabled`, the word as the target. **DataTable**
  `rowProps`, sortable headers in the header's typography.
  **FilePicker** `dropOne`, readable when full. **PeoplePicker**
  `suggestionsLabel`, `hideLabel`, no choice nor form sent while
  searching. **TimeSelect** `empty`. **MonthField** (new).
  `dateWords()` for a catalogue's date words. `initials` leaves out a
  bracketed note.
- **Popovers** (picker list, calendar, row menu) escape a dialog's or a
  table's scrolling frame.
- **Docs**: decorative mixes are `color-mix(in oklab, …)`, never `in
  oklch` (a white has no hue; Chrome swings the mix through pink/blue).

For 0.3: a date range on the calendar (`DateRangeField`, Leave uses two
`DateField`s today) — done in 0.2.2.

## Develop

```sh
npm ci
npm test                # build dist/, compile the tests into build/, run them (node --test)
npm run check:package   # npm pack, install into a temp project, import every subpath from Node and esbuild, type-check a TS consumer
npm run gallery         # ui/gallery/index.html and ui/gallery/components.html
node scripts/gallery/check-page.mjs    # the components page in Chromium: hydration, axe in every look, no network, 390 px, 44 px targets, the phone header
node scripts/gallery/check-flows.mjs   # its keyboard and mouse flows (toast, dialog, picker, dates, table, menu, tabs)
npm run fonts           # fetch the catalogue's fonts again (network)
```

`src/` holds the modules (`src/components/` the React components and their
pure rules), `css/` the components' stylesheet, `test/` the tests and `test/fixtures/` realistic
brand files, `scripts/` the fonts, gallery and package scripts,
`tokens/CONTRACT.md` the contract. TypeScript strict, ES2022, NodeNext.
Adding a theme: a source in `src/themes.ts` (the tests then hold it to
the contract), its fonts in `scripts/fetch-fonts.mjs`. Adding a language:
one more entry per message in `src/notes.ts` and in each theme's `name`
and `description`.

## Licence

MIT (`LICENSE`), © 2026 Argentic. The fonts in `fonts/` are under the SIL
Open Font License 1.1, each with its licence file.

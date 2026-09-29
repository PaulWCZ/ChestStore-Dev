# Wiki — design

## Name and personality

**Wiki** (French: *Wiki*). Calm, literate, trustworthy — a well-made
company handbook on good paper, not a software screen.

## Its identity is a theme: Library

The wiki's look is **Library**, a theme of the store's UI kit
(`@argentic/chest-ui`): `defineTheme` in `lib/theme.ts`, value for value the
catalogue's `library` (a test holds them equal), checked against every
contrast pair of the kit's token contract in light and dark
(`checkTheme`, `test/theme.test.ts`). It is the wiki's **default** look. A
company may instead give its tools — all of them, or the wiki alone — any
theme of the catalogue (the 17 identities, "Chest", "High contrast") or its
own brand; the wiki then wears it with the same features, and the header
shows the company's logo where the book mark stands.

So **no colour is written in the wiki's CSS**: `app/globals.css` names only
the contract's tokens (`--bg`, `--surface`, `--ink`, `--accent`,
`--accent-text`, `--line-strong`, `--highlight`, `--cat-N`…), and
`app/tokens.css` holds the wiki's own tokens, each defined from them:

| Token | Defined as | Use |
|---|---|---|
| `--font-read` | `--font-display` | page text, titles, excerpts (Library: Newsreader) |
| `--read-size`, `--measure`, `--sidebar` | 19 px, 40 rem, 288 px | the reading column, the sidebar |
| `--bar-h` | the kit's header height | what sticks below it (sidebar, editor bars) |
| `--space` / `--space-ink` | `--cat-N` / `--cat-N-ink` of the space's slot | a space's spine and dot (3:1) / its colour as text (4.5:1) |
| `--added*` / `--removed*` | `--ok`, `--ok-soft`, `--ok-ink` / `--danger…` | history: words put in, taken out |
| `--hover`, `--veil` | `color-mix` of `--ink` / `--bg` | decoration only: a row's hover, the translucent header |

Library's values (light / dark) — paper `#faf6ee` / `#16140f`, ink
`#23201a` / `#ece5d6`, deep green `#1d5b43` / `#8fcfae`, highlighter
`#f6e3a1` / `#5c4a14` — are in `lib/theme.ts`; what the theme leaves out
is derived by the kit with the contract's contrast. Field borders are now
`--line-strong` (`#908877` light: 3.3:1 on paper, 3.5:1 on a card; the old `#cfc3ab`, 1.6:1, was
under WCAG 1.4.11's 3:1).

**The spaces' colours** are the contract's categorical slots, the same
family in every theme: green → 2, blue → 1, plum → 4, rust → 3, ochre →
7, slate → 8 (Library tunes them to the spines the wiki always had). In the
Chest theme the slots are warm greys: a space is told by its name, which
is always written.

**Note boxes**: a note on `--accent-soft`, a tip on `--cat-1-soft` with
`--cat-1-ink`, a warning on `--wait-soft` with `--wait-ink` — each text on
the ground it was measured on.

**Type**: *Newsreader* (OFL-1.1, variable, with italics) for everything one
reads — titles, headings, page text at 19 px with 1.7 leading on a 40 rem
measure (about 70 characters), excerpts, search results; *Source Sans 3*
(OFL-1.1) for the interface around it. Old-style figures in text, tabular
figures in tables, small uppercase labels ("kickers") letter-spaced. Both
self-hosted in `public/fonts/`. **Shape**: hairline rules instead of boxes,
radii 5/8/14 px, soft shadows only on what floats (menus, dialogs, hovered
cards). **Space**: 4, 8, 12, 16, 24, 32, 48, 72. **Motion**: 120 and 240 ms,
none with reduced motion.

## Components

The frame is the kit's shell (`AppShell`): the header (the book mark, or
the company's logo, and "Wiki"; the sections **Home · Pages · Search ·
Trash** as labelled tabs; a search box on wide screens; the member chip),
translucent over the paper. Under it, on wide screens, the wiki's paper
sidebar with each space's tree, drag targets drawn as a green line or a
dashed box. On a phone the sections take a row of labelled tabs under the
header (the store's rule: never icons alone, never a hamburger) and the
tree is the **Pages** section — the same tree on a page of its own, opened
in one tap — instead of the old drawer.

From the kit, wearing the look: toasts with a truthful *Undo* (French
« Annuler l’action »), dialogs that open on their first field and ask
before losing what was typed, the `Confirm` before *Delete for good*, the
*More* menus, avatars, the empty states, the history's *Changes / As it
was* tabs, the read statuses (a shape and a word), the importer's file
picker (drop or choose, each file removable), the no-access page.

The wiki's own: buttons (green primary, quiet, small, big, danger),
fields, choice cards, colour swatches, notices (someone editing, your
draft), the article (kicker, display title, byline, table of contents on
wide screens, "In this section" and "Linked from"), the prose styles
(headings, lists with coloured markers, quotes with a spine, note boxes
with a round sign — note, tip, warning —, checklists, tables with an ink
head rule, code, figures with captions, a fleuron for dividers, links to
pages as soft green chips), the editor (sticky save bar with the draft's
status, a toolbar that wraps on two rows on phones, a title that is just
large text), the history (a list of versions, words taken out struck, put
in underlined, long unchanged runs folded), search results with a
highlighter, a space's table of contents numbered like chapters.
The conversation under a page reads like margin notes: comments in paper
cards beside an avatar, the author and time in the interface sans, the
text as written (line breaks kept, addresses as green links), *Edit* and
*Delete* as quiet underlined words; a highlighted card when the bell opens
it. *Watch* is a quiet button that turns green and pressed (an eye, then a
tick). A page due for review gets one notice with a spine in the waiting
state's colour and its two answers. The *New page* dialog's "Start from" is
a row of choice cards, *Blank page* already chosen; a template carries a
small green "Template" pill under its title.
The "/" menu is a small paper card under the line, an icon and a plain
name per block, the chosen one tinted green; the "@" list under a comment
is the same card. Pinned pages sit under the home page's question as
paper tabs with their space's colour on the edge. A page to confirm has a
green notice with a seal and one button, *I have read it*; *Who has read
it* is a plain table whose statuses are the kit's badges — "Read",
"Not yet", "Read version N".

## Icon

`chest/icon.svg`: an open book on a deep green square, with an ochre
ribbon — the handbook, bookmarked. No letters; the pale pages carry it on
light and dark tiles alike, readable at 24 px.

## Why

A wiki is read far more than it is written, often by someone checking a
rule before asking a colleague. It should feel like a good book: a serif
set at a comfortable size and measure, quiet margins, headings that make
a policy scannable, nothing flashing. The interface stays in a small sober
sans so it never competes with the words. Green reads as calm and "settled",
the right register for policies people rely on; the warm paper and the
highlighter-yellow search marks keep the paper metaphor all the way.

```json showcase
{
  "adjectives": ["calm", "literate", "trustworthy"],
  "colors": [
    { "name": "Paper", "value": "#faf6ee" },
    { "name": "Ink", "value": "#23201a" },
    { "name": "Deep green", "value": "#1d5b43" },
    { "name": "Mint", "value": "#e3ede5" },
    { "name": "Highlighter", "value": "#f6e3a1" },
    { "name": "Ribbon", "value": "#e2a83c" }
  ],
  "fonts": {
    "display": { "family": "Newsreader", "file": "public/fonts/newsreader-latin-wght-normal.woff2", "weight": 600 },
    "body": { "family": "Source Sans 3", "file": "public/fonts/source-sans-3-latin-wght-normal.woff2", "weight": 400 }
  },
  "specimen": "Holidays and time off — how to ask"
}
```

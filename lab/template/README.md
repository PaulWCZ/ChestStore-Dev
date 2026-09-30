# Notes — short notes for the whole team

A tool for [Chest](https://argentic.app): the company's private software
space. A Chest builds it from this repository and runs it on the company's
own server, with its own database. **This is the studio's starter**: every
store tool begins as a copy of it (see `lab/README.md` in the studio).

## What it does

Members post short notes; a manager pins what matters; an author deletes
their note and can undo it for 30 days.

| Role (`chest.json`) | Label | May |
|---|---|---|
| `manager` | Manager | everything: post, pin, delete any note |
| `member` | Member | read, post, delete their own notes |
| (none) | — | sees a "no access yet" page |

The owner, the admins and the tool's builders come in with the first role.

## First minute

- **What a new user sees:** the notes, newest first, pinned ones on top, and
  a field "Write a note for the team…". Empty: "No notes yet" and one button
  that posts an example.
- **The first thing they do:** type and press *Post* (or Ctrl/⌘+Enter).
- **Clicks for the main job:** one.
- **A mistake:** *Delete* acts at once and shows "Note deleted. Undo" for
  8 seconds; a refused action puts the screen back and says why.

## Routes

| Path | Who | What |
|---|---|---|
| `/chest` | members (team host) | the notes |
| `/chest-events` | the Chest only (signed) | members' lifecycle |
| `/` | anyone (public host) | "This tool lives in your Chest", with a language switch |
| `/lang/<code>` | anyone | remembers the public language (cookie) |

## On a Chest

- `capabilities`: `database` (the notes), `members` (names and photos of
  authors), `notifications` (an author is told when a manager pins their
  note), `receives: ["member.*"]` (an erased member's notes are deleted).
- Private part in the member's language (`member.language`, narrowed by
  `localeOf` to a language the tool speaks), dates in the member's zone
  (`member.timeZone`), public part with
  a visible switch; English first, French second (`lib/i18n/`).
- No network, no disk writes, nothing in the background: deleted notes are
  purged when the list is next read.
- **The company's look**: the tool wears what the owner chose in the Chest
  — its own identity (`lib/theme.ts`), a theme of the catalogue, or the
  company's brand with its logo — for all tools or for this one
  (`@argentic/chest-ui`, packed in `vendor/`). Same pages, same words;
  every look passes WCAG AA. Screens of three looks: `docs/screens/notes-*`,
  `notes-theme-*` (Newsprint), `notes-brand-*` (a sample brand),
  `notes-chest-*` (the portal's look).

## Needs from the SDK

`@argentic/chest-sdk` 0.3.1-studio.1 (the released 0.3.0 plus the studio's
proposals, packed in `vendor/`):

- `member.language`, `member.timeZone`, `members.lookup` — the released
  0.3.0.
- `chest.theme()` — **Proposal (studio)**: the look the company chose. On a
  Chest without it, the tool keeps its own identity.

## Develop

```sh
npm ci
npm test          # node:test; PGlite unless TEST_DATABASE_URL names a PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs <this folder>` runs it against a
fake Chest with sample members (`/_dev` switches the company's look, for
all tools or this one); `node lab/chest-dev/screens.mjs` takes the
screenshots in `docs/screens/` (entries with `"look"` in each theme).

## What it does not do (yet)

Rich text, attachments, comments, reactions.

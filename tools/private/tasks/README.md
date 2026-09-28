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
- Private part in the member's language (`member.locale`), public part with
  a visible switch; English first, French second (`lib/i18n/`).
- No network, no disk writes, nothing in the background: deleted notes are
  purged when the list is next read.

## Needs from the SDK

- `member.locale` — **Proposal (studio)** of the SDK working copy
  (`0.3.0-studio`, packed in `vendor/`). Without it, everyone reads English.

## Develop

```sh
npm ci
npm test          # node:test; PGlite unless TEST_DATABASE_URL names a PostgreSQL
npm run build     # types, then the Next.js build, as the Chest does
```

In the studio: `node lab/chest-dev/dev.mjs <this folder>` runs it against a
fake Chest with sample members; `node lab/chest-dev/screens.mjs` takes the
screenshots in `docs/screens/`.

## What it does not do (yet)

Rich text, attachments, comments, reactions.

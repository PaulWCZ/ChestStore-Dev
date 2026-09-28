# Adapting Forms — a guide for AI agents

This file is for an AI coding agent asked to change a fork of this tool so a
team can link it to its Chest. `README.md` describes what the tool does and
what a Chest imposes; this page says where things are and what must not
break.

## Map

| Path | What it is |
|---|---|
| `chest.json` | The manifest: name, roles, public part, own CSP, `database` capability, build |
| `lib/model.ts` | Rules of a form and of an answer, bounds, CSV — no framework, fully tested |
| `lib/forms.ts` | The service: who may do what (`canEdit`, `canRead`), state changes |
| `lib/store.ts` | PostgreSQL storage, parameterised queries only |
| `lib/i18n.ts` | Every word of the interface, one catalogue per language (English default, French) |
| `lib/session.ts` | The current member (`member()` of the SDK), the interface language, the public address |
| `app/chest/…` | Members' part (team host, behind the Chest) |
| `app/f/[slug]/…` | Public part (anonymous visitors) |
| `app/actions.ts` | Server actions; each re-checks the member, returns codes, never sentences |
| `proxy.ts` | Own Content-Security-Policy with a nonce; 401 on `/chest` without an assertion |
| `migrations/NNNN_name.sql` | Schema, run by the Chest in order at install and every update |
| `packages/chest-client` | Vendored SDK (`@argentic/chest-sdk`); do not edit — update it from the SDK |

## Commands

```sh
npm ci
npm test        # must pass
npm run build   # must pass: this is what the Chest runs (512 MiB, 1 CPU)
```

## Rules

- **Identity comes only from `member()`.** Never read a user, email or role
  from a body, query or cookie. Every page and action under `/chest` checks
  the role through `lib/forms.ts`.
- **The public part has no member.** Anything under `/f/` must work for
  anonymous visitors and must never expose drafts or responses.
- **Validate on the server.** New inputs get bounds and checks in
  `lib/model.ts`, with tests.
- **Schema changes are new migration files.** Never edit or delete a
  migration that ran; keep the previous version working on the new schema (a
  rollback does not undo a migration).
- **No words in logic.** Services and actions return codes; add the words to
  every catalogue in `lib/i18n.ts` (the tests check they match).
- **Stay within the Chest's limits.** Read-only file system: no writes to
  disk, keep `dynamic = "force-dynamic"` and `images.unoptimized`; keep the
  webpack build; no outbound network.
- **Keep the CSP.** Inline scripts need the nonce from `proxy.ts`; do not
  loosen `script-src` or `frame-ancestors`.
- **Renaming a role is a migration of access.** When a role disappears from
  `chest.json`, the Chest moves its members to the default role: rename roles
  only knowingly.

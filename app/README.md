# @argentic/chest-app

The machinery of a Chest tool built on Hono and React: pages rendered on
the server, islands, typed actions callable from an island or a plain
form (CSRF-safe), a refresh that keeps the page's state, the member's
words and formats, the strict policy (no `"csp"` permission needed for a
public part), logs, the database, and test helpers. The Perseus starter
(`starter/` of the studio) is a tool built on it; `AGENTS.md` is the
reference an agent reads.

It is the studio's working copy (like `sdk/` and `ui/`), never published:
a tool gets a packed copy in its own `vendor/`:

```sh
node scripts/add-app.mjs starter                 # or tools/private/<name>
```

| Import | Gives |
|---|---|
| `@argentic/chest-app` | `createApp`, `serve`, `page`, `publicPage`, `download`, `publicDownload`, `publicActionsAt`, `rawRoute`, `sameOrigin`, `policy`, `formToken`, `zipStream`, `Island`, `Honeypot`, `action`, `publicAction`, `field`, `fail`, `notFound`, `forbidden`, `redirect`, `after`, `toolPath`, `cutText`, `readEmail`, `readMoney`, `fill`, `formatter`, `localeIn`, `publicLocale`, `csvLine`, `textStream`, `log`, types (`Bound`, `Budget`, `EmailRead`, `Download`, `LayoutData`, `PublicContext`, `Register`, `CoreWords`, `MemberContext`, `VisitorContext`, `LayoutProps`, `Format`…) |
| `@argentic/chest-app/client` | `call`, `refresh`, `navigate`, `onLinkClick`, `toast`, `ToastHost`, `Honeypot`, `fill`, `plural`, `send`, `AppError`, `fail`, `readEmail`, `readMoney`, `useAutoRefresh`; types `EmailRead`, `Outcome`, `SentOf`, `ErrorCode`, `Words`, `Plain` (for islands) |
| `@argentic/chest-app/browser` | `start(islands, lazy?)` (the tool's `src/entry.tsx`; `lazy` from `virtual:chest-islands`: each page loads its own islands' code) |
| `@argentic/chest-app/db` | `db`, `seen`, `seenIn`, `changeStamp`, `forgetChanges` (with `sql/changes.sql`, the change log a tool copies into a migration) |
| `@argentic/chest-app/members` | `names` |
| `@argentic/chest-app/vite` | `chestConfig({ theme, bundle? })`, `baseCss` (what every `client.css` starts with) |
| `@argentic/chest-app/testing` | `testDatabase`, `checkPage`, `checkWords`, `checkSources`, `settled`, `atLeast` |

Peers: `hono`, `@hono/node-server`, `react`, `react-dom`,
`@argentic/chest-sdk` (≥ 0.4.1), `@argentic/chest-ui`; `postgres` for
`/db`. A tool's devDependencies give `vite` (for `/vite`) and
`@electric-sql/pglite` + `pglite-socket` (the tests' last resort): they
are not peers, so `npm prune --omit=dev` drops them from the image.

`npm test` builds it, type-checks the tests and runs them (unit tests of
the sources, and a small tool on the built package with the SDK's
fakeChest and a database: `TEST_DATABASE_URL` or PGlite). In the studio
it also checks the report's size figures (`lab/starter-bench/sizes.mjs
--check`).

Versions: `0.1.0-studio.N`, raised at every change a tool must re-vendor
(this copy: `0.1.0-studio.10`).
MIT.

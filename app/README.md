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
| `@argentic/chest-app` | `createApp`, `serve`, `page`, `publicPage`, `Island`, `action`, `publicAction`, `field`, `fail`, `notFound`, `forbidden`, `redirect`, `after`, `toolPath`, `fill`, `formatter`, `localeIn`, `publicLocale`, `csvLine`, `log`, types (`Register`, `CoreWords`, `MemberContext`, `VisitorContext`, `LayoutProps`, `Format`…) |
| `@argentic/chest-app/client` | `call`, `refresh`, `navigate`, `onLinkClick`, `toast`, `ToastHost` (for islands) |
| `@argentic/chest-app/browser` | `start(islands)` (the tool's `src/entry.tsx`) |
| `@argentic/chest-app/db` | `db`, `seen` |
| `@argentic/chest-app/members` | `names` |
| `@argentic/chest-app/vite` | `chestConfig({ theme, bundle? })` |
| `@argentic/chest-app/testing` | `testDatabase`, `checkPage`, `checkWords`, `checkSources`, `atLeast` |

Peers: `hono`, `@hono/node-server`, `react`, `react-dom`,
`@argentic/chest-sdk` (≥ 0.4.1), `@argentic/chest-ui`; `postgres` for
`/db`, `vite` for `/vite`, PGlite for the tests' last resort.

`npm test` builds it, type-checks the tests and runs them (unit tests of
the sources, and a small tool on the built package with the SDK's
fakeChest and a database: `TEST_DATABASE_URL` or PGlite).

Versions: `0.1.0-studio.N`, raised at every change a tool must re-vendor.
MIT.

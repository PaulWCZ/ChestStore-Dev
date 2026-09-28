# lab/ — the studio's workbench (never part of a tool)

| Folder | What |
|---|---|
| `template/` | The starter every store tool is copied from: a small, complete tool ("Notes") that shows every pattern — member and roles, language, database and migrations, names from member ids, notifications in the recipient's language, lifecycle events and erasure, optimistic UI with undo, polling, CSP, tests with `fakeChest` and PostgreSQL (PGlite), screenshots |
| `chest-dev/` | The local Chest (`chest dev` as we would like it): fake Chest from the SDK working copy, the tool's database, a member and language switcher, the bell, lifecycle buttons, proposals' controls; and `screens.mjs` for screenshots |

## The loop for a new tool

```sh
node scripts/new-tool.mjs private tasks          # copy the starter, pack the SDK, npm install
cd tools/private/tasks && npm test && npm run build
node lab/chest-dev/dev.mjs tools/private/tasks --reset        # http://localhost:4000/_dev
node lab/chest-dev/dev.mjs tools/private/tasks --prod --reset # after npm run build
node lab/chest-dev/screens.mjs tools/private/tasks            # with docs/screens.json
node scripts/add-font.mjs tools/private/tasks @fontsource-variable/<font>
node scripts/check-manifest.mjs tools/private/tasks
node scripts/contrast.mjs "#1c1b18 on #ffffff"
node scripts/build-showcase.mjs
```

PostgreSQL must run locally for `chest-dev` (`service postgresql start`;
`DEV_DATABASE_URL` otherwise). Tests need nothing: PGlite, or
`TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres`
for a real server.

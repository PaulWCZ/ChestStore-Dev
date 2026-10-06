# measure — the studio's measuring bench

One tool's **image**, **cold start** and **memory at rest**, measured the
same way for every tool, so that two stacks (Next.js before, Hono + React
SSR islands + Vite after) can be compared honestly. A lab tool, never part
of a tool.

```sh
export PATH=/opt/node24/bin:$PATH              # the Chest's pinned Node (24.21)
service postgresql start                       # if it is down
(cd lab/measure && npm ci)                     # once: the bench's own postgres client

# one tool
node lab/measure/measure.mjs tools/private/tasks --label after-hono
# every tool of a tree (tools/private/*, tools/public-and-private/*, then
# reference/perseus-starter and reference/forms), one at a time, then the table
node lab/measure/all.mjs . --label after-hono [--only tasks,wiki] [--skip-done]
# the tables (a second label adds a before → after comparison)
node lab/measure/table.mjs before-next16 after-hono
```

Results: `lab/measure/results/<label>/<tool>.json` (everything, every run),
and `results/<label>/TABLE.md` (written by `all.mjs`). A tool takes about
6 minutes (a Next.js one) with the defaults: 10 cold starts, 5 rests of 30 s.

## What it does, for one tool

1. **The repository as the Chest receives it.** The files Git tracks or would
   add under the tool's folder are copied to a work folder
   (`$TMPDIR/chest-measure/<tool>`, `--work`), never touching the tool. Its
   size is *Repository*. (A reference whose `vendor/` tarball is not in the
   snapshot — `reference/perseus-starter` — gets the same version from npm,
   `npm pack @argentic/chest-sdk@<version>`; the result's notes say so.)
2. **The image, built as the Chest builds it** (`reference/contract/application-contract.md`,
   "Generated recipe"): `npm ci --no-audit --no-fund`, then `build.command`,
   then `npm prune --omit=dev`. The environment is a container's, not the
   shell's: `PATH` with Node 24.21 first, a fresh `HOME`, the proxy this
   machine needs for npm — and **no `NODE_OPTIONS`** (shells here set
   `--max-old-space-size=8192`, which would change the build's memory).
   - `npm ci` runs in a cgroup limited to **512 MiB and one CPU** (CFS quota).
     If the kernel kills it, it is run again without limit (the result says so).
   - `build.command` runs twice from a clean output (the build's own new
     top-level entries and `node_modules/.cache` removed): first **limited**
     (512 MiB, 1 CPU) — did it finish (`fits`), how long, the cgroup's
     peak —, then **free** (4 CPUs, no limit) — its time and its peak, the
     process tree's RSS and PSS sampled every 250 ms. The free build is the
     one that is then served.
   - Sizes (`du -sk`, disk usage, MiB): `node_modules` after `npm ci` and
     after the prune (what the image keeps), the build's output (every
     top-level entry the build created: `.next`, `dist`…; `.next/cache`
     apart), and *Image* = repository + pruned `node_modules` + output (the
     Node base image left out: it is the same for every tool).
   - Options: `--build-memory 512 --build-cpus 1`, `--no-limited-build`,
     `--skip-image` (with a work copy kept by `--keep`).
3. **The Chest around it**, in the bench's own process (never counted):
   a database `t_bench_<tool>` (its own name, so the harness's `t_<tool>`
   databases other work uses are never touched), new, its sessions in
   Europe/Paris, the migrations run in name order, `seed/sample.sql` loaded;
   a fake Chest from **the tool's own SDK** (`node_modules/@argentic/chest-sdk`,
   its `testing` module: the fake that matches its SDK), with the cast of
   `lab/chest-dev/cast.mjs` and the options `dev.mjs` gives it.
4. **The server, started as the Chest starts it**: `build.start` (`npm start`)
   as an argument vector, in the work copy, with the Chest's environment and
   nothing else — `NODE_ENV=production`, `NPM_CONFIG_UPDATE_NOTIFIER=false`,
   `NPM_CONFIG_CACHE`, `PORT` (4700, `--port`), `CHEST_API`, `CHEST_TOKEN`,
   `CHEST_TOOL`, `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`,
   `CHEST_CURRENCY`, `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` (with a public
   part), `DATABASE_URL` (with a database) — plus `NEXT_TELEMETRY_DISABLED=1`
   (a Chest container has no egress; here it would reach the network) —, in
   a cgroup of its own, so that every process it forks is found.
   Requests go straight to `PORT`, as the Chest's launcher relays them, with
   `X-Forwarded-Proto`/`X-Forwarded-Host`, `Connection: close`, and for a
   members' page a `Chest-Member` assertion signed by the fake (the page's
   member, in the page's language).
5. **Cold start** (`--starts 10`): from the spawn, the time until the port
   accepts a TCP connection, and until the first `200` of the main members'
   page (the first `/chest…` page of the list). The server is stopped
   (`SIGTERM`, then `SIGKILL` after 10 s) between runs. Median, min, max.
6. **Memory** (`--rests 5`, `--idle 30`): a new start; one `GET` of each page
   of the tool's frozen list (below), the tree's RSS and PSS sampled every
   50 ms (*peak*); then 30 s idle; then **RSS and PSS summed over every
   process of the server's cgroup** (`/proc/<pid>/smaps_rollup`: `npm`, the
   shell npm runs the script in, the server and any worker it forks), with
   each process apart, and the cgroup's own anonymous/cache split. Median,
   min, max. *Server alone* is the same sum without the `npm` process.
7. The JSON records the machine (CPU, CPUs, RAM, kernel, cgroup mode), Node
   and npm versions, the date, the tool's last commit, the load average at
   start, during each run and at the end, and the five busiest processes at
   start and end (other agents' builds show there).

### The pages (`pages/<tool>.json`)

Frozen once, so the same pages are requested before and after a change of
stack: every distinct path of the tool's `docs/screens.json` shots without
actions (the screens `lab/chest-dev/screens.mjs` takes), in order, with the
first shot's member and language, at most 20. A path outside `/chest` is a
public page, requested without a member. The two references have
hand-written lists. `node lab/measure/pages.mjs <tool>` shows what the
screens would give today; **do not regenerate a list between a before and an
after**: a page that moved is a 404 in the result, which is what it should
say.

## Reading the numbers

- **RSS** counts every page a process has in memory, shared ones in full
  (the Node binary is counted once per process); **PSS** divides the shared
  pages among the processes sharing them: summed over a tree, PSS is the
  closest to what the tree costs the machine. A Chest container's memory
  limit (256 MiB by default) counts the anonymous memory of every process
  in it plus its page cache: neither number is exactly that; the JSON keeps
  the cgroup's anonymous/cache split beside them.
- **`npm` stays resident.** The Chest's launcher runs `build.start`
  (`npm start`), so `npm` (about 35 MiB PSS, 65 MiB RSS) lives beside the
  server for the instance's whole life, inside its 256 MiB. *Server alone*
  shows what the tool itself weighs.
- **The build limits.** brief/08 says the build container has 512 MiB and
  one CPU; `reference/contract/application-contract.md` ("Build") says
  `--memory=1536m` and two CPUs at a low weight, and that a default
  Next.js build reached 1.2 GiB. The bench tests 512 MiB / 1 CPU (the
  stricter); the free build's peak says whether 1.5 GiB holds.
- **cgroup v1** (this machine) charges the page cache of the files a
  process writes to its group: `npm ci` writing hundreds of MiB of
  `node_modules` can be killed at 512 MiB where cgroup v2's writeback
  throttling might let it through. The npm process's own peak (tree RSS)
  is in the JSON (`install.peakRssMiB`). The limits are emulated on this
  machine's kernel, not inside podman.
- **The load.** Other agents build on this 4-CPU machine: cold starts and
  build times move with the load (see the load columns of the JSON); memory
  at rest barely does. Re-run before and after together in a quiet window
  for the final numbers.

## Measuring a migrated tool

Nothing to change: the bench reads `chest.json` (`build.command`,
`build.start`, `capabilities`, `public`, `schedules`), installs from the
lock, starts the server with `PORT`, and uses the tool's own SDK's fake
Chest. Keep `pages/<tool>.json` as it is (the same pages), then:

```sh
export PATH=/opt/node24/bin:$PATH
node lab/measure/measure.mjs tools/private/tasks --label after-hono
node lab/measure/table.mjs before-next16 after-hono
```

To compare in the same conditions at the end, re-run both trees in a quiet
window (`all.mjs <before tree> --label before-next16-final`, then
`all.mjs . --label after-hono-final`).

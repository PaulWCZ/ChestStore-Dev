# Application contract — excerpt of the Chest's architecture

Snapshot of `docs/architecture.md` of the private Chest repository, commit `548e697` (7 October 2026): sections “Application contract”, “Contract map”, “Languages”. See `reference/README.md`. The rules of `chest.json` themselves are `reference/sdk/contract/README.md`.

## Application contract

A tool is **an ordinary web server**, of any framework, that the
Chest builds from its code, runs and places behind its own front:
the manifest `chest.json`, which names the version of the tool contract it
needs (“Building from source”), the container,
the front and the services (“Server tools”), the map and what remains to
be done (“Contract map”, further down). The package declares `name`, an image
immutable by digest, `roles`, `public`, `csp`, `capabilities`, `network`,
`env` and `server: {port, static}`; what it asks for is a list of
permissions put into words at approval (`packagefile.Permissions`). Unknown
fields and duplicate JSON keys are refused. The approved digest binds
the examined bytes; it certifies neither their provenance nor their harmlessness. An
application cannot approve its own permissions. Nothing counts the tools:
a new one is refused only when the server would not hold it (“Room for a
new tool”).

**A single contract: the server, versioned.** A tool is a web server; its
`chest.json` names the version of the tool contract it is written for,
`"chest": "MAJOR.MINOR"` — the SDK's MAJOR.MINOR (`sourcefile.Contract`,
0.5). A Chest serves every version up to its own with the one grammar it
has: the contract only grows, a key keeps its meaning. A later version is
refused before any key is read (`sourcefile.NeedsNewerChest`, reason
`newer_chest`: “This tool needs a newer version of your Chest”, EN and FR,
on a GitHub read or link, a Perseus check; the catalogue lists such a tool
by its repository with that sentence, nothing it asks read, never
installed: `catalogue.Tool.NeedsChest`, not `Known`). Up to its own
version, an unknown key is refused, never ignored. A manifest without
`"chest"` is refused (the first contract, a worker connected by a private
channel, is long withdrawn, its code deleted); the internal package an
approval binds keeps its own `"version": 2` format and has no
`permissions` list. The contract — every key with its rule
(`sourcefile.Keys`, which the parser's known keys come from), the source's
bounds, the migrations' rule and the extensions they may create, the
policies the front adds — is published in the SDK's repository
(`contract/`; the checker `@argentic/chest-check`, its `check/` workspace, a
development package apart from the runtime client), written by
`scripts/build-contract.mjs` from `chest/toolcontract` with `chest-check`,
the validator (`sourcearchive.Validate`) built for WebAssembly;
`tests/tooling/contract.test.mjs` fails when the SDK's copy differs from
this code, and holds the WebAssembly to the native command on every
fixture. A Chest always opens empty: the reservation names no
tool, and no recorded format — central reservation, `installation.json`,
control channel requests — has a key to name one (`app` or
`approval` are refused there like any unknown key; `migrate` rewrites the
earlier records, [servers.md](../deploy/servers.md)).

**Proposal and builder.** Any member of the Chest can propose a package
(`chest/proposal`; a builder also proposes the checkpoint of a Perseus
Build project, “Perseus Code: publishing”): its exact bytes are kept in a private file, nothing
is executed, registered with the provider or granted. Sixteen pending
proposals at most, two per member, one per tool name, 64 kept; beyond that,
the one decided longest ago (refused or installed, which no longer changes)
gives up its place — the author has read the decision, the installed tool is
in the Chest —, never a pending or approved proposal; an altered file makes
the whole list unavailable. A member sees only the status of their own; the
owner sees the author and the bytes to examine. Approving **is** an
ordinary installation: same bytes, same digest, always reserved to the
owner and admins. The author then becomes a
builder assigned to the tool (`Team.RecordBuilder`: the builder status,
the assignment `builds` and, as its creator, a direct grant of the tool
with its default role, written in the policy; never its data), which makes
them run this tool and nothing else of the Chest (“Who runs what”, above); the owner and an
admin, who run every tool, are recorded nothing. The assignment disappears
with the member, the tool or the builder status. It is written when
the tool joins the Chest (`publish`: the team records the tool, writes its
builder, then the binding becomes active): the tool never appears without
its author running it. A failure of the writing leaves the tool outside the
Chest and the proposal pending; approval is requested again and each
step already done has nothing left to do. Backup of pending proposals
remains to be delivered.

**A test tool in the repository.** `tests/apps/testweb` (“Server test
bench”, its `README.md` is its contract) exercises “Server tools”:
`node:http` only, a public part (`/`, the version in service,
`/api/whoami` which sees nobody there), the members part under `/chest` (name and
role read by the SDK's `member(request)`, notes written by `editor`, admins and
builders), `/static/` served on both hosts, clean exit on `SIGTERM`.
A tool's name comes from the approved manifest or from the choice of whoever installs
(“Tool names”, further down), never from the code. The real tools —
Forms first — live in their own repositories, those of the catalogue
(`03_code/04_argentic-store/<outil>`), and depend on the Core only through the SDK.
Exported by `export-store.mjs testweb`, the test bench is the `web` repository of the
lab's catalogue (`tests/browser/server-tool.spec.ts`), and it is what
the VM proofs install under several names — `todo`, built by the
Chest from its sources with the tightened manifest, `board`, `notes`, `mismatch`,
`webdb`, `testweb` —: two installations of the same source prove
the isolation of data, databases and rights.

**The SDK has its own repository.** The client a tool embeds (`member`, `database`,
`files`, `errors`) has as its source the public repository `chest-by-argentic/Chest-SDK`
(`03_code/02_chest-sdk` in the company folder), published on npm
(`@argentic/chest-sdk`). This repository keeps a **vendored copy** of it,
`tests/sdk/chest-client`, refreshed by `node scripts/sync-sdk.mjs`
(`npm run sync:sdk`): exact file list, and a `VENDORED.md` that names
the commit of the copied SDK. The exporter (`export-store.mjs`) reads this copy. The
same script gives **every store tool** the SDK as a package: each Git
repository carrying a `chest.json` under `03_code/04_argentic-store` and
`04_argentic-store/Private` (`storeTools`, named by its GitHub origin — none can
be left behind), the SDK packed by `scripts/sdk-package.mjs` into its `vendor/`,
its `package.json` and lock following. The same
script copies the MCP server source, `@argentic/chest-mcp`, whose
public repository is `chest-by-argentic/Chest-MCP` (`03_code/03_chest-mcp`, its `src`),
into `tests/sdk/chest-mcp/src`: `npm run build` compiles it into `tests/dist`,
from where the VM proof launches it (“Agent API”). A copy is never modified
here: the change is made in the source repository, then synced. The SDK has no `chest.json`: the catalogue, which lists only
repositories carrying a manifest, never offers it (see “Catalogue”).

### Building from source

The Chest itself builds the **source code archive** of a tool (`tar.gz`),
the way Vercel builds a repository, and the tool then appears among the offers
of “Add a tool”. Nobody prepares or transfers an image. The source
of an archive is a linked GitHub repository, the catalogue (below) or a
checkpoint of a Perseus Code project (“Perseus Code: publishing”); the
registry's `POST /api/builds` route remains the entry point for the labs — the Tools page
no longer offers archive upload.

- **Source manifest** `chest.json` at the root of the archive
  (`chest/sourcefile`): `name` and `roles` follow the rules of the package
  manifest — the same parser checks them —, and `build` says
  how to build (below, “Source manifest”). `chest` names the contract
  version the tool needs (above); an invalid manifest is refused with the
  parser's words (reason `manifest`, detail the rule broken).
  Only the `node` runtime exists. Unknown or duplicate keys are refused,
  16 KiB at most. **Presentation**, optional:
  `title` (48 characters at most), `description` (160) — no control character (C0,
  C1) nor invisible formatting character (`sourcefile.ValidText`) —,
  `icon` and `preview`,
  paths of two images in the archive's `chest/` directory
  (`chest/<name>.svg|png` for the icon, 64 KiB at most; `chest/<name>.png|jpg|webp`
  for the preview, 512 KiB). The archive keeps in memory the sixteen files at most
  of `chest/` while the manifest is read, then checks each image by its
  bytes (PNG/JPEG decoded up to their dimensions, 4096 px at most; WebP by
  its container; SVG: an XML document whose root is `svg`, without DOCTYPE,
  script, `on*` handler, `href`, `use`, `image`, `foreignObject` or
  `url(`) — a missing image, or one that is not what its name says, refuses
  the archive. The build registry keeps title, description and image
  types in `status.json`, and the images as `<name>/icon` and
  `<name>/preview`; a failed attempt keeps the presentation of the
  ready build. `GET /api/tools` adds `title`, `description`,
  `icon` and `preview` (addresses `/api/chests/{chest}/apps/{app}/icon|preview`,
  served to the member who has the tool, with `Content-Security-Policy: default-src
  'none'; sandbox` — an SVG there is an image, never a page); a tool that
  the Chest did not build has none, and the interface shows its name and a
  placeholder image. The interface shows the same icon everywhere (home,
  tool list, tool page, catalogue): the one from `GET
  /applications`, otherwise, for a tool in service whose build
  keeps one (installed under a name other than its entry, being rebuilt),
  its address `/api/chests/{chest}/apps/{app}/icon` — also served to whoever
  runs the tool —, otherwise the one of the catalogue entry, otherwise the initial;
  never on the background of the placeholder drawings (`.favicon.forms` is black).
  **Role labels**, optional: `role_labels`, an object that gives
  roles declared in `roles` the words that show them —
  `{"editor": "Editor", "reader": "Reader"}` —, at most one per declared
  role (unknown or duplicate key, or empty object, refused), from 1 to 40
  printable characters with no space at either end (`sourcefile.ValidRoleLabel`:
  no control character nor invisible formatting character). A separate object
  rather than `roles` as objects: `roles` remains the list of identifiers that
  the package, the access rules, `Beyond`, the catalogue and the SDK read, and an
  earlier manifest remains valid as is. Presentation only, like the
  title: never in the built package (`Source.Package`), so neither in
  its digest nor in `Permissions`/`Beyond`, nor in the catalogue's
  `approval` — changing a label requires no approval. They follow
  the presentation: build registry (`role_labels` of
  `status.json` and of `GET /api/builds`, those of the ready build kept
  after a failure), catalogue entry (`GET /api/catalogue`), `POST
  /api/github/read`. The page shows a role by its label — that of the
  tool's build, otherwise of its catalogue entry, otherwise of the
  source shown —, failing that by its identifier with a capital letter
  (“Editor”); the identifier kept by the access rules and given to the tool
  (`Chest-Member`, `role`) does not change.
- **Source manifest** (server tool): `"chest": "0.5"` (above). Fields `name`, `roles`, `public` (boolean: the tool has a
  public part, shown and approved like the `public` permission — it
  stays closed at installation), `csp` optional — only value `"tool"`,
  and only with `public: true`: the public part sends its own
  `Content-Security-Policy` (“Public host”, further down); it is the `csp`
  permission, right after `public` (“Chooses the scripts of its public pages
  itself”, “Inline ones included; the Chest only prevents them from being
  framed in another page.”), which gaining requires approval —, `env` optional (the names of the variables that
  the tool expects: 1 to 32, `^[A-Z_][A-Z0-9_]{0,63}$`, each once, no name
  that the Chest sets itself — `packagefile.EnvName`: `CHEST_*`, `PORT`,
  `NODE_*`, `NPM_*`, `HOME`, `PATH`, `HTTP_PROXY`, `HTTPS_PROXY`,
  `ALL_PROXY`, `NO_PROXY` (network egress); informative, never a permission: a
  version that expects more asks for nothing more), the presentation
  above and `build`:
  `runtime` (`node`), `install` (exactly `npm ci`), `command` optional
  (`npm run <script>`), `start` (`npm start` or `npm run <script>`), `port`
  (1024 to 65535) and `static` optional (four prefixes at most
  `^/[a-z0-9._-]+(/[a-z0-9._-]+)*/$`, without a `.` or `..` segment, never `/chest/`
  nor `/_chest/`; absent, `["/_next/static/"]`). `<script>` follows
  `^[a-z0-9][a-z0-9:_-]{0,63}$`: each command becomes a fixed argument
  vector (`npm ci` → `npm ci --no-audit --no-fund`), never a shell —
  `npm run build && x`, `npx …`, spaces or capital letters are refused.
  `network` optional, the declared network egress (“Server tools”):
  1 to 32 entries, `*` alone, an exact host name or `*.<domain>`; names in
  lowercase ASCII (punycode allowed), labels
  `[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?`, at least two (after `*.` too),
  253 characters at most, last label not all digits; refused:
  IP addresses, `localhost` and its subnames, trailing dot, duplicates, an entry
  covered by another (`a.x.com` with `*.x.com`, anything with `*`);
  `*.x.com` covers any name under `x.com`, at any depth, not `x.com`.
  Each entry is a `network:<entry>` permission, after `public`
  (`packagefile.Permissions`): “Can reach <entry>”, “Can reach
  the whole Internet” for `*`; widening the list — an entry that none of the version in service
  covers (`packagefile.Beyond`) — is a new permission, which only the
  owner or an admin approves. `capabilities` optional, the Chest services
  that the tool uses: closed list, each once, `database`, `files`,
  `members`, `members.email` and `members.groups` — the last two only with
  `members` —, `notifications` and `ai` (“Server tools”, Database, Files, Members,
  Notifications, AI gateway); each is a
  permission, after `public` and before the network, in this order (“A PostgreSQL
  database of its own”, “The Chest keeps it; no other tool can
  reach it.”; “Keeps private files of its own, up to 1 GiB”, “Stored
  apart; shown only through a short-lived signed link.”; “Sees the name,
  photo, role and groups of the members who have access to it”; “Sees the
  email address of the members who have access to it”, both under People). With `files`,
  the optional key `files` asks the storage: `{"quota": "5 GiB",
  "maxObject": "100 MiB"}` (whole MiB or GiB; quota 100 MiB–100 GiB,
  object 1–512 MiB; any other key refused — a visitor's upload needs no
  key of its own: a tool with a public part could already take a
  visitor's bytes through its server, so the Chest's upload adds no
  power, only the bounds of “Files”); the permission is then
  `files:<quota>:<object>` (`files:5GiB:100MiB`, compact, canonical;
  the defaults stay `files`), stated “Keeps private files of its own, up
  to 5 GiB, 100 MiB per file”, and beyond a version that had less
  (`packagefile.Beyond`: larger quota or object). With `ai`, the key `ai`
  is required and says what for: `{"monthly": 20, "models": ["default",
  "embedding"], "purpose": "Summarises support tickets"}` — `monthly` whole
  euros 1–1000 (5 when absent), `models` 1 to 4 of the aliases `default`,
  `fast`, `smart`, `embedding`, each once (`["default"]` when absent),
  `purpose` 1–120 characters (`packagefile.ValidText`); the permission is
  `ai:<monthly>:<models>:<purpose>` (`ai:20:default,embedding:Summarises
  support tickets`, the aliases in that order), stated “Uses AI models
  through the Chest, up to €20 a month” with the purpose (and “Models: …”
  beyond `default`) under Data. Gaining AI is a new permission; another
  amount, other aliases or another purpose are not (`packagefile.Beyond`):
  the cap is the owner's. The pages state
  each permission by its consequence, grouped — Data, Network,
  People (the declared roles are stated there: “Has 3 roles: …”) —,
  at installation, at the approval of a proposal or a version and on
  the overview (`api.ts`, `permissionWords`; `Permissions` component) — gaining it is a new permission. `entry` and `permissions` are refused. The port, the
  prefixes, the public part, its policy, the capabilities, the network, the roles and `env`
  are checked by the package parser, on the v2 package that the
  manifest produces.
- **Archive** (`chest/sourcearchive`): 32 MiB compressed, 256 MiB unpacked,
  20,000 entries, regular files and directories only (no links, no
  devices, no extended attributes; the only global PAX header allowed is the
  `comment` that `git archive` writes), confined paths; `node_modules/` refused
  everywhere and `.git/` at the root — dependencies are installed by the
  Chest from the lock. An archive whose **all** entries sit under one
  same directory (`owner-repo-sha/…`, the shape of GitHub tarballs) has that
  directory as its root; a flat archive keeps its own — the archive is
  read once for its shape, then for its limits. `chest.json`,
  `package.json` and `package-lock.json` are required at the root. Extraction
  writes a private tree (0600/0700) into an empty directory and leaves out
  `Containerfile`, `Dockerfile`, their ignore files and `.chest-build/`
  (where the Chest places a server's launcher): the recipe is the Chest's.
  The files of `migrations/` are judged with the archive, by their rule
  (`chest/migrationfile`: below, the recipe), and refused without the
  capability `database` — never ignored. A refusal says why in one word
  (`sourcearchive.Refusal`, always `ErrInvalid`; `sourcearchive.Reason`):
  `no_manifest`, `no_package`, `no_lock`, `manifest` (with the parser's
  words), `migrations`, `node_modules`, `link`, `too_large`, `picture`,
  `tree`, `archive` — and `newer_chest` for a manifest written for a later
  contract, which is not `ErrInvalid`: the source may be right, the Chest is
  behind.
- **Generated recipe** (`chest/sourcebuild.ServerContainerfile`), never taken
  from the archive: `FROM <the package's pinned Node image>` (`runtime/base-image`,
  copy of `deploy/chest/base-image`, the package's only pin), `WORKDIR /app`, copy of
  `package.json` and the lock — and of `vendor/` when the tree has one (the
  SDK a Perseus Code draft depends on by file) —, `RUN ["npm","ci","--no-audit","--no-fund"]`, copy
  of the code, `RUN ["npm","run",<script>]` if `command` (exec form, without
  `--if-present`: a missing or failing script makes the build fail),
  `npm prune --omit=dev` and `chmod -R a-w,a+rX /app` (everything read-only, executables stay executable: busybox's `a=rX` removed their execute permission), **then** only the
  launcher: `COPY .chest-build/launcher.mjs /chest/launcher.mjs` and
  `chmod a=r` — outside the tool's tree, nothing it installs or
  builds replaces it —, for a tool that has a database its **migrations**:
  the files of `migrations/` at the root of the archive
  (`^[0-9]{4}_[a-z0-9_-]{1,64}\.sql$`, regular files, 256 at most,
  1 MiB each, 8 MiB in total, UTF-8 text without NUL — `migrationfile.Check`;
  a refused file makes the build fail with its reason), checked by the Chest and copied
  into its part of the context (`.chest-build/migrations/`), `COPY` to
  `/chest/migrations/` then `chmod -R a-w,a+rX` (the directory exists even when empty):
  a version's migrations are those of its approved image;
  `ENV NODE_ENV=production
  NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_CACHE=/tmp/npm PORT=<port>`,
  `ENTRYPOINT ["node","/chest/launcher.mjs",<start…>]`. The **launcher**
  (`chest/sourcebuild/launcher.mjs`, embedded in the executable, Node's
  standard library only) reads the tool's variables that the Chest placed
  in `/run/chest/env` (a JSON object of names and values), removes the file
  and adds them to the server's environment — none replaces a variable
  of the image or of the Chest; an unreadable file stops it (code 2) without revealing
  its content —, starts `start` inheriting the outputs, relays
  each connection from the unix socket `/run/chest/http.sock` (0600) to
  `127.0.0.1:$PORT`, forwards `SIGTERM`/`SIGINT` to the server and exits with its
  code; a missing command or an out-of-range `PORT` stops it immediately. An
  image built before variables existed has the old launcher: it receives them at
  its next build (the file, which that launcher leaves, is removed by
  the Chest as soon as the instance responds). The
  socket rather than a published port: publishing a port in rootless mode goes through
  pasta or slirp, which also provide network egress.
- **Build**: `podman --remote=false build --pull=never --layers
  --memory=1536m --memory-swap=1536m --cpu-period=100000 --cpu-quota=200000
  --cpu-shares=256 --ulimit=nproc=4096:4096 --cap-drop=ALL
  --security-opt=no-new-privileges`, ten minutes at most, output kept as a
  log (256 KiB, the end), readable during the build.
  - **Processes**: rootless, the build's processes count against the
    limit of the node's user with every other process of that user —
    the provider, PostgreSQL, the tools, the workbenches of Perseus Code
    and Perseus —: 256 made `npm ci` fail (`pthread_create: Resource
    temporarily unavailable`) beside two workbenches; 4096 bounds a fork
    bomb, which the memory limit bounds too.
  - **Memory and CPU** (`sourcebuild.BuildMemory`): 1.5 GiB without
    swap — a default Next.js build (Turbopack) reached 1.2 GiB,
    and 512 MiB were killed by the kernel on a VPS-1 (4 GB, 3.8 GiB
    usable, no swap, 2 vCPU); both CPUs, at a low weight
    (`cpu.weight` ≈ 10 versus 100): alone, the build runs at full
    speed; next to the Chest and its tools, it yields to them. Builds
    run one at a time and are not in the tools' budget
    (`toolmemory.Budget`, `MemTotal` − 1.5 GiB): before each one, the node reads
    `MemAvailable` (`toolmemory.Available`) and refuses the build if it
    does not have 1.5 GiB plus a 256 MiB margin (podman and buildah, which write the
    layers outside the limit) — cause `not enough memory to build`, log
    “Not enough memory to build: …” —, rather than endangering
    Keycloak and PostgreSQL. Outside Linux, no guard. On the VPS-1,
    ~2.6 GiB are available with the services and one tool: the build
    goes through; tools that take more make it refused, saying so.
  - **Node heap**: `ARG NODE_OPTIONS=--max-old-space-size=1024` at the top
    of both recipes — the environment of each `RUN`, never that of the
    image —: a Node that exceeds its heap stops with its error, readable,
    before the limit kills it silently; 512 MiB remain for a bundler's native
    memory and a second process.
  - **End of the log**: a stopped build says so on its last line —
    “Build stopped: memory exceeded (1.5 GiB).” when a
    process was killed (`signal SIGKILL`, `exit status 137` in the
    last lines: without a timeout, only the OOM killer sends it),
    “Build stopped: Node memory exceeded (1 GiB of heap out of 1.5 GiB).” for
    the heap error, “Build stopped: time limit exceeded (10 min).”; cause
    `build ran out of memory` or `build timed out`. These signs are read in the
    tool's output: a tool that prints them changes that line, nothing
    else.
  - **Live log**: podman writes its output, as it goes, into a
    bounded in-memory log (`sourcebuild.Log`, the same 256 KiB end) that
    the registry holds for the build in progress; `GET /api/builds/{name}/log`
    reads it while it runs, `build.log` is written to disk
    (`privatefs`) only at the end. A node stopped in the middle of a build loses that
    log along with it. The portal rereads the state and the log every three
    seconds on the tool's page while a tool is downloading, building
    or installing — installation or update, including after a
    page reload —, and retries three seconds later after a
    failed read; the block is open during a build and after a
    failure, and follows the end as long as the reader has not scrolled up
    (`useFollowEnd`: only a scroll that follows a reader's gesture — wheel,
    touch, key, press — stops following; back at the bottom, it resumes).

  **A build has no network but reads of the npm registry**
  (`--network=none --volume=<dir>:/run/chest:rw,Z`): each step that runs
  npm — the installation and its scripts, the author's build command, the
  prune — runs under the launcher (`node /chest/launcher.mjs …`, copied
  before the installation and again after the prune, so that nothing a
  package installed replaces it), which, with `ARG CHEST_EGRESS=1`, opens
  its egress socket in that directory and gives npm `HTTP_PROXY`; the node
  (`sourcebuild.Network`, `egressNode.buildNetwork`) serves there, for the
  build's duration, the proxy that reads the registry and nothing else
  (`egress.NewRegistryProxy`: `GET` and `HEAD` of `registry.npmjs.org`,
  asked in plain HTTP at `ARG NPM_CONFIG_REGISTRY=http://registry.npmjs.org/`
  — npm fetches the archives of a lock there too —, sent on in HTTPS
  under the registry's verified certificate; a tunnel only to its port 80,
  whose plain HTTP is read request by request under the same rule — Node's
  own client (`NODE_USE_ENV_PROXY`) tunnels even an `http://` URL —; no
  other method, no other host, the node's guard as for a tool), and logs each request in
  `installation/egress/builds/<tool>.jsonl`. The install scripts of the
  packages run (`--ignore-scripts` is not used: many packages need them —
  native modules, `esbuild`'s binary); they reach no other host, publish
  nothing, and find no secret: a build is given none of the tool's
  variables, no key and no token of the Chest. Known consequence: a
  package whose script downloads from elsewhere than the registry (a
  browser for `puppeteer`, the engines of `prisma`) fails to build, saying
  so in its log, as in a workbench. Until the Chest's names are known, a
  build does not start (“Build stopped: no way to the npm registry on this
  server.”). A tool's run-time container keeps `--network=none`
  (`chest/runtime`). `--layers` keeps the `npm ci` layer between two builds
  **of the same tool** with the same lock: the build cache; the recipe's
  `LABEL work.argentic.chest.tool=<name>` keys the layers by tool, so that a
  tool never reuses the layers another built.
  The built image is checked to be present, then bound to the package manifest
  written by the Chest (`{"name","image","permissions","roles"}`; for a
  server `{"version":2,"name","image","roles","public","csp","capabilities","network","server":{"port","static"},"env"}`,
  `public` written only if true, `csp` and `capabilities` only
  if declared, `network` only if
  declared, `env` only if it names variables, `static` always).
- **Build registry** `installation/builds/<name>/`: `source.tar.gz`,
  `build.log`, `status.json` (`building|ready|failed`, source fingerprint,
  the commit — or the checkpoint and its `project`, for a Perseus Code
  publication —, dates, image, cause; for a server `contract: 2` and `server`, its
  vectors, its port and its prefixes, and `env`, the variables it expects —
  its public part is among its permissions; a state that mixes the two
  contracts is unreadable) and
  `chest.json` for a ready build. The node is notified of each
  ready build, with its contract. The name is
  the one under which the tool is installed: that of the manifest, or the one that
  the intent names (`sourcebuild.Intent.As`, rule `access.ValidToolName`) —
  the archive's manifest must then give the approved name, `status.json`
  keeps it as `manifest`, and the `chest.json` that the Chest writes carries the
  installation name: the author's manifest is never rewritten. Six names at
  most — a name with no successful build offers nothing: when a new name has
  no room, the one that failed longest ago gives it its place (its source, its
  log, its state go), never a ready name, which only removing the tool
  forgets; all ready: `build quota exhausted` —, one build at a time, in the
  background: `POST /api/builds` answers 202
  as soon as the archive is accepted. A build in progress works in
  `<name>.building/`; when ready, it replaces the name's directory; when failed, it
  places its source, its log and its state there without touching the package of the
  last ready build, which remains offered. A build does not survive
  the node: at restart, a build left in progress is marked
  `failed: interrupted`. The log is that of podman and npm, shown to the
  owner as is: it is their information, it contains nothing of the Chest.
- **Offers**: at each `GET /api/installation`, the portal adds to the node's fixed
  offers the ready builds (`built: true`), read from the registry — no
  snapshot at startup. `POST /api/installation` installs them through the
  ordinary path (`InstallPackage`), under the installation lock; the build
  itself does not fall under it. A name already carried by a fixed offer is refused. A
  build is offered and installed like any other, then served as
  a server (“Server tools”). Routes: `POST /api/builds` (owner and admins;
  octet-stream, outside the interface); `GET /api/builds`, `GET /api/builds/{name}/log`
  (text) and `GET /api/installation` for whoever runs the tool — a builder
  sees only their own there; `POST /api/installation` (owner and admins).
- **Limits**: the built image is not in the server's backups;
  after a restore, the tool must be rebuilt (“Check now”
  on its repository) and its previous version is not there either.
  Builds exist on a node that has its package's `runtime` next to
  its installation; without it, the page has neither this block nor the GitHub link.

### Server tools

A `"version": 2` package is a **server**: the image built by the
server recipe (above), launched by the Chest, reached through its
launcher's socket and served behind the Chest's front end (`chest/toolfront`).
What exists: execution, supervision, versions without downtime, the **public
host** and the **team host** (`/chest` for members, `Chest-Member`
assertion), the tool's **variables**, its declared network egress, its
**database** and its **files**. One server, two hosts: the public part on
`<tool>.<chest>.<base>`, the members' part on `<tool>-chest.<chest>.<base>`
— two origins, a script of the public part never sees the session.

- **Container** (`chest/runtime/server.go`, `serverArgs`, the only values):
  `podman run --rm` in the foreground, `--network=none`, read-only
  root, `/tmp` as a 64 MiB `noexec` tmpfs, `--userns=keep-id` and
  the node's user, all capabilities dropped, `no-new-privileges`,
  its memory (256 MiB by default, without swap: “Memory”, further down), 1 CPU,
  256 processes, 1024 descriptors, neither Podman's proxy nor its
  log (`--log-driver=none`: what the instance writes goes to the
  node, “Logs” below). The only mount is `s/` of a private directory (0700) specific to
  the instance, at `/run/chest`, where the launcher opens `http.sock`: the tool writes
  into `s/`, under the Chest's uid (`keep-id`), but does not see the instance's
  directory and cannot replace `s/`. This directory is in `/dev/shm`, a
  tmpfs (checked by `statfs`, otherwise no instance starts —
  `runtime.ServerDir`): a tmpfs page is charged to the memory (cgroup v2) of
  the process that writes it, so what the tool leaves there weighs on its own
  memory, without swap, and never reaches the host's disk — a per-tool quota
  or a tmpfs of its own would require root. The directory goes with the
  instance; that of a node killed outright stays until the host restarts.
  What it leaves there is never
  followed: the Chest reaches the socket through `chest/toolsocket` — on Linux,
  the entry opened with `O_PATH|O_NOFOLLOW` (a link opens as a link),
  checked by `fstat` (a socket, owned by the Chest's uid, with a single name) and reached through
  `/proc/self/fd/<n>`, the inode checked, with no race between the check and
  the connection; a link, symbolic or hard, to another socket of the `chest` account, a file
  or a socket of another account are refused. Elsewhere (macOS, tests
  only): `Lstat` then connect, a race remains possible. `CHEST_TOKEN`
  (32 random bytes per instance, base64url) goes through Podman's
  environment, named only in the arguments (`--env=CHEST_TOKEN`);
  `CHEST_TOOL` is the tool's name; `CHEST_EGRESS=1` only when it
  declares network egress, `CHEST_DATABASE=1` when it has a database,
  `CHEST_API=1` when it keeps files, reads its members, notifies them or
  calls AI (below); `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE` and
  `CHEST_LANGUAGE` for every tool (“What a tool is told of its Chest”). The tool's variables are neither
  in the arguments nor in Podman's environment: `RunServer` writes them
  (JSON, 0600, names rechecked by `packagefile.EnvName`) to `s/env` of the
  instance's directory, which the launcher reads and removes at startup; the
  supervision also removes it as soon as the instance responds, and the directory goes
  with the instance. Name `chest-<scope>-<instance>`,
  labels for the scope (fingerprint of the state path, `runtime.ScopeOf`) and
  for the instance. On stop, `SIGTERM` relayed to the launcher, `SIGKILL` 15 s
  later, then removal by the container's identifier. When the
  supervision starts, `RecoverServers` removes the containers left by a
  previous run, the scope label checked on the immutable
  identifier — a container with another label is not touched.
- **Declared network egress** (`chest/egress`, manifest `network`): the
  container keeps `--network=none` and its single mount. With `CHEST_EGRESS=1`,
  the launcher also listens on `/run/chest/egress.sock` (0600) for the Chest and
  `127.0.0.1:<ephemeral port>` for the tool, chosen before starting it, and
  gives only the tool `HTTP_PROXY`, `HTTPS_PROXY` (and their lowercase forms) =
  `http://127.0.0.1:<port>`, `NO_PROXY=localhost,127.0.0.1,::1` and
  `NODE_USE_ENV_PROXY=1` (Node ≥ 24.5: `fetch` and `node:http(s)` follow
  them; the pinned image is Node 24.21); without it, it removes any inherited
  proxy variable. **The Chest connects to the container, never
  the reverse**: as soon as an instance is launched (`runOnce`, before it
  responds), it keeps “carriers” open in `egress.sock` — four
  idle, 32 at most, through `chest/toolsocket` (never through a link); each
  connection of the tool to the port takes an idle carrier (10 s at most, then
  closed), the launcher writes the byte `0x01` into it then relays both directions
  (`chest/carrier` and the launcher's `reverse`, the transport shared by every
  Chest service that a tool reaches from its container); on the
  Chest side, a received carrier is a proxy connection (`http.Server` on
  a `net.Listener` of carriers), and another one is opened. **Proxy**
  (`egress.Proxy`, one per instance, policy of its version): `CONNECT`
  to port 443 or 80 of a declared host (80 because `fetch` also tunnels
  plain HTTP), request `http://host[:80]/…` in absolute form;
  400 for `https://` in absolute form, a request in origin form,
  `Upgrade`, a `CONNECT` without a port; otherwise a 403 refusal with
  `Chest-Egress: refused; reason=<undeclared|address|port|ip-literal|limit|dns>`
  (429 for `limit`; `sni`, below, is stated only by the log). **Verified TLS name**: a tunnel to port 443
  lets nothing through upstream before the tool's ClientHello, read with
  the standard TLS library's parser (`common/tlshello`, the one of the
  front end: 16 KiB and 5 s at most, nothing is answered); its name (SNI, in
  lowercase without a trailing dot) must be the `CONNECT` host, and no name
  for an IP address. Otherwise — another name, none, no TLS, a ClientHello too
  large or too slow —, the already accepted tunnel is closed before any byte
  has left, and the log says `refused`, `reason=sni`; the ClientHello
  then passes as is. A tunnel to port 80 is not read. A name
  is lowercased without a trailing dot, then
  compared to the list (`packagefile.NetworkCovers`); an IP address is
  allowed only under `["*"]`. The name is resolved **once** (the node's
  resolver, `/etc/hosts` included): a single forbidden answer refuses the host, and
  only the checked addresses are dialed, one after another, 10 s in
  total, never resolved again; `Dialer.Control` rechecks the address
  at connection time. **Always forbidden**, whatever the
  list (`egress.Forbidden`, after `Unmap`): IPv4 0/8, 10/8, 100.64/10,
  127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, 224/4,
  240/4; IPv6 `::`, `::1`, `::/96`, `100::/64`, `2001::/32`, `2002::/16`,
  `fc00::/7`, `fe80::/10`, `fec0::/10`, `ff00::/8`, an address with a zone;
  NAT64 `64:ff9b::/96` and `64:ff9b:1::/48` judged by their IPv4; every
  address of the node's interfaces (read at each connection); the
  Chest's names — portal host, tools domain, provider — and any name
  under them, and their addresses (reread every 5 min). The
  documentation ranges (192.0.2/24, 198.51.100/24, 203.0.113/24, 2001:db8::/32)
  remain allowed: the lab uses them. Relayed HTTP: connection
  headers and any `Proxy-*` removed, neither `Via` nor `X-Forwarded-For`
  added, redirects returned as is, never followed, 60 s for
  the response headers. **Limits** per instance: 32 connections at a
  time, 60 new ones per minute (burst of 30) — the registry way of a build
  or a workbench reads package after package: 3,000 a minute (burst of
  1,500) —, a tunnel closed after 5 min
  of silence or 1 h; throughput is counted, not limited. **Log**
  `installation/egress/<tool>.jsonl` (`chest/jsonjournal`, outside
  `apps/<tool>/`, outside backups): one JSON line per finished connection — `t`, `host`,
  `port`, `kind` (`connect|http`), `ip`, `outcome` (`ok|refused|failed`),
  `reason`, `up`, `down`, `ms` —, never a path, a query, a header
  or a body; the same refusal repeated within the minute makes one line with
  `count`; 1 MiB then `.jsonl.1` (a single previous one); a line older than
  **30 days** (`egress.Retention`) is removed when the log is opened, then
  once a day, and never shown. The log is kept when a
  version replaces another, with or without network egress, and deleted
  with the tool (`egress.RemoveLog`, in `nodeApplications.Uninstall`). The
  node's log receives only the proxy's failures. **“Network”
  tab** (`/tools/{name}/network`) of a server tool, for whoever
  runs it: `GET /api/tools/{app}/network` (`chest/portal/tool_network.go`,
  `serverRunner`: 403 for a member or the builder of another tool, 404
  for a removed or missing tool, `Cache-Control: no-store`) →
  `{"declared":[…],"entries":[…]}` — the entries that the version in
  service declares and the last 200 lines of the log (30 days), most
  recent first (`egress.ReadLog`). The page states each entry like
  the approval (“Can reach allowed.egress.test”), or “No outbound
  network access.”, which is always refused, then one row of the portal's
  list per connection: the time, `host:port`, the outcome (“Succeeded ·
  <address> · HTTPS”, “Refused: undeclared host”, “forbidden
  address”…, “different TLS name”, “Failed”) and the bytes sent and received. A node that does not yet know the
  Chest's names serves no carrier: the tool does not get out. Limits: a
  client that ignores the proxy variables (hand-made HTTP agent,
  `ws`…) does not get out (workaround: `README.md` of `tests/apps/testweb`);
  in a TLS tunnel, only the ClientHello's name is seen: the encrypted `Host`
  header that follows is not, and an encrypted ClientHello (ECH, different outer
  name) is refused; the build has the network open
  (“Building from source”).
- **Logs** (`chest/toollog`, `cmd/chest/application_logs.go`): what
  the instances of a server tool write on their standard output and
  error — its server, its launcher, and Podman about the container — and the
  Chest's lines about their life. **Capture**: `podman run` stays in the
  foreground with `--log-driver=none` and relays both streams onto its own, which
  `RunServer` passes to the node (`runtime.ServerOutput`, pipes read by
  `os/exec`). Chosen rather than Podman's `k8s-file` or `journald` driver:
  nothing is added to the container (no file, no mount, no
  socket), the tool writes on its output as always and has no path
  to a file of the node; Podman writes nothing to disk (`k8s-file`
  would keep the log in its storage, lost at the `--rm` of a stopped
  instance, hence at the very moment it is useful; `journald` would mix it into the
  account's journal, with no limit per tool nor deletion on removal). The node limits what
  it keeps: a line cut at **4 KiB** (`cut`, the rest read and discarded;
  the node holds only one line per stream in memory), stripped of
  terminal escape sequences and control characters, invalid UTF-8
  replaced. **File** `installation/logs/<tool>.jsonl` (0600,
  directory 0700, outside `apps/<tool>/`, outside backups:
  `backup-server-linux.sh` excludes it): one JSON line per written line —
  `n` (number, which only grows, resumed on opening), `t` (UTC, to
  the millisecond), `stream` (`out|err|chest`), `line`, `cut` —, **5 MiB**
  then `.jsonl.1` (a single previous one: 10 MiB at most per tool); a line
  older than **7 days** (`toollog.Retention`) is removed on opening
  then once a day, and never read — a journal of `chest/jsonjournal`,
  the one journal library of the Chest. A tool that writes nonstop
  rotates only its own log. Kept when a version replaces
  another, deleted with the tool (`toollog.Remove`, in
  `nodeApplications.Uninstall` and when an installation is abandoned). **Chest
  lines** (`stream: "chest"`): “Instance started” (it responds),
  “Instance stopped (code N)” (stopped by itself, 137 for a `kill`),
  “Instance stopped” (stopped by itself, without an exit code),
  “Instance stopped by the Chest” (replaced by a newer instance, the tool
  removed, the node stopping),
  “Instance not responding after 1 min: stopped”, “Instance not started:
  the Chest could not prepare it”, “Restarting in 4 s”,
  “New version live: fef81f1” (the commit, otherwise the beginning of
  the approval), “New version not deployed: …”, “Previous
  version restored: …”, “Redeployed: new instance
  live”. After every instance that ended without the Chest asking, the
  supervisor writes “Restarting in …” right after the line that says why:
  the overview reads how the instance does from the last of “Instance
  started” and “Restarting in …” (`chest/web/portal/src/health.ts`), every
  other line being no news of the instance in service — a switch of version
  (“Instance started”, “Instance stopped by the Chest”, “New version live”)
  stays “Responding”. **Secrets**: the Chest never adds a variable's value
  nor a credential; what a tool writes — including a variable it
  prints itself — is shown to whoever runs it (owner, admins,
  its builders), as in Vercel. **API** `GET
  /tools/{app}/logs?after=<cursor>&limit=<n>` (`chest/portal/tool_logs.go`,
  `serverRunner`: 403 for a member or the builder of another tool, 404
  for a worker or a missing tool; query allowed by `Allow`, `after` and
  `limit` only, otherwise 400; `Cache-Control: no-store`) →
  `{"lines":[{"t","stream","line","cut"?}…],"cursor":"<n>","reset"?:true}`
  — the lines after the cursor (without `after`: from the beginning), oldest
  first, `limit` at most (200 by default, 1 to 500; if there are
  more, the most recent ones); `cursor` is to be given back as `after`. `reset`:
  the cursor is not from this log (tool removed then reinstalled under this
  name) — the lines are the latest ones, to be shown instead. The current
  file is read before the previous one: a rotation between the two shows
  a line twice (kept once), never zero times. This is the API that an
  agent or the SDK will read: the same session, the same rights, the same
  cursor. **“Logs” tab** (`/tools/{name}/logs`, after
  “Deployments”, server tool): the last 500 lines then, every
  3 s while the tab is open, the ones after; 2000 kept in the
  page. Every log of the portal is one view (`LogView`): the Logs tab, the
  last five lines of the overview and a build's output (Deployments) — one
  line per row in monospace — date and time to the second (a build's line:
  its number), the text, “[truncated]” —, the error output in red, the
  Chest's lines (a build's `STEP n/m:` lines) on a paper background, in a box
  of 240 px to 60 % of the window that scrolls inside; the view follows the
  last line unless the reader has scrolled up (`useFollowEnd`), and again at
  each filter; a “Filter” field (substring; the Logs tab and a build's log)
  and “All / Errors” (the Logs tab; errors: error output and Chest lines),
  the reader's own while the log grows.
  **The Chest's own log** (`cmd/chest/node_log.go`, `installation/logs/node.jsonl`,
  the same journal as a tool's, `toollog.Node`: `node` is never a tool's
  name), from the portal's first start (before, the installation does not
  exist: the central prepares it): the node's standard error goes through a pipe that writes every
  byte to the service's journal first, then keeps each line (`stream:
  "chest"`) — its own lines and its servers' (`common/serverlog`); what the Go
  runtime prints on a crash goes to the service's journal alone. **All logs
  together** (`toollog.ReadAll`, `nodeApplications.AllLogs`): the Chest's log
  and every server tool's, one timeline in the order printed (a stable sort
  by `t`, each log staying in its order), newest last, `limit` at most — the
  newest. **API** `GET /api/logs?after=<cursors>&limit=<n>` and `GET
  /api/v1/logs` for an agent (owner and admins only, 403 otherwise: a
  Builder reads its tools' own; same query rules, `after` 8 KiB at most) →
  `{"lines":[{"source","t","stream","line","cut"?}…],"cursor":"node:12,web:40"}`
  — one cursor per log (256 at most), a log the cursor does not name read
  from its start, one whose cursor is not its own read again from its last
  lines. **Settings → Logs** (`/settings/logs`, owner and admins): the same
  view, polled every 3 s, 2000 lines kept, with a “Source” choice —
  “Everything”, “The Chest”, or one tool — and a column naming each line's
  source.
  **Download** (`toollog.Export`, `nodeApplications.ExportLogs`,
  `chest/portal/tool_logs.go`): a log as a text file the browser saves.
  `GET /api/tools/{app}/logs/download?since=&until=` for whoever reads the
  Logs tab, with the same rights and the same redaction (`serverRunner`; a
  builder who does not see the tool's data gets the Chest's lines only);
  `GET /api/logs/download?source=&since=&until=` for the owner and the
  admins only (403 otherwise; `source` = `node`, a server tool in service —
  404 for another name —, every log together when absent). `since` and
  `until` are RFC 3339, each once (the start of the logs and now when
  absent; a time to come is now; `since` after `until`, another key, a value
  over 40 bytes: 400). The answer is `text/plain; charset=utf-8`,
  `Content-Disposition: attachment; filename=chest-<tool|node|all>-logs-<date
  of until, UTC>.txt`, one line per line printed in the order printed:
  `<t>\t[<source>\t]<stream>\t<text>[ [truncated]]` (the source column when
  every log is written together). It is streamed, never held whole: each log
  is read line by line (`jsonjournal.Reader`: its previous file then its
  current one, as they were when opened — the current one opened first, a
  line in both read once by its number —, only the lines within the period
  and the retention) and the logs merged as they are read (the oldest next
  line first, the first log named on a tie, as `ReadAll`), into 64 KiB blocks;
  the route releases the session first (`Allowance.Stream`, `core.Settle`),
  and each block gets 30 s to leave (a write deadline moved on each block: a
  reader who stops taking is cut, a long download is not). A log that cannot
  be read before the first block is a 503; after it, the connection is cut
  (`http.ErrAbortHandler`): a file left short is never given as whole. No
  API v1 route: an agent pages `GET /api/v1/logs`. In the portal, a
  “Download” menu at the end of the bar of the Logs tab and of Settings → Logs
  (`LogView`, `download`): “Last hour”, “Last 24 hours”, “Last 7 days” (the
  retention), `since` taken at the click; on Settings, the log shown is the
  one downloaded.
- **Database** (`chest/tooldatabase`, `cmd/chest/application_database.go`,
  manifest `capabilities: ["database"]`): one PostgreSQL database per tool, in
  **a cluster dedicated to tools** — never the provider's, whose
  local socket is in `trust` —, which the node launches for the first tool that
  needs it and supervises like a server (1 s, 2 s… 5 min, never abandoned).
  - **Container** (`chest/runtime/database.go`): `podman run --rm` in the
    foreground of the node's PostgreSQL image — that of its dependency
    binding (`dependencies.json` next to the installation), the same as
    the provider's, or, in the lab only, the one that `node.json` names
    (`portal.tools_database_image`) —, `--network=none`, read-only
    root, all capabilities dropped, `no-new-privileges`, the image's
    `postgres` user (uid 999) as the node's user
    (`--userns=keep-id:uid=999,gid=999`), 384 MiB, 1 CPU, 128 processes,
    neither log nor proxy; three mounts of
    `installation/tools-database/` (0700): `data/` (the cluster), `socket/`
    (where PostgreSQL opens `.s.PGSQL.5432`), `config/` read-only
    (`pg_hba.conf` and `admin-password`). PostgreSQL: `listen_addresses=''`
    (no TCP), the Chest's `hba_file`, 64 sessions, 48 MiB of buffers,
    `log_statement=none`, `log_min_messages=fatal`,
    `log_min_error_statement=panic` — nothing a tool sends is
    logged. Label `dev.chest.tools-database=<fingerprint of the directory
    path>`: at startup, what a killed node left behind is stopped (30 s,
    `postmaster.pid` refuses a second server) then removed; on stop,
    `SIGINT` (fast shutdown), 40 s at most. Initialized once by `initdb`
    in the image (superuser `chest_admin`, password
    `config/admin-password`, 32 random bytes; `--auth-local=scram-sha-256
    --auth-host=reject`, UTF-8, C locale) in `data.new`, put in place
    only when complete. `pg_hba.conf`, fixed, rewritten at each opening:
    `local all chest_admin scram-sha-256`, `local sameuser +chest_tools
    scram-sha-256`, `local samerole +chest_readers scram-sha-256` (a
    tool's reader, in the tool's database only), `local all all reject`.
  - **Tool role and database** (`Cluster.Ensure`, at each start of an
    instance): role and database `t_<tool>` (`-` becomes `_`), role `LOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
    CONNECTION LIMIT 24` member of `chest_tools`, `statement_timeout` 30 s,
    `idle_in_transaction_session_timeout` 60 s, `lock_timeout` 10 s,
    `temp_file_limit` 256 MiB, `timezone` the Chest's (`access.Policy.Zone`,
    set again at each start: the sessions of a new instance, its migrations
    included, have the Chest's `current_date`; a session may set its own);
    a Perseus Build preview role likewise (`EnsureDraft`); database `OWNER` the role, `TEMPLATE template0`,
    `REVOKE ALL … FROM PUBLIC`, the console guard (“Console”);
    `postgres` and `template1` closed to all
    except the superuser. Derived password: base64url(HMAC-SHA256(
    `installation/tools-database/secret`, “chest tool database v1\0” +
    tool)), never stored, set again at each start as a
    SCRAM-SHA-256 verifier computed by the Chest (the password never
    passes in clear into the cluster). The registry `registry.json` names
    the tools that have a database, before it exists.
  - **Tool access**: like network egress, through carriers
    (`chest/carrier`) — `CHEST_DATABASE=1`, the launcher listens on
    `/run/chest/database.sock` (0600) for the Chest and `127.0.0.1:<ephemeral
    port>` for the tool; each connection takes a carrier, which the Chest
    links to the cluster's socket (`Cluster.Relay`); two idle
    carriers, ten connections at most per instance (24 for the role: two
    instances during a switchover and the Chest's sessions). The tool's
    container keeps `--network=none` and its single mount. Credentials:
    private file `s/database` (JSON `{user,password,database}`, 0600) written
    by `RunServer` next to `s/env`, read and removed by the launcher, also removed
    by the supervision as soon as the instance responds; the launcher provides
    `DATABASE_URL=postgres://t_<outil>:<mot de passe>@127.0.0.1:<port>/t_<outil>?sslmode=disable`
    and `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, which take precedence
    over a tool variable of the same name; nothing in the arguments nor
    Podman's environment. Without the file, the launcher does not start.
    Isolation: the tool's password, `pg_hba` (`sameuser`), the
    `REVOKE` — the provider's database is not in this cluster and has no
    route from the container. **Known leak**: `pg_database` and
    `pg_roles` show a tool the names of the others.
  - **Migrations** (`Cluster.Migrate`, read from the image by
    `runtime.ToolMigrations`: `podman create --pull=never --network=none`,
    bounded `podman cp <container>:/chest/migrations -`, `podman rm`; one
    read per image): run **as the tool** (never `SET ROLE` from
    the superuser), in name order, each `BEGIN` → the file
    as a simple query → `INSERT INTO chest_migrations (name, sha256)` →
    `COMMIT`, `statement_timeout` 5 min; a file that ends its own
    transaction is refused. `chest_migrations` (`name` key, `sha256`,
    `applied_at`) belongs to the tool, created by `Ensure`. At
    **installation** (`nodeApplications.Install`, after the inventory,
    before the first instance; a failure — a migration, or a first
    instance that does not respond within the installation time — removes
    the tool from the inventory, along with its database; the inventory refuses a package under
    a name other than its own) and at
    **update** (`Update`, after the contract check, **before**
    the inventory names the version): a version that lacks a
    migration already run, or that changed one, is refused before any
    effect; a failing file leaves nothing of itself, the version in service
    keeps running, and the reason (“migration 0004_broken.sql failed (SQLSTATE …);
    the version in service runs on”) goes up to the portal
    (`portal.RefusedVersion`): the route's response, the reason of a
    deployed build or of the catalogue. At **node startup**, the
    migrations not yet run for the version in service are run before its first
    instance, without refusal (a version rolled back keeps what was
    run beyond it). Rollback and redeployment run none:
    **a migration must leave the previous version working**.
  - **Removal**: after removal from the inventory, `DROP DATABASE … WITH
    (FORCE)`, `DROP ROLE`, then the registry; an interrupted removal is finished
    at the node's next startup (any tool in the registry that the inventory no
    longer names). Replacing the source keeps the database (same name).
  - **Backups**: the whole cluster, cold, in the nightly archive
    (`deploy/backup.md`); no per-tool export, not in the
    `provision.Capture` snapshots.
  - **Size**: `pg_database_size` read by the superuser
    (`Cluster.Size`) when the page asks, at most every 10 minutes
    (kept in between), never by starting the cluster for it; shown
    against an indicative 1 GiB, marked beyond it, nothing is refused.
  - **Console** (`chest/toolconsole`, `tooldatabase.Console`): the database
    as seen by whoever runs the tool — its tables, their structure, their
    rows, an SQL query. **Never the superuser**: what writes goes as the
    tool (`t_<tool>`), what reads (`toolconsole.Reads`) as its **reader**
    (`r_<tool>`, “Reader” below): one sees only what the tool sees. A
    new session per request, startup parameters that take precedence over those
    of the role: `statement_timeout` 10 s, `lock_timeout` 5 s,
    `idle_in_transaction_session_timeout` 15 s, UTF-8,
    `standard_conforming_strings=on`, `bytea_output=hex`, ISO dates in the
    Chest's zone (as the tool's sessions: its `current_date` is the tool's),
    ISO 8601 intervals; the end of the request sends a cancel
    request to the cluster (`CancelRequestContextWatcherHandler`), then
    cuts the connection 2 s later; a message from the cluster beyond
    8 MiB ends the session (`too_large`). The role's budget (24): 20 for
    two instances, `Ensure` and `Migrate`, two console sessions.
    - **Reader** (`prepareReader`, at each `Ensure`, a superuser transaction
      in the tool's database): role `r_<tool>` `LOGIN BYPASSRLS INHERIT
      CONNECTION LIMIT 4` (the rest `NO…`), password derived under another
      label (“chest tool database reader v1\0”), member of `chest_readers`, of
      `pg_read_all_data` (all tables, views and sequences of the only
      database it can reach; `BYPASSRLS`: the rows that the tool, as owner,
      sees) and of `t_<tool>` **for `pg_hba` only** (`samerole`), `WITH
      INHERIT FALSE, SET FALSE`: none of the tool's privileges — neither
      `pg_terminate_backend` nor `pg_cancel_backend` on its sessions — and
      never the tool (`SET ROLE`, `set_config('role')` refused). In the
      tool's database, advisory locks (`pg_advisory_*`,
      `pg_try_advisory_*`) and `pg_notify` are revoked from `PUBLIC` and
      granted to the tool's role alone: a reader neither holds the tool's
      locks nor wakes its listeners (a notification from a read, rolled back,
      would never be sent anyway). `CONNECT` on the database comes last: a
      preparation that fails leaves a reader that cannot connect, and the
      console reads nothing (fail closed); the tool keeps running. Removed,
      the tool takes its reader with it (`Drop`). A `SECURITY DEFINER`
      function of the tool runs as the tool, by design, and still writes
      nothing from a read: every transaction of the reader is `READ ONLY`
      (the console begins it so, and the role's
      `default_transaction_read_only = on` makes any other one so).
    - **Reading**: in a `READ ONLY` transaction (a function that writes,
      called by a `SELECT`, fails: `read_only`, a `SECURITY DEFINER` one
      included), as the reader. Overview: the
      first 1000 tables, views, materialized views and foreign tables
      outside `pg_catalog`, `information_schema`, `pg_*` and `chest_console`,
      with their primary key and an estimated row count (`reltuples`),
      plus the migrations run (`chest_migrations`). Structure: columns
      (`format_type`, default, position in the key, generated, identity),
      indexes (`pg_get_indexdef`), constraints (`pg_get_constraintdef`).
      Rows: the table and each column are **resolved in the
      catalog** then written in quotes, every value goes as a
      parameter; 100 rows per page (500 at most), filters `eq`, `ne`,
      `lt`, `le`, `gt`, `ge` (value read in the column's type),
      `contains` (`ILIKE` on the text, `%` and `_` escaped), `null`,
      `not_null` (8 at most); `search`, a text (200 characters at most)
      searched in the text of all columns (`ILIKE`, a single
      parameter, conditions joined by `OR`); in key order (by default,
      or sorting on a single-column key), pagination by key (`after`) or
      by `OFFSET`; otherwise `sort` or up to 4 `sorts` (a column
      once) then the key, `OFFSET`; `OFFSET` capped at 10,000. `count` adds
      the number of rows that filters and search keep, read before the page
      under a savepoint with a `statement_timeout` of 2 s (beyond that,
      the page comes without it, the transaction intact). A value
      of a long-text type is cut in the cluster
      (`left(…::text, 8193)`) then at 8 KiB on a character boundary, the cell
      marked (`cut`); 4 MiB per response.
    - **Sealed values** (`toolseal.Is`): a text that is a sealed value of
      the tool (`chest:sealed:1:…`), or the start of one the console cut,
      is answered as it is and named in `sealed` — a row's columns
      (`Row.Sealed`), a statement's cells (`QueryResult.Sealed`, row and
      column) —: the Data tab shows “Sealed” (“Sealed · editor” for the
      roles it says), never the text; the console holds no key and opens
      nothing, for whoever asks, the owner and the agents included.
    - **Values in JSON** (by OID): `NULL` → `null`, `bool` → boolean,
      `int2`, `int4`, `oid`, `float4/8` → number (`NaN`, `±Infinity` →
      text), `int8`, `numeric`, `money` → text (beyond what a
      browser counts exactly), `json`/`jsonb` → the document, everything
      else → PostgreSQL's text.
    - **Writing a row**: only a table (or partitioned table) that
      has a primary key, never `chest_migrations`; insert (unnamed columns:
      their default; generated column refused), update and
      delete by the key **and the version read** (`xmin`): a row
      changed or deleted since → `row_changed`, nothing is written. A
      JSON value is passed as text (string as is, `null` →
      `NULL`, otherwise its JSON).
    - **SQL query** (64 KiB at most): **a single statement**, read by
      a lexical analyzer (`statement.go`: `--` comments and nested `/* */`,
      strings `''`, `E''` with its backslashes, `B''`, `X''`,
      `N''`, `U&''`, dollar-quoted strings, quoted names) then
      sent through the extended protocol (which in turn refuses several
      statements). Kinds: read (`SELECT`, `VALUES`, `TABLE`, `SHOW`,
      read-only `WITH`, `EXPLAIN` of a read), write (`INSERT`,
      `UPDATE`, `DELETE`, `MERGE`, modifying `WITH`, `EXPLAIN ANALYZE`
      of a write), structure (`CREATE`, `ALTER`, `DROP`, `COMMENT`,
      `GRANT`, `REVOKE`, `SECURITY LABEL`, `IMPORT`, `REASSIGN`, `SELECT …
      INTO`), refused (`transaction`: `BEGIN`, `COMMIT`, `SAVEPOINT`…;
      `session`: `SET`, `RESET`, `LOCK`, `LISTEN`, `NOTIFY`, `PREPARE`…;
      `unsupported`: `COPY`, `DO`, `CALL`, `TRUNCATE`, `VACUUM`,
      `REFRESH`…; `several`, `empty`, `unterminated`). Read by default,
      `READ ONLY` transaction, 1000 rows and 4 MiB at most (beyond: the
      query is canceled, `truncated`); a write requires `write` and
      is run **as a dry run** (executed, counted, rolled back) as long as `commit`
      is not given. **The structure never changes here**: a structure
      query is not run, the response is `structure` with the
      migration that would do it (`NNNN_<first words>.sql`, the number following
      the migrations run, the text of the query).
    - **Guard** (`guardConsole`, set by the superuser at each
      `Ensure`, in a session with `search_path = pg_catalog, pg_temp` given at
      startup — the tool owns its database and can give it a
      `search_path` of its own (`ALTER DATABASE … SET`): an operator, a type or
      a function of the tool is never what a superuser query
      resolves to, `superuserOn`): in the tool's database, a `chest_console` schema owned by the
      superuser (`REVOKE ALL … FROM PUBLIC`, `USAGE` only for the
      tool's role): a table `sessions(pid, backend_start)`, a
      function `register()` (`SECURITY DEFINER`, fixed `search_path`,
      `EXECUTE` for the tool's role only) that refuses (`CHGRD`) without the
      trigger and registers the calling session, and an event
      trigger `chest_console_refuse` (`ddl_command_start`, `ENABLE
      ALWAYS`) whose function `refuse()` (`SECURITY DEFINER`,
      fixed `search_path`) refuses (`CHDDL`) any structure change
      **from a registered console session** — the one that writes, whether the
      change comes from the query or from a tool function that it
      calls. The tool's own sessions (its execution, its
      migrations) never register: never refused. Every console
      write (row or query) registers first, after having
      checked that the schema belongs to the superuser (a
      `chest_console.register()` function that the tool might have made is never
      called); **without the guard, the console writes nothing** (503). The tool
      can neither remove nor disable the guard (nothing belongs to it, an
      event trigger belongs to the superuser,
      `session_replication_role` too); a `chest_console` schema that
      the tool might have created before the guard is not taken over: the console does not
      write there. **Limits**: an event trigger does not see
      shared objects — an `ALTER ROLE` (its password, its settings)
      or `ALTER DATABASE` done by a tool function called in
      a write goes through (the tool can already do it itself; `Ensure` sets the
      password and the limits again at the next startup); the
      `chest_console` schema is visible to the tool in `pg_namespace`.
    - **Journal** (`toolconsole.Journal` on `chest/jsonjournal`, `installation/tooldb-journal/<tool>.jsonl`,
      0600, outside the Compartment and the backups): one line per request
      — the time, the member and, for a request from the agents' API, the
      token's name (`token`, “via token X”), the action (`overview`, `structure`, `rows`,
      `insert`, `update`, `delete`, `query`), the named table, the statement
      kind, the outcome (`ok`, `dry_run`, `committed` or the error
      code) and, for a write, the number of rows; **never the
      SQL text, a value or a key**. Rotated at 1 MiB (one previous
      file kept), lines older than 90 days removed on opening
      then once a day.
- **Sealed values** (`chest/toolseal`, `cmd/chest/application_files.go`,
  `chest/portal/sealing.go`, manifest `capabilities: ["sealed"]`,
  [spec](../../../01_produit/02_specs/sealed-data.md)): a value the tool
  seals through its Chest, kept sealed in its own database, opened again by
  the tool only, on the request of a member who has it. The rule: the
  Chest's own screens, its agents' API, its logs and backups never open a
  value — the owner included.
  - **Keys** (envelope): the **Chest key** (`installation/sealing.key`, 32
    random bytes, 0600), made at the first value sealed with a **recovery
    code** (160 random bits, base32 in groups of four,
    `installation/sealing.recovery` until the owner says it is saved) and
    the **escrow** (`installation/sealing.escrow`: the Chest key under
    AES-256-GCM, its key HKDF-SHA256 of the code). Written code, escrow,
    then key: a node stopped between them unlocks itself from the code at
    its next start. Each tool's key (`apps/<tool>/sealed-values.key`: 32
    random bytes under AES-256-GCM of the Chest key, its additional data the
    tool's name) is made at the tool's first seal and goes with its
    Compartment; one the Chest key does not open is never replaced
    (`ErrLost`, `sealed_lost`). A value: XChaCha20-Poly1305
    (`golang.org/x/crypto`, a random 24-byte nonce) under the tool's key,
    written `chest:sealed:1:<roles>:<base64url(nonce‖box)>`, its additional
    data the format, the tool, the roles and the tool's context. The node
    keeps the Chest key and each tool's in memory once read (`Keeper`,
    `Tool`: one per tool across its versions, forgotten with it).
  - **Tickets**: the team host gives each request of a member of a version
    that holds `sealed` a `Chest-Opener` header beside `Chest-Member`
    (`toolfront.Visit.Opener`, `portal.Binding.Seals`): `1.<member>.<expiry
    unix>.<HMAC-SHA256>`, 60 s, under a key of the `Tool` made at the
    node's start and never given to the tool — which holds the key of
    `Chest-Member` to verify it, so could forge it. A header of that name a
    browser sends is dropped with every `Chest-*` one.
  - **API** (`toolseal.Tool.API`, on `CHEST_API`, `/sealed/`): `POST
    /sealed/seal {"items": [{"value", "roles"?, "context"?}]}` → `{"sealed":
    […]}` — no member needed; roles among those the version declares
    (`invalid_role`) — and `POST /sealed/open {"items": [{"sealed",
    "context"?}]}` with `Chest-Opener` → `{"values": [{"value"} |
    {"refused": "role" | "invalid"}]}`: the ticket checked (401
    `member_required`), then the team read **now** (403 `access_removed` for
    a member who lost the tool), each value opened in its context and its
    roles checked against the member's role (set by the owner or an admin).
    A call is 4 MiB at most (a page of values, no count), a value 512 KiB,
    a context 256 bytes. 503 `sealed_locked` while the Chest key waits for
    the owner's code; 403 `capability_not_granted` for a version without
    `sealed`. ~1 µs to seal and open an IBAN (`go test -bench .
    ./chest/toolseal`).
  - **Journal of opens** (`installation/sealed-journal/<tool>.jsonl`,
    `chest/jsonjournal`, 8 MiB turned over, 90 days, archived): one line per
    call that opened or refused values — the time, the member, how many
    opened and refused, the roles of the restricted ones —, never a value
    nor a context; removed with the tool. `GET /api/tools/{app}/sealed`
    (the owner alone: `toolSealed`) gives the totals of the last 30 days
    per member, named, and the Data tab shows them under the grid.
  - **The owner's code** (`chest/portal/sealing.go`): `GET /api/sealing`
    (whoever runs the Chest) → `{"state": "none" | "pending" | "saved" |
    "locked"}`; for the owner alone, never an agent: `POST
    /api/sealing/reveal` → the code while pending, `/saved` (the code
    leaves the server), `/renew` (a new code and escrow, pending), `/unlock
    {"code"}` (a restored Chest, 5 tries a minute; 400 `wrong_code`); 409
    `not_now` for a step the state does not allow. Settings → General
    shows it.
  - **Versions**: a version that declares `sealed` is put in service by
    the owner or an admin alone, whoever wrote it (“Updating a tool”).
  - **Drafts** of Perseus Code seal under a key of their own
    (`toolseal.NewDraft`, `sealed-values.key` beside the project, in clear,
    never the Chest key), opened for their fake members
    (`draftfront.Running.Seals`); no journal.
- **Files** (`chest/toolfiles`, `cmd/chest/application_files.go`,
  manifest `capabilities: ["files"]`, “Files” at approval): a
  **broker**, never a mount — the container root stays read-only and its
  only mount is `/run/chest`.
  - **Tool access**: through carriers (`chest/carrier`), like the database.
    `CHEST_API=1`, the launcher listens on `/run/chest/api.sock` (0600) for the
    Chest and on `127.0.0.1:<ephemeral port>` for the tool, and gives it
    `CHEST_API=http://127.0.0.1:<port>` (covered by `NO_PROXY` when it also
    has network egress); the Chest serves an `http.Server` over the
    instance's carriers (two idle, sixteen at most; headers 10 s,
    request and response 5 min, 16 KiB of headers). **The instance is the
    identity**: this channel reaches only its own tool's files and members,
    no tool name is read from the request (`cmd/chest`, `serveAPI`: `/files`
    here, `/members` and `/groups` below, 404 `not_found` otherwise). A
    version with neither files nor members has neither `api.sock` nor
    `CHEST_API`; each route answers 403 `capability_not_granted` to a version
    that does not declare its capability. Routes: `PUT /files/{name}` (the body,
    its `Content-Type` — a media type and at most `charset`, otherwise 400
    `invalid_type`; `application/octet-stream` without one) → 201 the object;
    `GET /files/{name}` → the content, with its type; `DELETE /files/{name}` →
    204; `GET /files?prefix=&after=` → `{"files":[{name,type,size,updated}],
    "next"}`, 1000 per page in name order; `POST /files/url`
    `{"name"}` → `{"url","expires_in"}`. Errors `{"error": code}`:
    `invalid_name`, `invalid_type`, `incomplete_body` 400, `not_found` 404,
    `too_large` 413, `quota_exceeded` 429, `unavailable` 503 (the cause is
    never given).
  - **Names**: `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(/[A-Za-z0-9][A-Za-z0-9._-]{0,99}){0,7}$`
    — neither `.` nor `-` at the start of a segment, so neither `..` nor a hidden file.
  - **At rest**: `apps/<tool>/files/` (0700, made at the first upload),
    flat: for each object, its content `<key>.<rev>` and its record
    `<key>.json` (`name`, `type`, `size`, `rev`, `updated`, 0600), `key` =
    SHA-256 of the name — a name is never a path. An upload writes the
    content aside (`.put-<rev>`, synced), renames it, writes the record
    aside then renames it (the moment the upload is done), syncs the
    directory, then removes the replaced content; whatever an interruption
    leaves behind (aside files, content no record names or that is no longer
    its own) is removed at the next read; an unreadable record is not
    counted, its content stays. Nothing is followed through a link. One
    modification at a time per tool (lock), reads alongside;
    the object index and their total are read once, at the first
    request.
  - **More routes**: `GET /files/{name}?stat` → the object (with its
    `sha256`, the digest of its content computed as the put writes it —
    every object answered carries it; a record written before it existed
    gets it once, when the store is first read —, and `width`, `height`
    for a JPEG, PNG, GIF or WebP the Chest measured at the put); `POST /files/move` `{"from","to"}` → the object at its new
    name (the content hard-linked under the new name and recorded there
    before the old record goes: an interruption leaves it under both names,
    never none; an object already named `to` is replaced); `POST
    /files/url` takes `thumbnail` (256 or 1024, 400 `no_thumbnail` for
    anything else than an image the Chest reduces) and `download`;
    `POST /files/upload-url` (below). Errors add `type_mismatch` and
    `no_thumbnail` (400).
  - **Limits**: those the version asks (`files` key; `toolfiles.For`):
    by default 32 MiB per object and 1 GiB per tool; 10,000 objects,
    100,000 from a quota of 10 GiB. The owner or an admin may set the
    quota by hand (Storage view): `apps/<tool>/files-quota` (0600, beside
    the package, in the backups), one of 512 MiB, 1, 2, 5, 10 GiB (the most
    the nightly archive is measured for) offered when no larger than the
    quota in force or when the server's free disk holds it beside what
    the tool keeps; it wins over what any version asks until removed. A new
    version brings its bounds at its switch (`serverApplication.Replace`),
    the quota set still winning. A declared size beyond them is refused
    before anything is read (413, or 429 if it is the tool's remaining space that
    falls short); otherwise the body is read aside and abandoned at the first
    byte too many: 413 `too_large` beyond an object, 429 `quota_exceeded` beyond
    the tool's remaining space (the replaced object counted as free) or for a new name
    beyond the count. Nothing of a refused upload remains. **Lab
    only**: `node.json` (`portal.tool_files_lab`, `{link_seconds,
    quota_bytes}`) lowers a link's lifetime and caps the quota, whatever
    a tool asks or its owner sets — never raises them, and refused (the
    node does not start) by a server that has a dependency binding
    (`dependencies.json`), that is, every real server.
  - **Uploads from the browser**: never through the tool's container.
    `POST /files/upload-url` `{"name", "max_size"?, "types"?,
    "expires_in"?}` → `{"url","method":"PUT","expires_in"}`: `name` an
    object's, or a folder (`photos/`, seven segments at most) where the
    Chest names the object (20 random hex characters and the ending of its
    type: `.jpg`, `.png`, `.pdf`…); `max_size` the tool's largest object
    by default and never beyond (413); `types` up to eight media types
    without parameters, exact or `family/*`, any when none (400
    `invalid_type`); `expires_in` 1–900 s, 900 by default (400
    `invalid_body` beyond); `public` for a visitor of the public part
    (below). The token, base64url(JSON `{tool, name, max,
    types, exp, id, boot, public?}`) `.` HMAC-SHA256 under the node key with its
    own label, 2048 characters at most, names the run of the node that
    signed it (`boot`, random at each start: a restart ends every token)
    and is **taken once** (its `id` remembered until it expires, 100,000
    at most). The browser sends the file as it is, `PUT
    https://<tool>-chest.<domain>/_chest/files/upload/<token>`: the
    member's session of the team host is required (401 without), must
    still be a member with the tool (403 `access_removed`), the guards
    require the host's `Origin` and the handler `Sec-Fetch-Site:
    same-origin` (403 `cross_origin`); the token is taken before
    anything is read (403 `invalid_token`: forged, expired, used, of
    another tool or run, or a visitor's); the type must be one it accepts
    (415 `type_refused`); then the bounds of a put (413, 429, 507), and
    the content, once written aside, must hold the type said when the
    Chest recognises it (400 `type_mismatch`, `toolfiles/sniff.go`): by
    its first 512 bytes for a JPEG, PNG, GIF, WebP, AVIF and HEIC (by the
    brands of their `ftyp` box), BMP, TIFF, PDF, ZIP, gzip, 7z, RAR, tar,
    bzip2, xz or CAB; by its parts for an Office Open XML document
    (`[Content_Types].xml` and `word/document.xml`, `xl/workbook.xml` or
    `ppt/presentation.xml`, its directory read only once its end says
    16,384 entries at most, never Zip64) or an OpenDocument one (its
    first entry `mimetype`, stored, says the type). The read deadline of
    the request is 30 minutes. 201 `{name, type, size}`. SVG, HTML and
    scripts are served as downloads, never inline (`shown`). No antivirus
    scan.
  - **Uploads from a visitor of the public part** — the same mechanism,
    for an anonymous sender. `POST /files/upload-url` with `"public":
    true` (409 `no_public_part` for a version without one; drafts take it
    from their declaration): `name` must be a folder — the Chest names
    the file, a visitor never replaces one — and `types` must be given,
    each recognised by content (`toolfiles.Recognised`: an exact type
    above, or a family of which one is; 400 `invalid_type` otherwise —
    plain text, CSV). The answer's `url` is a path, `/_chest/files/upload/
    <token>`, sent by the visitor's page to its own address: the public
    host, the custom domain, or the page framed by a company's site. The
    public part takes it (`Portal.publicChest`, only while it is open: 404
    otherwise) and only a visitor's token, the team host only a member's
    (403 `invalid_token`), a draft's host both (its preview is both
    parts). Without session and without `Origin` check (the token is the
    authority). The type said is ignored: the file is of the type its
    content is among those granted (`recognise`: an office document
    before the archive it also is), 415 `type_refused` for none. **Pace
    per visitor** (`toolfiles.ReceiveVisitor`, per client address —
    `ratelimit.Client`, the address the front's PROXY header gives —, per
    tool, in memory): its length said first (411 `length_required`), 2
    uploads at once, 10 a minute, and in an hour 1/20 of the tool's quota,
    never less than its largest object (`ratelimit.Windows.Spend`); beyond,
    429 `slow_down` with `Retry-After`. Nothing caps all visitors
    together but the tool's quota and the server's disk. The file joins
    the tool's private files: only its members see it, through the tool
    (links on the team host); the Chest never serves a file on the public
    part (public files of the spec are not built).
  - **Server's disk**: every write (`put`, an upload) needs room on the
    disk — the size said, or the most the object may be —, within
    `serverroom.DiskShare` of the disk (`serverroom.DiskFits`, the rule a
    new tool is weighed by); otherwise 507 `storage_full`, nothing kept,
    whatever the tool's quota (`StorageFull` in the SDK).
  - **Thumbnails** (`toolfiles/image.go`): for a JPEG, PNG, GIF (first
    frame) or WebP (`golang.org/x/image/webp`, the Go project's own
    decoder; its `draw` package scales with Catmull-Rom) measured within
    40 megapixels, 256 or 1,024 px on the longest side, never enlarged,
    JPEG — PNG when the image has transparency —, made on demand by one
    worker of the node at a time (the request waits 20 s at most for it),
    kept beside the content (`<key>.<rev>.<size>.<jpg|png>`), not counted
    in the quota, gone with the content they were made of (replaced,
    moved, deleted, or left by an interruption: removed at the next
    reading). The image is measured again from its bytes before it is
    decoded.
  - **Lifecycle**: files follow the Compartment — kept when
    one version replaces another (update, rollback, source replaced),
    removed with the tool (`apps/<tool>/` in its entirety; its links die
    with its host), in the nightly archive with the Compartments and the
    link key (`deploy/backup.md`).
- **Members** (`chest/toolmembers`, `cmd/chest/application_members.go`,
  manifest `capabilities: ["members"]`, `"members.email"` for the
  addresses and `"members.groups"` for every group of the Chest — both
  require `members` —; each its own sentence at approval):
  who has the tool, read from the policy at every call (`Team.Directory`,
  once the node's portal holds the team — until then, and whenever the policy
  cannot be read, 503 `unavailable`, never an older answer), on the same
  carriers as the files. **Who**: exactly the members who have the tool at
  that moment — a grant, a group, open to all, or running the Chest
  (owner, admins: `Team.Access`); a member without access answers as an
  identifier that does not exist. A member is `{id, first_name, last_name,
  name, photo, role, admin, builder, groups, language, time_zone, email?}`: `photo` the path of
  their picture on the team host (`/_chest/members/{id}/photo?v=<rev>`),
  `role` the one the tool declares (`access.ToolRole`) — both `null` for none
  —, `groups` those of theirs the tool sees, `language` the one the Chest
  speaks to them (`Policy.LanguageOf`: a notification to them is written
  in it) and `time_zone` the zone they work in (`Policy.ZoneOf`), `email`
  only with `members.email`;
  never the provider, the account, an invitation or anything of sign-in.
  Routes: `GET /members?after=&limit=&q=&role=&group=` → `{"members": […],
  "next"}`, ordered by name (lowercase, accents removed) then identifier,
  `limit` 100 by default and 500 at most, `next` an opaque cursor (the
  base64url of the last key and identifier), `q` (64 characters at most) the
  start of a first name, a last name or a name — or an address with
  `members.email` —, case and accents aside; `GET /members/{id}` → the member,
  404 `member_not_found`; `POST /members/lookup {"ids"}` (200 at most, each
  once) → `{"members", "former": [{id, name?, status}], "unknown"}` — a
  former member is one who left after having the tool (`Policy.Former`,
  `"former"`), `{id, status: "erased"}` once their data was erased, and a
  member of the Chest the tool had who lost access to it is `{id, name,
  status: "no_access"}`: “had” is what the events engine remembers of each
  tool (`toolevents.Engine.Had`, every member it had, erased ones
  forgotten), the name read from the policy (`Team.Named`); anyone else —
  a member the tool never had — stays `unknown`; `GET
  /groups?after=&limit=` → `{"groups": [{id, name, size}], "next"}`, the
  groups the tool sees, paged like the members (by name then identifier,
  100 by default, 500 at most), `size` how many of their members have the
  tool, whom `GET /members?group=` pages. A page of either list stops at
  1 MiB of entries too (`pageBytes`, one entry at least): members in many
  groups come over more pages. No count bounds the team the tool reads.
  **The groups a tool sees** (`access.TeamApp.Groups`, from
  `Binding.MemberGroups`, set at every registration and update of the
  version in service): those that grant it — or, with `members.groups`,
  every group of the Chest, so that a tool open to everyone offers “the
  Sales team”; the same rule makes a member's `groups` (here, in the
  assertion and in `member.updated`). The assertion carries them while it
  keeps within 8 KiB (`toolfront` `assertionBytes`: half of the 16 KiB of
  headers a Node server reads — about 150 groups); beyond, it carries
  `groups_overage: true` and no `groups`, and the SDK's `member.groups` is
  `null`: the tool reads them from `GET /members/{id}` — Microsoft's
  “groups overage”. No group
  event: joining or leaving a group the tool sees, a group deleted
  included, is `member.updated` naming `groups`; names are read at render.
  Errors `{"error": code}`: `invalid_query`,
  `invalid_id`, `invalid_body` 400, `capability_not_granted` 403,
  `member_not_found`, `not_found` 404, `rate_limited` 429 (600 calls a
  minute per instance, `Retry-After`), `unavailable` 503. The addresses in
  the `Chest-Member` assertion follow the same permission
  (`Binding.MemberEmail`).
- **Notifications** (`chest/toolnotify`, `chest/inbox`,
  `cmd/chest/application_members.go`, manifest `capabilities:
  ["notifications"]`, its own sentence at approval): the counter a tool shows
  one member on its tile (a badge) and the items it puts in their inbox,
  inside the Chest only — the Chest then mails and pushes them as each
  member chooses (below). Only the members who have the
  tool at the time of the call (`Team.Directory`, as for the members; 503
  `unavailable` while it cannot be read) receive anything; the others, and
  unknown identifiers, are `skipped`. Routes: `PUT /badges/{id} {"count"}`
  and `PUT /badges {"badges": [{member, count}]}` (each member once) →
  `{"set", "skipped"}`, a count 0 to 9,999, 0 clearing it, idempotent;
  `POST /notifications {"members", "title", "body"?, "path"?, "key"?,
  "translations"?}` → `{"delivered", "skipped"}` (one identifier at least,
  each once, in the order given). No count bounds what a call names: its
  body takes 64 KiB of texts and 64 bytes for each member who has the tool
  (`toolnotify` `textBytes`, `memberBytes`), so a call may name the whole
  team and no more (400 `invalid_body` beyond): `title` 1 to 80 characters, `body` 280 at most, both
  plain text — tabs and line breaks of the title become spaces, the body
  keeps its line breaks, every other control or direction character goes
  (`toolnotify.Title`, `Body`) —; `path` the tool's members' part, `/chest`
  alone or followed by `/`, `?` or `#`, 512 bytes of printable ASCII, no
  `\`, no `//`, no `.` or `..` segment however written (`ValidPath`),
  `/chest` when absent — the portal makes the link on the tool's team host
  —; `key` (`pattern.NotificationKey`) replaces the item of the same tool
  and member (new text, at the top, unread again); `POST
  /notifications/withdraw {"key", "members"?}` → 204, removing the items of
  that key from everyone or from those named, never saying what existed.
  `translations` (`{"<language>": {"title", "body"?}}`, `pattern.Language`,
  each bounded and cleaned as the original) gives the same item in other
  languages: each member gets the one of their language (`Seen.Language`),
  the base text otherwise — one `inbox.Store.Deliver` per language. `POST
  /notifications/broadcast {"to"?: {"groups"?, "roles"?}, "except"?, the
  notice}` → 204: the same item for every member who has the tool now, or
  with `to` those in any of its groups (as the tool sees them: one it does
  not see matches nobody) or holding any of its roles (`packagefile.MaxRoles`
  at most, those it declares; `to` naming neither is refused), but those of
  `except`; it answers no count — a tool
  without `members` learns nothing of the team's size. Its recipients count
  at the same pace as a notification's.
  A member who muted the tool counts as delivered, nothing kept: the tool
  never learns who muted it. **Nothing is refused for its pace** (Paul, 6
  October 2026): a tool's notices to a member go at a normal pace, a token
  bucket per tool and member (`toolnotify.Pace`, one per node, in memory —
  a restart fills them —: ten at once, one more every six minutes);
  beyond, each is folded into the tool's one grouped item in that
  member's inbox (`inbox.Item.Grouped`: how many, the latest's title, body
  and path, unread and unmailed again, its identifier kept; once read, the
  next burst starts another), never refused nor lost, constant space per
  tool and member however fast a tool goes. A notice whose key names an
  item replaces it, never folded; a folded one keeps no key. The bell
  shows “37 new notifications” above the latest's title, the mails
  “New notifications: 37” and the latest (`chest/portal/mail.go`), so a
  folded burst is one line of the next mail. Badges are a state: the last
  write wins, one that changes nothing writes nothing, none is refused.
  Only a malformed or oversized call is. The inbox is changed one
  member at a time (`inbox.Store.changeEach`): a call that reaches the
  whole team never holds the others' bells. Errors `invalid_body`, `invalid_id`, `invalid_role`,
  `invalid_count`, `invalid_title`, `invalid_text`, `invalid_path`,
  `invalid_key`, `invalid_language` 400,
  `capability_not_granted` 403, `not_found` 404.
  - **The inbox** (`chest/inbox`): one private file per member,
    `installation/inbox/<member id>.json` (0600, directory 0700, in the
    nightly archive), read and replaced whole at each change: the items,
    newest first (`ntf_` and 26 base32 characters), 500 at most — the
    oldest read ones go first — and nothing older than 90 days; the badge
    of each tool; the tools that have sent something (its senders) and
    those the member muted. Only the tools the member has now are ever
    shown: a read keeps nothing else, and the portal sweeps every inbox
    (`Portal.sweepInbox`) when it starts, after each change of the team
    and after an uninstallation — an access revoked takes that member's
    items and badge of the tool, a member removed their inbox, a tool
    removed its items and badges. **The Chest's own items** carry a kind
    and the member they are about instead of a tool (`Store.Tell`):
    `builder_request`, a member asking to become a builder, delivered to the
    owner and the admins (`POST /api/team/builder-request`, no body; 409
    `already` for a builder, an admin, the owner), the same request again
    replacing it; and `version_approval`, which also names a tool: a
    version of it whose code is that member's waits for the owner or an
    admin (`askApproval`, never told to its author), the same tool and author again replacing it. They
    stay whatever tools the reader has — a version to approve goes with its
    tool —, are marked as any item, go when the member they are about
    leaves, and are shown to sessions only — never through a token. In the
    pages the item says “Hugo Petit asks to become a builder” with **Make
    builder** for the owner and the admins (the team's `status` operation,
    then the item marked read), or “Léo Martin has a version of CRM to
    approve” with **Review**, the tool's Deployments.
  - **In the pages** (`chest/portal/inbox.go`,
    `chest/web/portal/src/components/Inbox.tsx`): `GET /api/inbox` →
    `{items (the newest 100: id, tool, title, body?, url, created, read;
    or the Chest's: id, kind, member, tool (a version to approve), name, created, read),
    unread, badges: [{tool, count}], senders: [{tool, muted}], rhythm}`;
    `POST /api/inbox/read {ids | all}`, `/api/inbox/unread {ids}`,
    `/api/inbox/mute {tool, muted}`, `/api/inbox/rhythm {rhythm}` answer the
    same. The bell of the header
    carries the unread count (a black pill, 99+), read with each page and
    every 30 s while the page is seen, and when it is seen again; its panel
    (400 px, full screen on a phone) lists the items beside the icon and the
    name of their tool, a black dot while unread, the body on two lines;
    an item opens its link in a new tab and is marked read; its menu marks
    it unread (or read) and mutes its tool; “Mark all as read”. The badge
    is a pill on the tile of the home only (the tools list manages tools);
    Profile → Notifications has the rhythm of the mails (below) and lists
    the senders, “Notify me” each.
  - **The mails of notifications** (`chest/portal/mail.go`,
    [spec](../../../01_produit/02_specs/mail.md)): part of the Chest's
    service — a tool notifies, the Chest decides the mail; no SDK call.
    Each member chooses in Profile → Notifications (`Box.Rhythm`): every
    notification as it comes (the default), once a day (8:00), twice a day
    (8:00 and 16:00, in their zone, `Policy.ZoneOf`), or off; muting a tool
    keeps its items out of the inbox, so out of the mails. `Portal.RunMail`
    (started with the portal, stopped with it: `nodePortal.stopMail`) runs
    a round every 20 s on the members whose mail may be due — those who
    received an item since (`inbox.Store.Fresh`, set by `Deliver` and
    `Tell`), those whose mail waits, everyone at the first round — and on
    each only once its next time came (`mailState.next`: the burst over,
    the next slot, a retry). A mail shows the items unread, not mailed
    (`Item.Mailed`), younger than 24 hours, from a tool the member has —
    and the Chest's own requests the bell shows, titled in the member's
    language — newest first, 10 at most and how many more. As they come: a
    burst is gathered until no item came for a minute
    (`mailrelay.NotificationGap`), or five minutes after its first. A
    summary leaves in its slot, within four hours of it (`mailSlot`;
    `Box.Slot` records the last). A new rhythm marks what waited mailed:
    it never mails the backlog. The central writes the mail (template
    `notifications`): one notification is its title and text, a button to
    it on its tool's team host; several, a list each leading to itself and
    a button to the Chest; every mail says why it came and links to the
    member's choices, `<portal>/mail/notifications?member=<id>&token=<HMAC>`
    — HMAC-SHA-256 of the member under `installation/inbox/mail.key` (32
    random bytes, 0600, in the nightly archive; `inbox.Store.Token`,
    `Proves`). Sent: its items are marked mailed; refused for a quota
    (429, `mailrelay.ErrQuota`): tried again after the gap; unreachable:
    five minutes later — what it would have shown kept. The link
    is the one route of the portal that reads no session and takes a post
    from any origin (`core.Allowance{Anonymous, AnyOrigin}`: a mail
    application's one-click unsubscribe, RFC 8058, sends none): a GET shows
    the four choices on the status page (a link scanner changes nothing), a
    POST of one keeps it, a POST without one — `List-Unsubscribe-Post` —
    turns the mails off; a link of another member, altered or with any
    other query is 404 “Link not valid”. The page speaks the member's
    language. Agents and tools never see or change the rhythm. The clock
    is the portal's (`Portal.now`), a test's own.
  - **The pushes of notifications** (`chest/portal/push.go`,
    `chest/webpush`, `cmd/chest/application_push.go`;
    [spec](../../../01_produit/02_specs/members-and-notifications.md#9-on-the-phone-the-chest-installed-and-push)):
    the other way the Chest brings a member what reaches their inbox,
    beside the mails and independent of their rhythm. **Devices**: Profile
    → Notifications → “Push on this device” subscribes the browser
    (`PushManager`, `userVisibleOnly`) under the Chest's VAPID key, which
    `GET /api/inbox` tells a session (`push`, the uncompressed P-256 point
    in base64url; never an agent), then `POST /api/push/devices {endpoint,
    p256dh, auth}` → 204: a subscription of a known push service only
    (`webpush.Services`: HTTPS on 443, no user nor fragment, a path, under
    `fcm.googleapis.com`, `push.apple.com`, `push.services.mozilla.com` or
    `notify.windows.com`), a valid P-256 point and a 16-byte secret, else
    400 `invalid_subscription`; kept with the member's inbox
    (`inbox.Store.AddDevice`: `Box.Devices`, its `Since`, the same endpoint
    replaced; the devices take 64 KiB of the file at most, the oldest go
    first); `POST /api/push/devices/remove {endpoint}` → 204 forgets it — the
    switch turned off, or the page signing out (`push.ts`, `pushOff`, before
    `/logout`). Turned on while the mails are “every notification”, the
    profile offers, under the switch, the daily summary instead (**Daily
    summary** posts the rhythm `daily`, **Keep every email** changes
    nothing): the rhythm is never changed silently. A session's only, JSON, the portal's Origin; 404 on a
    Chest without push. **Sending** (`Portal.RunPush`, started and stopped
    with the mails): a round every 5 s on the members whose push may be due
    (`inbox.Store.Fresh(inbox.Push)`: each channel is told on its own), the
    items a mail would show (`Portal.waiting`, shared with the mails) but
    not yet pushed (`Item.Pushed`) and less than an hour old, to each device
    what came since its `Since`. The first item of a burst goes at once;
    within `mailrelay.NotificationGap` of a push delivered, the next waits
    for the gap and gathers what came. One item says its tool's title and
    its own title — never its body — and leads to it on the team host (the
    Chest's own requests: the organization and their title, to the Chest);
    several say “n new notifications” (`i18n.Push.Many`) under the
    organization, to the Chest. **The message** (`webpush.Sender.Send`):
    `{title, body, url}` encrypted for that browser alone (RFC 8291,
    aes128gcm of RFC 8188, a fresh key pair and salt each time, one record
    of 4,096 bytes at most), `Authorization: vapid t=<JWT ES256 {aud: the
    push service's origin, exp: 12 h, sub: the portal's origin}>,
    k=<key>` (RFC 8292), `TTL` 12 h, `Urgency: normal`, `Topic: chest` (the
    push service keeps the newest only); posted from the node straight to
    the push service through `egress.Client` (the node's guard: never an
    address of the server, of a private network nor a name of the Chest;
    no proxy, no redirect; 30 s for the answer). 2xx: its items marked
    pushed; 404 or 410: the device forgotten; 429, 5xx or no answer: tried
    again after a minute, unless another device took it; any other refusal
    is logged and the push dropped. **The key**: `installation/inbox/push.key`
    (the P-256 scalar, 32 bytes, 0600, made at the first start by
    `webpush.LoadKey`), in the nightly archive with the inboxes — a restored
    Chest's subscriptions keep working. A laboratory's push service stands
    for the browsers' (`node.json`, `portal.push_lab {services}`), refused by
    a server with a dependency binding. The service worker
    (`chest/web/portal/worker/sw.ts`, served as `/sw.js`) shows a push —
    one notification of the Chest at a time (`tag`), the app's icon — and
    opens its link: the Chest's own window when one is open, the tool's
    page beside it; it caches nothing and handles no request.
  - **For agents**: `GET /api/v1/inbox` (the same, without the senders,
    the rhythm and the key)
    and `POST /api/v1/inbox/read {ids | all}` (a write), with a member's
    token — narrowed to tools, only theirs —; the MCP server's `inbox`
    tool reads it, fenced as untrusted data. An agent never sends a
    notification: tools do.
- **Member lifecycle events** (`chest/toolevents`,
  `cmd/chest/application_events.go`, manifest `"receives": ["member.*"]` —
  only that value, only with `members`; the permission
  `receives:member.*`, its own sentence at approval, “Is told when the
  members who have access to it change or leave”): `member.updated {id,
  changed: ["name" | "photo" | "role" | "groups" | "email" | "language" |
  "timeZone"]}` (`email` only with `members.email`; a version that gains or
  loses it is no address change; `language` and `timeZone`: the ones the
  Chest speaks to them and they work in), `access.revoked {id}` (the member stays in the Chest),
  `member.removed {id}` (the member left: the tool reads them former),
  `member.erased {id, erasure, deadline}`. A member given the tool is no
  event. **Where they come from**: the engine of the node
  (`toolevents.Engine`, one per node, run with the tools) compares what each
  installed tool sees of the team (`Team.Directory`: its members, their
  names, picture revision, role, groups, address under `members.email`)
  with what it saw, at each `Team.Changed` and at each start; the first
  sight of a tool is where its events start. It keeps, per tool, a private
  file `installation/events/tools/<tool>.json` (0600, directory 0700,
  replaced atomically, in the nightly archive): that sight, the members it
  ever saw (erased ones forgotten) and its **outbox** — the events not yet
  accepted, as many members' events as fill a full team's policy
  (`maxOutbox`: `access.MaxBytes` of events of 320 bytes; beyond, the oldest
  go and the tool is out of sync); the file is bounded by the team's
  capacity too (three times the policy's), the events between tools
  sharing it (“Events between tools”). A tool that does not receive events is observed all the same (who
  had it counts for an erasure) and keeps no outbox. **Delivery**: `POST
  /chest-events` on the instance in service, through its launcher's socket
  (`toolfront.Target.Deliver`) — never from a browser: the front answers
  404 to that route on either host, however spelled, and strips any
  `Chest-*` header of a request anyway —, envelope `{"id": "evt_…",
  "type", "occurredAt", "data"}` (`pattern.EventID`) and `Chest-Event`: a
  compact JWS HS256, typ JWT, under HMAC-SHA256 of “Chest-Event v1” keyed by
  the instance's `CHEST_TOKEN` (neither the token nor the assertion's key),
  claims `aud` (the tool), `iat`, `exp` (60 s), `jti` (the event's id) and
  `digest` (base64url SHA-256 of the body) — read by the SDK's
  `events.verify` / `events.handle`, which deduplicate by id. One delivery
  at a time per tool, the oldest due first, 30 s each; a 2xx accepts it,
  anything else is tried again after 5 s, 15 s, 30 s, 1 min, 2 min, 5 min,
  10 min, 30 min, then every hour (a tool asleep is woken first, the
  delivery taking a place of the team host; no instance in service after
  60 s: again in 5 s, not counted; a wake refused for memory: counted),
  for 72 hours; then the event goes and the tool is **out of
  sync** — `out_of_sync` in `GET /api/tools` (and `/api/v1/tools`) for
  whoever runs it, “Out of sync” on its tile and its row, “Out of sync
  since …” on its overview — until an
  instance of it starts again: it reconciles by listing its members at its
  start. **At least once, same id**: an event leaves the outbox only once
  accepted, the file written before the next; a node that stops keeps it,
  and its next run delivers what waits at once, with the id it had. No
  order is guaranteed. A tool removed takes its file with it. Every
  delivery is said in the tool's log, never its data: “Event member.updated
  (evt_…) delivered in 12 ms”, “… not delivered: the tool answered 500;
  trying again in 15s (attempt 3)”, “… given up after 40 attempts: …”.
  - **Erasure of a former member** (`chest/portal/erasures.go`,
    `toolevents.Erase`): the owner asks it on the team page — Former
    members, the member's sheet, “Erase data”, the name typed first —:
    `POST /api/team {operation: "erase", member}` has the policy forget
    the name (owner only, admins refused), then the engine records the
    erasure (`installation/events/erasures.json`, `era_` and 26 base32
    characters, 256 kept, the oldest completed forgotten first; asked
    again, the same one, nothing sent again) with its deadline (30 days)
    and each part: every installed tool the member had when they left
    (`Former.Tools`) or that the engine ever saw them in — the tools that
    receive events are told `member.erased` and forget them; the others
    are confirmed by hand. A tool acknowledges on its API, `POST
    /erasures/{erasure}/done` → 204 (`erasure_not_found` 404 for one it
    was not told of, `invalid_id` 400, `capability_not_granted` 403 without
    `receives`); whoever runs the Chest confirms by hand the part of a
    tool without events, `POST /api/team/erasures/confirm {erasure,
    tool}` → 204 (404 `erasure_not_found` for any other part); `GET
    /api/team/erasures` lists them, the most recent first, each part
    `erased` (with `done`), `pending`, `overdue` (past the deadline) or
    `manual`. A tool removed meanwhile took its data: its part is done.
    The sheet shows each tool: “Erased on …”, “Pending — due …”,
    “Overdue — was due …”, “Confirm by hand” with “Confirm”.
- **Events between tools** (`chest/toolevents` `between.go`, `data.go`;
  `common/packagefile/events.go`; `chest/portal/tool_events.go`; product:
  `01_produit/02_specs/tool-events.md`): one tool reacts to what happens in
  another. **Manifest** (the single validator, `packagefile`): `"emits":
  {<type>: {"description", "data": {<field>: <kind>[?]}}}` — a type of two
  to four dotted segments (`EventTypePattern`, 64 characters, never
  `member.*` nor `access.*`), its sentence (1–80 printable characters), its
  fields (camelCase, kinds `id`, `text`, `number`, `boolean`, `time`,
  `date`, `member`, `members`, `?` for optional; their number bounded by the
  manifest's 16 KiB) — and `"receives"`: `member.*` and types, **never
  tools**: whichever installed tool emits a type tells it (the Chest stamps
  `source`). Each type is a permission, `emits:<type>:<field>=<kind>[?],…:<description>`
  (canonical: types and fields sorted) and `receives:<type>`: what crosses
  is approved, a field added asks again; the permissions carry the
  declarations back to a build's status and the catalogue
  (`EventsDocument`). **A type's data only grows**: a version whose types
  remove a field, change its kind or make it optional is refused before it
  takes the traffic (`EventsBreak`, `nodeApplications.Update`:
  `RefusedVersion`, the reason in words); a new shape is a new type. **A
  link** is a type the version in service of one tool emits and another's
  receives — never the tool itself —, on unless an admin switched it off
  (`installation/events/links.json`); the owner approves it with the second
  of the two installations, the offer showing it (`GET /api/events`, the
  portal's words: “Received by …”, “Told by …”). **Emitting**: `POST
  /events` on the tool's API (`EmitAPI`; the instance is the identity; 403
  `capability_not_granted` for a version that emits nothing) `{type, data,
  subject?, key?, occurredAt?, audience?, cause?}` (the body bounded by
  `MaxData` + a full team's policy) → 202 `{id, receivers}`. Checked
  (`Check`, shared with drafts): data the type declares only, each field of
  its kind, required ones present (`null` is absent), a `member` one the
  tool has or had, 16 KiB at most (`invalid_data`); `subject` and `key` of
  `IDPattern`, `occurredAt` within the last 72 hours and not ahead (5 s),
  `cause` an event id (`invalid_event`); `audience` `{members, groups,
  roles}` naming someone, members the tool has or had (`invalid_audience`);
  a type not declared `invalid_type`. **Idempotency**: a `key` used again
  within 72 hours answers 200 with the same event when the content
  (canonical JSON) is the same, 409 `key_reused` otherwise. **The chain**:
  an event's `tool/type` hops (`between.Chain`); with a `cause` the tool
  was delivered (kept 72 hours in its file, `Received`) or is being
  delivered, the chain continues it; one whose own hop is already in it is
  accepted and told to no tool, the publisher's log saying “it would loop
  (a/x → b/y → a/x)” — bounded by the distinct tools and types, never by a
  depth. **Fan-out**: the event is written to the outbox of every linked
  receiver before the answer, each delivered, retried and failed on its
  own, as the members' events (one at a time per tool, the tool woken
  first, the same backoff), retries counted from the emit. **Order per
  subject**: an event waits while an earlier one of the same source and
  subject waits in that outbox (`inTurn`; without a subject, none).
  **Audience at delivery**: who may see it in the source now (the audience,
  everyone who has it without one), intersected with who has the receiver:
  nobody — dropped, the source's log says “not told to …: no one there may
  see it” —, everyone — `"all"` —, otherwise the list of the receiver's
  member ids. **Envelope**: `{id, type, source, occurredAt, subject?,
  audience, data}` on `/chest-events`, signed `Chest-Event v1` as the
  members' events. **Given up** after 72 hours: kept 30 days with its data
  in the receiver's file (`Failed`, `FailedKept`), never making the tool
  out of sync; **Send again** (`Retry`, one or all) puts it back with the
  same id and 72 hours from then. **Told** once the engine's lock is
  released (`Engine.GaveUp`, `cmd/chest` `membersNode.deliveryFailed`): to
  the builders of the receiver and of the source — the owner and the
  admins when neither has one (`access.Team.Stewards`) —, in their inbox,
  one item per link (`inbox.TellFailed`, kind `delivery_failed`, `from`,
  `to`, `event`, `grouped` counting the failures while it is unread; read,
  the next starts a new one), mailed and pushed as each chose — once per
  link while unread — (the Chest's own words,
  `NotificationMail.DeliveryFailed`); the bell shows it while both tools are
  installed, opening the receiver's Events with **Send again** for whoever
  runs it, the source's otherwise. A laboratory gives up sooner
  (`node.json` `portal.events_lab {give_up_seconds}`, 30 s to 72 h, refused
  by a server with a dependency binding). **Capacity**: the receiver's file bounds
  what waits — beyond, the oldest delivered records go, then the oldest
  failed ones, then the oldest events between tools waiting, each said in
  its log (`fit`); a publisher is never refused for a slow receiver.
  **Removals**: a receiver removed takes its file; a publisher removed
  takes the events of it still waiting or failed elsewhere and the links
  naming it; a version that no longer receives a type drops those waiting.
  **Logs**: the publisher's “Event note.added (evt_…) emitted to listener”,
  the receiver's deliveries — never the data. **Pages and API**: `GET
  /api/tools/{app}/events` (whoever runs the tool; `/api/v1` too) — each
  type emitted with its receivers, each received with its sources, each
  link on or off, how many wait, the failed deliveries of the last 30 days
  (when, type, source, attempts, why: `status:<code>`, `timeout`,
  `no_room`, `unreachable`) —; `POST …/events/retry {id?}` (whoever runs
  it; a write for agents); `POST …/events/link {source, type, receiver,
  on}` (the owner and the admins: a link joins two tools); `GET
  /api/events` (the owner and the admins; `/api/v1/events`, chest-wide):
  every installed tool's emitted and received types and the links off.
  The tool's Overview shows them (Events). **Drafts and Perseus**: a
  draft's `POST /events` is checked against its `chest.json` and told to no
  tool, the preview's log saying which installed tools would receive it;
  Perseus reads the map and posts the preview a sample of a type an
  installed tool emits (“Perseus Code”, `chest_events`).
- **Scheduled tasks** (`chest/toolschedules`, `cmd/chest/application_schedules.go`,
  `chest/portal/tool_schedules.go`; manifest `"schedules": [{"name",
  "cron"}]`; product: `01_produit/02_specs/scheduled-tasks.md`): work a
  tool does by itself at set times, with nothing running in its container
  between requests — the Chest calls it. **Manifest** (`common/packagefile`,
  `schedules.go`, the single validator; `common/cron`): 1 to 8 schedules,
  each a name (`^[a-z][a-z0-9-]{0,31}$`, once) and a cron line — five fields
  of numbers, `*`, ranges, lists and steps, one space apart, Sunday 0 or 7,
  no names nor macros, a line some date matches — whose runs are 15 minutes
  apart at least on the wall clock (`Line.Gap`: the times of a day and the
  wrap to the next). Each schedule is the permission
  `schedule:<name>:<cron>`, shown in words at approval (“Runs by itself:
  morning, weekdays at 7:30 AM”, `chest/web/portal/src/schedules.ts`, the
  group Schedule); running by itself is what is approved — a version that
  changes, adds or removes schedules of a tool that had one asks nothing
  more (`schedulesBeyond`, as AI). The permissions carry the lines: a build's
  status and the catalogue render the manifest back from them
  (`SchedulesOf`, `SchedulesDocument`). The lines are read in the **Chest's
  time zone** (`Engine.Zone`, set at the node's start and at each change of
  the Chest), never a member's: a schedule is the company's clock; per-member
  hours are the tool's own (run hourly, pick the members whose hour it is).
  A time the clock skips runs once, shifted; a repeated one once
  (`Line.Next`, on the zone's calendar). **The engine** (one per node, run
  with the tools, once they can wake): one goroutine and one timer, set to the next time any
  schedule or waiting run is due (an hour at most, for a change of zone);
  a schedule's next time is computed from the last it handled, kept in the
  tool's file. When it comes, the latest time not after now is handled once
  — a node that was stopped runs a missed time once, `missed` when more than
  2 minutes late, never a backlog; a new schedule, or one whose line
  changed, starts from now. The run (`run_` and 26 base32 characters,
  `pattern.RunID`) is journaled `waiting`, then `running` — the file written
  before the post —, then `ok`, `failed` or `waiting` again. **Delivery**:
  `POST /chest-schedules` on the instance in service through its launcher's
  socket (`toolfront.Target.RunSchedule`), the tool **woken first** like a
  request (`Target.Wake`, 60 s at most), a place of the team host taken,
  counted as a use of the tool; body `{"id", "name", "scheduledAt" (UTC),
  "attempt"}` and `Chest-Schedule`, signed exactly as `Chest-Event` is (one
  mechanism, `toolfront/deliver.go`: HS256, typ JWT, `aud`, `iat`, `exp` 60 s,
  `jti` the run, `digest` of the body) under the key of the label
  “Chest-Schedule v1”: a run is never read as an event nor the reverse; the
  front answers 404 to `/chest-schedules` from any browser, however spelled
  (`chestRoute`), and a static prefix may not take it. The tool answers once
  its work is done, within **5 minutes** (`toolfront.RunTime`, its own
  connection past the transport's 60 s). **At least once, same id**: an
  answer that is not a 2xx, a timeout, no instance or a wake refused for
  memory is delivered again after 1, 5, 15 minutes (4 attempts); a 4xx but
  408 and 429 — no handler (404), a signature the tool does not read — is
  given up at once; an awake tool with no place free (every place of its
  team host taken, its instance being replaced: `toolfront.ErrNoInstance`
  alone) is tried again after 5 s, not counted, for an hour after the run's
  time at most; the next time of the schedule supersedes a run still
  waiting (given up, its last outcome kept). A run posted when the node
  stopped is delivered again at its next start as its next attempt.
  **Bounds**: one run in flight per schedule — a time that comes while it
  runs is journaled `skipped` —, **four in flight on the node** (the others
  wait for a place, not failed: a small server wakes a few tools at a time,
  not every tool whose morning it is). **State** (`installation/schedules/
  tools/<tool>.json`, 0600, directory 0700, replaced atomically,
  `privatefs.Replace`, in the nightly archive): per schedule its line and
  the last time it handled, and the journal — the last 10 runs of each
  schedule, when, how started (`time`, `missed`, `manual`), the attempt,
  the status, the duration, why (`answer` with its status, `timeout`,
  `memory`, `unreachable`, `busy`); never what the tool did. A file not of
  this shape starts over (logged). A schedule no longer declared goes with
  its runs; a tool without any keeps no file; a tool removed takes its file.
  Memory: the engine holds each tool's small file (80 runs at most) and
  nothing per schedule but its parsed line. **Whoever runs the tool**
  (`serverRunner`: the owner, an admin, its Builder): `GET
  /api/tools/{app}/schedules` → `{zone, schedules: [{name, cron, next,
  running}], runs}` (newest first); `POST /api/tools/{app}/schedules/run
  {name}` → 202 and the run, waiting — 404 a schedule not declared, 409 a
  run running or waiting. The overview shows “Runs by itself”: each schedule
  in words, its next time, Run now (Running… while one is under way), the
  zone, then the last runs, and follows a run under way every 3 s (2 min at
  most). **For agents**: `GET /api/v1/tools/{app}/schedules` (any token of
  whoever runs it) and `POST /api/v1/tools/{app}/schedules/run` (a write);
  the MCP server's `schedules` and `run_schedule`. **Laboratory**:
  `portal.schedule_lab` `{every_seconds}` in `node.json` (30 s to 15 min)
  runs every schedule each that long instead of its line; a server with a
  dependency binding refuses it.
- **AI gateway** (`chest/aigateway`, `cmd/chest/application_ai.go`,
  `chest/portal/ai.go`, manifest `capabilities: ["ai"]` and its key `ai`;
  product: `01_produit/02_specs/ai-gateway.md`, lot AI1): the one path
  through which a tool calls AI models, **with the company's own key** (a
  BYOK connector). **No tool ever holds a key** and none needs a `network`
  entry: it calls its Chest's API, and **the node itself** reaches the
  provider.
  - **Connector**: one, **OpenRouter** (`providers.go`: a provider is its
    API base, a cheap check under the key, the fields every request adds
    and the models Argentic chose; adding a provider is adding one entry),
    connected by the owner or an admin with its key. The key is checked
    with the provider first (OpenRouter's `GET /key`, 15 s) and kept only
    if it passes, then **sealed** in `installation/ai/keys.enc`
    (AES-256-GCM under the node key of the tools' variables,
    `installation/variables.key`, its own additional data), **never
    returned by any route**: the pages see its last four characters. A new
    key replaces the connector; a key the provider refuses at a call marks
    it `refused`, a call that passes marks it `ok` again.
  - **Aliases**: `default`, `fast`, `smart`, `embedding`, each led to a
    model of the connected provider and its price in US dollars per
    million tokens (in and out), Argentic's choice refreshed with the
    releases (OpenRouter: `default` Claude Sonnet 5, `fast` Gemini 2.5
    Flash, `smart` Claude Opus 5, `embedding` OpenAI's text-embedding-3-small).
    The owner may lead `default` to another of five models of a short list
    (`config.json`, `model`); nothing else is set by hand. A tool calls only
    the aliases its manifest declares.
  - **Routes of the tool** (on `CHEST_API`, `aigateway.API`; the instance
    is the identity): `POST /ai/chat` — OpenAI's Chat Completions shape,
    known keys only (`model`, `messages`, `max_tokens` 1–128,000, 4,096 by
    default, `stream`, `temperature`, `top_p`, `stop`, `tools`,
    `tool_choice`, `response_format`, `parallel_tool_calls`, `seed`,
    `reasoning_effort`, and `member`, a member identifier kept in the
    journal only), 10 MiB; the answer as the provider gives it, its
    `usage` written by the gateway (`prompt_tokens`, `completion_tokens`,
    `total_tokens`, `prompt_tokens_details.cached_tokens`, `cost` in
    estimated euros); streamed (`stream: true`) as Server-Sent Events of
    `chat.completion.chunk`, ending with a chunk of the gateway's usage and
    `[DONE]`, a failure after the start as `data: {"error": code}`;
    `POST /ai/embeddings {model, input, dimensions?, member?}` (1–256
    inputs); `GET /ai/models` (the declared aliases, each with its model,
    provider and prices, once a provider is connected); `GET /ai/usage`
    (`{month, spent, cap, resets}`, this tool's). Errors `{"error": code}`:
    `invalid_body`, `invalid_request` (the provider's `message`, 300
    characters) 400, `cap_reached` 402 (`scope`: `tool` or `chest`,
    `resets`), `capability_not_granted`, `model_not_allowed` 403,
    `too_large` 413, `content_refused` 422, `rate_limited` 429
    (`Retry-After`), `provider_key_invalid` 502, `no_connector`,
    `provider_unavailable` 503 (with the provider's status and words in
    `message` when it gave some, `reason: "credits"` when its credits do not
    cover the call — OpenRouter's 402 —, and `provider`, whose failure it
    is).
  - **Request**: the gateway sets the model, `max_tokens` and, for a
    stream, `stream_options.include_usage`, then what the provider adds to
    every request — for OpenRouter, **private by default and not a
    setting**: `provider: {data_collection: "deny", zdr: true}` (only
    endpoints that keep nothing and collect nothing), and for a chat
    `provider.require_parameters: true` and `usage.include`, whose `cost`
    it counts.
  - **Reaching the provider**: the node's own HTTPS client — no proxy of
    the environment, redirects never followed, each address checked at the
    socket by the node's egress guard (`egress.Guard.Control`: never a
    forbidden address, an address of the node or a name of the Chest), 10 s
    to connect, 5 min for an answer's headers, 5 min for an answer and 10
    min for a stream; the client that goes aborts the provider's request.
    Until the node knows the Chest's names, no provider is reached.
  - **Caps, reserve then settle**: a tool's monthly cap (“limit” on the
    pages) is the owner's (the tool's settings; 0 pauses its AI) or what
    its manifest asks; the Chest's is optional. Before a call, the gateway
    reserves its worst case — the body's size over three as input tokens
    plus `max_tokens`, at the model's price — against both caps: a call
    that does not fit is refused `cap_reached` before any spend. After it,
    the reservation is replaced by what it cost: the provider's own `cost`
    (OpenRouter's), or tokens at the model's price — those read from the
    provider's cache and written to it at theirs (`cachePrices`: Anthropic
    a tenth and a quarter more, OpenAI a tenth, Google a quarter) —; a stream cut short
    counts the tokens it produced (its characters over four when the
    provider said nothing). Money is counted in micro-euros, dollars
    converted at a fixed estimated rate; the company's account with the
    provider is the final limit. **Month totals survive a restart**
    (`installation/ai/month.json`, written at each settlement; reservations
    live in memory: a restart ends their calls). **Rates** (in memory): 60
    calls a minute and 8 streams at once per tool, 32 streams for the
    Chest.
  - **Journal** `installation/ai/usage-YYYY-MM.jsonl` (`chest/jsonjournal`,
    kept 13 months): one line per call — `t`, `tool`, `member`, `kind`
    (`chat` | `embeddings`), `alias`, `provider`, `model`, `input`,
    `output`, `cached`, `cache_write` (the tokens written to the provider's
    cache), `cost` (euros), `ms`, `status` (`ok`, `aborted` or
    the error code), `stream` —, **never a prompt, an answer, a tool's
    arguments or a file**. A tool removed loses its cap and its line of the
    month (`Gateway.Forget`); the Chest's total keeps what it spent.
  - **Settings → AI** (`/settings/ai`; `chest/portal/ai.go`; owner and admins only, 403
    otherwise): `GET /api/ai` → `connector` (`{provider, key_hint, state}`
    or null, never a key), `model` (of `default`) and `models` (the choices,
    `{id, name, input, output}`; both empty without a connector), the
    month, the Chest's cap and spending, and each tool in service that
    holds AI with its cap, what it asks and what it spent; changes are
    POSTs of a JSON body — `/api/ai/connector {provider, key}` (422
    `key_refused`, `unreachable`), `/api/ai/connector/delete {}`,
    `/api/ai/model {model}` (400 for a model not in the list, 404 without a
    connector), `/api/ai/caps {app, cap | null}` (404 for a tool without
    AI), `/api/ai/chest-cap {cap | null}`. The page
    (`chest/web/portal/src/ai.ts`, `components/ChestAI.tsx`) is the third
    tab of the Chest's settings, after General and Storage, one section as
    Vercel and Supabase show an integration: what AI is for in one
    sentence; until connected, “OpenRouter API key”, Connect (“Checking…”
    while the provider answers, its refusal in one line under the field)
    and “Get a key on openrouter.ai”; connected, “Connected to OpenRouter ·
    €X spent this month” (“of €Y” with a limit) and the key's end (or the
    provider's refusal of it and the key field again), Disconnect (with a
    confirmation), “Models” and the name of `default`'s model with Change
    (a select of the short list, saved when chosen), “Monthly limit for the
    Chest” (empty: none), and the privacy in one line of small text. A
    tool's own limit is on its settings (`ToolAI`, owner and admins, tools
    that hold AI): “This month: €X of €Y”, a limit near (80 %), reached or
    0 said in words, Change limit (a compact panel, back to what the tool
    asks).
  - **Lab only**: `node.json` (`portal.ai_lab`, `{providers}`) has every
    provider answered at `<providers>/<provider>` — the laboratory's fake
    provider — and is refused by a server that has a dependency binding
    (`dependencies.json`), that is, every real server.
  - **Not built yet** (AI2, AI3 and later): other providers, the
    OpenAI-compatible endpoint inside the container (`CHEST_AI_BASE_URL`),
    alerts at 80 % and 100 %, the usage chart and per-model view,
    `GET /api/v1/ai/usage` and the MCP `ai_usage` tool, per-tool rates set
    by the owner, Perseus Code's line in Settings → AI and its caps set
    by the owner (PB5).
  - **Perseus Code's calls** (`build.go`, lot PB2): the node makes the
    model calls of Perseus's turns (`Gateway.Build`) — Perseus never holds
    a key — on the alias `build` (Claude Sonnet 5 through OpenRouter; no
    tool may call it: a manifest's aliases are the four above) or `fast`
    (summaries), always streamed. A call names its answer's maximum
    (1–128,000 tokens) and, of it, the most the model reasons (`Reasoning`,
    sent as OpenRouter's `reasoning.max_tokens`, at most half the answer);
    the provider reserves credit for the whole answer asked. **Prompt
    caching** (`cache.go`): a turn sends the same long prefix at every call;
    for an Anthropic model, which caches only from explicit breakpoints,
    the gateway marks three (`cache_control`, ephemeral): the end of the
    system message (the instructions, the knowledge index, the project's
    `AGENTS.md`; the tools come before it) and the two latest messages with
    content, which the next call finds again as its own prefix; other
    providers cache by themselves and are sent nothing. Its one limit is the Chest's:
    each is reserved at its worst case against the monthly budget the owner
    sets in Settings → AI, when set, and refused `cap_reached` (scope
    `chest`) before any spend — no cap per conversation, builder or Perseus
    Code; the key's own limits at the provider are the rest. Its cost
    counts in the Chest's month; a journal line names the builder, the
    project and the session instead of a tool. Perseus Code counts in the rate of 60
    calls a minute and 8 streams of its own line (`perseus:`).
- **Realtime** (`chest/realtime`, `chest/livesocket`,
  `cmd/chest/application_realtime.go`, `chest/portal/tool_server.go`
  `teamRealtime`, `chest/draftfront` `live`; manifest `realtime`, capability
  `realtime`; [spec](../../../01_produit/02_specs/realtime.md)): the Chest
  holds every live connection of a tool's pages, so that the tool writes no
  socket code and sleeps while they stay open — a connection to the hub is
  not a visit (“Server tools asleep”).
  - **Endpoint**: `GET /_chest/realtime` on the tool's team host
    (`Allowance.Stream`: the session read, committed and released before the
    upgrade) and on a draft's host. Upgrade (RFC 6455, subprotocol
    `chest-realtime.v1`, version 13, a key of 16 bytes; 400 or 426
    otherwise): `Origin` exactly the host's (403 — a WebSocket is not guarded
    by CORS), a live session (401, never a sign-in), the member given the tool
    now (`Team.Seen`, 403), the capability held by the version in service
    (404), room in the server's memory (503 `Retry-After: 5`). The identity
    is the connection's: member id, subject, role, a digest of the session
    and its end (`LiveSession`: its deadline or its idle end, the sooner).
    Without `Upgrade`, the same checks renew the session — what a connected
    page asks every 5 minutes, and a page whose connection failed before it
    tries again —: its deadline slides an hour while the provider still
    signs the person in (`renew`), the cookie is written again and the
    page's connections live on with it (`Space.Renew`); 204, 401 signed
    out, 403, 503 `Retry-After` while the provider does not answer
    (`Unanswered`) or the server has no room. No hourly cut: a session ends
    only when the person is signed out or stops renewing it (`1008
    session_ended`). A draft's session (12 hours) is not renewed. The tool
    is never called. The connection leaves the server's
    goroutine at once (`Space.Serve`): an idle page holds one goroutine
    reading it, its writer running only while frames wait.
  - **Framing** (`chest/livesocket`): text only (binary → 1003), never
    compressed, every client frame masked (1002), fragments joined within
    the bound (1009 beyond), UTF-8 (1007), pings answered, closes echoed,
    read straight from the TLS connection (the server's buffer let go). A
    frame to many pages is built once (`Text`) and shared by their queues.
  - **Spaces and channels** (`realtime.Hub`, one per node; `Space`, one per
    tool, `tool:<app>`, and per draft, `draft:<project>`, nothing held until
    a page connects): a channel is a name the manifest's patterns match
    (`packagefile.Channel.Matches`: exact, `prefix:*`, `prefix:{member}` the
    member's own id, `prefix:{key}` a membership table), joined under its
    rule (every member, roles, or a row of the membership table read on the
    tool's database), each channel joined holding `joinCost` (512 bytes,
    `TestMemoryPerJoin`) of the server's memory — `error full` beyond it,
    no fixed number —, re-checked at each ephemeral send (`send: true`, 4
    KiB, 20 a second per page) and presence update (`presence: true`, a
    JSON object of 1 KiB, merged per member, a leave told 5 s after their
    last page left). A member's send is a `peer` frame (`from` set by the
    Chest), its name without a dot (`invalid_event` otherwise): never a
    `msg`, whose events — feed rows, publishes — are the tool's and the
    Chest's alone. A page's `focus` (a joined channel, or none) is kept
    per connection and never told to another page. The tool's API
    (`CHEST_API`, `/realtime/`: `publish` 64 KiB, `send` to members' pages,
    `online` — with a channel, `watching`: those with a page focused on it
    —, `presence`) publishes to any declared name. Every message of a channel is numbered (`seq`) in the
    space's epoch and kept 2 minutes; a row of a feed carries its place in
    the change log too (`pos`). A page back with `{epoch, seq, pos}` is
    replayed what the channel kept; else, on a channel a feed writes, the
    rows of the change log after `pos` (`Conn.replay`: 256 at a time, as
    fast as the page reads them, what reaches the channel meanwhile held
    for it and sent after, never twice), whatever the absence and across
    epochs; `resync` only beyond what the log keeps, or on a channel no
    feed writes. The tool's publishes are hints: kept 2 minutes, never
    replayed beyond.
  - **Database** (`chest/tooldatabase/realtime.go`): after a version's
    migrations (and a draft's, at its dev server's start), the Chest
    installs as the tool, in one transaction, the triggers of its feeds and
    membership tables (schema `chest_realtime`, one plpgsql function
    reading its arguments; those of the version before dropped first; a
    table or a column absent refuses the version): a feed's row is written
    in the change log (`chest_realtime.changes`: its place, channel, event,
    the row — 7,000 bytes at most, its key alone beyond, `partial` —,
    numbered in commit order under one transaction lock, kept 7 days,
    pruned every 512 rows, the place reached in `chest_realtime.pruned`)
    and notifies `{k: f, i, c, e, r, p}` at commit; a membership row
    deleted or whose key or member changed `{k: m, t, key, m}`. While a space whose rules read its database has
    pages, the node holds one session on it (`Listener`: `LISTEN
    chest_realtime` as the tool's reader, `search_path` catalog first,
    membership checked by key and member with bound parameters, a key its
    column cannot read being no row, the change log read back by
    `Head` and `Since`), opened again 5 s apart after a failure — and once
    back the space starts a new epoch and closes its pages `1013`
    (`Space.Lost`), which come back and are replayed from the change log.
  - **Revocation**: every change of the team (`access.Team.Watch`) judges
    every connection again within a second (`Team.Judge`, one policy read):
    a member who lost the tool is closed `1008 access_removed`, a role that
    no longer opens a channel leaves it (`kicked`); a membership row deleted
    kicks at once; a new version judges its connections under its rules;
    a session not renewed in time closes `1008 session_ended`; a safety pass every
    minute; a tool removed or a draft deleted closes them all. A draft's
    space is judged by who may open the project.
  - **Capacity**: nothing set aside. Each connection costs
    `livecapacity.ConnectionCost` (node 24 KiB + front 32 KiB, measured by
    the `TestMemoryPerConnection` of `chest/realtime` and `common/front`:
    about 21 and 31 KiB), held in the node's memory with the tools awake
    and the workbenches (`realtime.Room`, `cmd/chest` `liveRoom`): admitted
    as a tool's wake is — idle tools put to sleep for it —, refused only
    when nothing more can sleep (503, counted with the wakes refused: the
    capacity alert). The messages waiting toward pages and those kept for
    backfill are held there too while they fit: a page more than 256 KiB
    behind, or one the server's memory cannot hold a message for, is
    closed `1013` and comes back to its replay; a channel kept beyond the
    memory forgets its oldest first. Pings every 30 s; a page silent 75 s
    is cut. Lines in the tool's log, once a minute per kind: connections
    refused, pages closed to come back, a feed naming no channel. Settings
    → Server → Details: “Live connections: open · memory”
    (`serverwatch.View.Live`, never in the central's report); the memory
    is counted in what the Chest reserves.
- **Storage view** (`chest/portal/tool_files.go`, `cmd/chest/application_files.go`;
  tab Storage in the Data family, beside Database, `chest/web/portal/src/storage.ts`,
  `components/ToolStorage.tsx`): for whoever sees the data of a server
  tool whose version in service declares files (`dataRunner`: the owner,
  an admin, a builder of the tool the owner or an admin allowed; 403 for a
  member, a builder not allowed or the builder of another tool; 404
  `no_files` otherwise), `Cache-Control:
  no-store`. `/api/tools` says `files: true` for such a tool.
  - `GET /api/tools/{app}/files?folder=&q=&sort=&desc=1&offset=` →
    `{usage: {bytes, objects, quota, max_objects, max_object, asked, set,
    choices}, folders: [{name, objects, bytes}], files: [objects],
    total}`: a folder (a prefix ending in `/`; folders are virtual, made
    of the `/` in names) — its folders by name first, then its objects —,
    or a search (`q`, anywhere in the name, whatever its case, across
    the tool, not with `folder`), sorted by name, size or updated, 200
    rows a page; `?name=` alone → `{file}`.
  - `GET …/files/thumbnail?name=` → the 256 px thumbnail, made by the
    Chest (JPEG or PNG it encoded, `default-src 'none'; sandbox`), on the
    portal's origin: the only image of a tool the portal shows, never the
    tool's bytes. Browsing: not journaled.
  - `GET …/files/preview?name=` → an image as its 1,024 px thumbnail, a
    text (`text/plain`, `text/csv`, `text/markdown`, `application/json`)
    as its first 64 KiB in `text/plain; charset=utf-8` (cut before a
    broken character), 415 `no_preview` otherwise; journaled `preview`.
    A PDF or a video is opened through a link, in a new tab.
  - `POST …/files/url` `{name, download?}` → a link on the team host
    (15 min), journaled `link` or `download`.
  - `POST …/files/delete` `{names}` (1,000 at most) or `{folder}` (1,000
    files at a time, `{deleted, more}`), each journaled `delete` before
    it goes; a name no longer there is passed over. The tool is not told.
  - `POST …/files/quota` `{quota}`: one of the choices of the usage, or 0
    for what the tool asks; the owner and the admins only (403 for a
    builder); 400 `quota_not_offered`; journaled `quota`.
  - `GET …/files/journal` → `{entries: [{t, member, token?, action,
    name?, bytes?}]}` (`member` the member's identifier), the last 200, newest first. The storage journal is
    `installation/tool-files-journal/<tool>.jsonl` (0600, beside `apps/`,
    never in a Compartment or a backup), 90 days (`chest/jsonjournal`),
    removed with the tool, swept at start. **A journal that does not
    write refuses the access** (503): nothing is previewed, linked or
    deleted unwritten. Never a content.
  - The screen: the used space against the quota as a thin black rule
    and the count (“Almost full” beyond 90 %, “Full: uploads are
    refused”), the search, “Quota: 5 GiB ›” (a panel of the choices for
    the owner and admins), the folder as a path (“Delete folder”), the
    rows with their thumbnail or a drawn icon, the type in words, size and
    age, sortable headers, “Load more”; a file opens in the detail beside
    the list (full screen on a phone): its preview, full name, type, size,
    dimensions, updated, “Download”, “Copy private link (15 min)”,
    “Delete”. Deleting one file is confirmed by its name (“The tool may
    still refer to this file.”), a selection by typing its count, a
    folder by typing its name. No upload, no rename: the tool owns its
    names. Empty: “No files yet. The tool stores them here as it works.”
  - **Chest-wide**: `GET /api/storage` (owner and admins; not through a
    token narrowed to tools) → `{tools: [{app, database, files}], disk:
    {size, used, free}}` (the disk of the installation, `statfs`);
    Settings → Storage (`/settings/storage`) shows it, each tool leading to
    its Storage tab.
  - **Agents**: `GET /api/v1/tools/{app}/files` (query), `GET
    …/files/journal`, `POST …/files/url`, `POST …/files/delete` (a
    write: refused to a read-only token), the same rights and journal
    (the token's name in it); MCP `files_list`, `files_link`,
    `files_delete` (two steps).
- **Storage** (`GET /api/tools/{app}/storage`, `chest/portal/tool_storage.go`,
  `cmd/chest/node_storage.go`), for whoever runs the tool (`serverRunner`:
  403 for a member or the builder of another tool, 404 for a removed tool or
  an absent tool, `Cache-Control: no-store`) → `{"database": {"bytes",
  "measured", "limit"} | null, "files": {"bytes", "objects", "quota",
  "max_objects", "max_object", "asked", "set", "choices"} | null, "memory": {"mib", "choices"}}`: the size of the
  database as measured (`bytes` null as long as it has never been measured),
  file usage against its limits; a part the version does not
  declare is null; the tool's memory and the possible choices
  (“Memory”, below) — this is how its builder reads it. The
  Overview of a server tool turns it into a “Storage” row: “Database: 12 MB
  · Files: 3 MB of 1 GiB”, a part beyond its limit underlined and
  stated (“over 1 GiB”, “full”); nothing without the route.
- **Visible database** (`chest/portal/tool_database.go`,
  `cmd/chest/application_console.go`, engine: “Console” above):
  for whoever sees the tool's data (`dataRunner`/`scope.Sees`: the
  owner, an admin, a builder of the tool the owner or an admin allowed;
  403 for a member, a builder not allowed or the builder of another tool), only a server tool whose
  version in service declares `database` (404 `{"error":"no_database"}`
  otherwise, 404 for a removed or absent tool), `Cache-Control: no-store`,
  JSON body (`Content-Type: application/json`, 415 otherwise; 1 MiB, known
  fields, 400 `invalid` otherwise), POST routes in the `Allow()` list. The same API
  for the interface, the SDK and later agents:
  - `GET /api/tools/{app}/database` → `{"tables": [{schema, name, kind,
    rows_estimate, key, editable}], "truncated", "migrations": [{name,
    applied_at}]}`;
  - `POST …/database/structure` `{"table": {schema, name}}` →
    `{schema, name, kind, editable, "columns": [{name, type, nullable,
    default, key, generated, identity}], "indexes": [{name, definition}],
    "constraints": [{name, type, definition}]}`;
  - `POST …/database/rows` `{"table", "filters": [{column, op, value}],
    "search", "sort": {column, desc} | "sorts": [{column, desc}…], "after":
    [key…], "offset", "limit", "count"}` → `{"columns": [{name, type}],
    "key": [columns], "editable", "rows": [{cells, cut, key, version}],
    "next": {after} | {offset} | null, "count"}`;
  - `POST …/database/rows/insert` `{"table", "values": {column: value}}`,
    `…/rows/update` `{"table", "key", "version", "values"}`,
    `…/rows/delete` `{"table", "key", "version"}` → `{"row": {cells, cut,
    key, version} | null}`;
  - `POST …/database/query` `{"sql", "write", "commit"}` → `{"columns",
    "rows", "cut": [[row, column]], "truncated", "command", "affected",
    "committed", "ms"}`;
  - `GET …/database/journal` → `{"entries": [{t, member, action, table,
    kind, outcome, affected}]}`, the last 200, most recent
    first.

  Errors `{"error": code, "reason"?, "migration"?: {name, sql}, "sql"?:
  {state, message, detail, hint, position}}`: `invalid` 400, `not_found`
  404, `row_changed` 409, `read_only`, `structure` (with the proposed
  migration), `refused`, `sql`, `timeout`, `too_large` 422, `busy` 429 —
  **two requests per tool, eight per node**, never queued —,
  `stopped` 503 — **the console never starts the cluster**: when it is stopped, it
  says so (“Database stopped”) —, `unavailable` 503 (guard absent, session
  lost; the cause in the node's log). Every request, successful or not
  (refused `busy`, `stopped`, `unavailable` included), is written to the
  tool's journal before the response; without a journal that can be opened, nothing
  runs. The journal goes with the tool (removal, abandoned installation,
  sweep at node startup, which also removes its lines older than
  90 days). `GET /api/tools` adds `"database": true` to a server tool
  that has a database.

  **“Database” tab** (`/tools/{name}/database`;
  `chest/web/portal/src/components/ToolDatabase.tsx`, controller
  `chest/web/portal/src/database.ts`), shown for a server tool listed
  with `database: true`, to whoever sees its page: Supabase's table
  editor, **read-only**, in the portal's black and white. The screen
  adds, modifies or deletes no row, and has neither SQL nor journal;
  the write routes, `query` and `journal` remain the console's,
  for agents and the operator; the journal remains the security trace of
  every access. Responses go through `consoleRequest` (`api.ts`): a
  JSON refusal is read in full (`DatabaseRefusal`), within the limits of
  `chest/web/portal/src/limits.ts` (20 s, 24 MiB for these routes); every
  shape is checked (`databaseOverviewView`, `structureView`,
  `rowsPageView`). One request at a time (two per tool on the node side).
  - **Tables**, on the left: “Search tables…” and the names, each
    with its icon, the active one marked; the column collapses (panel
    button at the head of the tabs).
  - **Tabs**: each open table, its icon and its name in italics,
    closes (×); a click in the list opens its tab or brings it back. They
    live in the page (not after a reload); the first table
    the tool writes opens with the tab.
  - **Bar**: “Filter by …” (`search`, across all columns),
    “Sort” (up to 4 sorts, column and direction), “Columns” (checkboxes to
    show or hide), “Refresh”.
  - **Grid**: sticky header, name and type in gray, primary key
    icon, a menu per column (“Sort ascending”, “Sort
    descending”, “Copy name”, “Freeze column” — kept on the
    left —, “Hide column”); one line per cell, cut with
    “…”, thin rules, width adjustable at the header edge, horizontal
    scrolling.
  - **Footer**: “← Page [n] of N →” (pages by `offset`, up to
    10,000 rows from the start), “50 | 100 | 250 | 500 rows”, “N
    records” (exact `count`; beyond 2 s, PostgreSQL's estimate
    preceded by “≈”) and “Data | Definition”. The
    definition writes the table as `CREATE TABLE` (columns, types,
    defaults, NULL, constraints) then its other indexes, in monospace,
    with one sentence: “The structure changes through a migration in the repository.”
  - Refusals in words (`notify.ts`, `consoleWords`): timeout, database busy,
    database stopped (in place of the tab, with “Retry”), invalid
    filter, table gone.
- **Memory** (`chest/toolmemory`, `cmd/chest/node_memory.go`,
  `chest/portal/tool_memory.go`): the memory of a server tool's
  container, **256 MiB by default**, a closed list of choices
  (`toolmemory.Choices`: 256, 512, 1024 MiB, the single source; `RunServer`
  refuses any other value before Podman), `--memory` and `--memory-swap`
  equal (no swap). The node's resources are the Chest's: the
  owner and the admins choose it, a builder reads it.
  - **At rest**: `apps/<tool>/memory` in its Compartment (the number and
    a line ending, 0600, written aside then renamed, directory synced;
    absent for 256); read at each instance start along with the
    variables — a choice applies at the next start; an altered file
    or a link: the instance does not start (the one in service continues). It
    follows the Compartment: kept when one version replaces another (update,
    rollback, source replaced), removed with the tool, in the nightly
    archive with the Compartments.
  - **Capacity guard** (a guard, not a guarantee): the node's budget is
    `MemTotal` from `/proc/meminfo` minus 1.5 GiB kept for the Chest,
    Keycloak and PostgreSQL (`toolmemory.Reserve`); only the tools awake
    and the workbenches hold it (“Server tools asleep”, below). A choice that
    gives the tool more than it has is refused beyond the budget: the tool
    must be able to wake alone, the others asleep. A decrease or the same
    choice always passes; outside Linux (development machine), no
    budget and no guard. Nothing is measured of what the other processes
    actually consume; a new tool gets 256 MiB.
  - **Route**: `POST /api/tools/{app}/memory` `{"mib"}` (strict JSON) → 204;
    `serverRunner` then owner or admin only (403 for a member
    and for any builder, even of this tool), 404 for a removed tool or an
    absent tool, 400 outside the choices, 409 “not enough memory on the node for its
    tools” beyond the budget, 503 otherwise. Reading is through Storage
    (`GET /api/tools/{app}/storage`, `memory`), putting into service is as for the
    variables (`POST /api/tools/{app}/redeploy`).
  - **Page**: the “Settings” tab of a server tool has a
    “Resources” section: the “Memory” row, a 256 / 512 / 1024 MiB list
    for the owner and the admins, the value alone for a builder;
    after a choice, “Applies at the next start.” with
    “Restart to apply”.
- **Supervision** (`cmd/chest/application_server.go`): one instance at a
  time per version, put into service as soon as it answers anything at all to
  `GET /` (60 s at most), taken out when it stops — the tool is then the
  Chest's 503 page —, restarted after 1 s, 2 s, 4 s… 5 min at most, the delay reset
  to zero after ten minutes in service: supervision never gives up while the
  tool is awake. At node startup every tool is asleep (below): nothing
  starts until something asks for it; it does not decide the node's state.
- **Server tools asleep** (`cmd/chest/node_sleep.go`,
  `serverApplication.sleep` and `Wake`, `chest/toolfront/wake.go`; product:
  the fleet monitoring spec, “Sleeping tools”): a tool that **no request
  reached for 15 minutes** (`toolIdle`; the front's requests and the Chest's
  deliveries count, from the time an instance is put in service —
  `Target.LastUse` —; the tool's own timers and its calls to the Chest's
  API do not) and serves none is **put to sleep**, checked every 30 s: its
  generation ends — `SIGTERM`, what it serves finished first (30 s at most)
  —, its container goes (`--rm`), its Compartment, database, files and log
  stay. Its log says “Asleep: no visit for 15 min”. A tool woken that
  never answers is put to sleep the same way once idle as long since it
  woke, its restarts ended. **Waking**: the first
  request or delivery that finds no instance calls the target's wake
  (`Target.Wakes`), which starts a generation and waits for its first
  answer; the wakes of the same moment wait for the same one (one
  instance). A request waits 60 s at most (`toolfront.WakeHold`), then is
  the 503 page; a browser opening a page (`Visit.Navigation`: a `GET` in
  mode `navigate`, or accepting HTML) waits 2 s, then gets the Chest's
  page “Waking up <title>…” (`toolfront.Waking`: 503, `Retry-After: 2`,
  `<meta http-equiv="refresh" content="2">`, no script, a CSS hairline
  that moves unless reduced motion is asked, the tool's title from its build
  or its name, escaped), which asks again by itself until the tool answers.
  A switch of version, a redeploy or an installation wakes the tool. **The
  server's memory** (`nodeApplications.makeRoom`, one admission at a time,
  `nodeRoom`): each instance is admitted before it starts, its memory held
  until it stops; it fits when the memory held by the tools awake, the
  workbenches and itself stays within the budget (`toolmemory.Budget`);
  otherwise the awake tools that serve no request are put to sleep, the
  least recently used first — never the one waking —, their log saying
  “Asleep: made room for another tool”; when nothing more can sleep, the
  wake is refused (`toolfront.ErrNoRoom`): its log says “Not started: not
  enough memory on the server”, the tool stays asleep, a browser gets “<title>
  cannot wake up right now” (`toolfront.Full`, 503, `Retry-After: 60`), a
  delivery is tried again later as one the tool refused. A workbench of
  Perseus Code is admitted the same way (idle tools sleep for it) and is
  refused with `toolmemory.ErrCapacity`. The node keeps, in memory, when
  tools were put to sleep for another and when wakes were refused (the last
  1,000 of each, counted over 24 hours): the capacity alert. What never
  wakes a tool: its logs, its network log, its database (console, size,
  migrations — the cluster is its own container), its files and storage,
  its variables, memory and settings, the pages of the Chest; what does:
  its hosts' requests (public, team, custom domain, static files), the
  events of its members (`Target.Deliver`), the runs of its schedules
  (`Target.RunSchedule`), a new version, a redeploy.
  **Laboratory**: `portal.tool_sleep_lab` `{idle_seconds}` in `node.json`
  (5 s to 15 min) shortens the idle time; a server with a dependency
  binding refuses it. The lock on the
  tool's state (`recordstore`) guarantees a single supervisor per scope; a server
  keeps nothing there.
- **Zero-downtime version**: the new version starts next to the one in
  service and receives traffic as soon as it answers; the old one finishes
  what it is serving (30 s at most) then stops. A version that does not answer
  within the delay is stopped, the one in service is neither stopped nor restarted,
  and the inventory names it again.
- **Front** (`chest/toolfront`): HTTP relay through the instance's socket
  (64 requests at a time per instance and per host — the public host and
  the team host have separate slots: anonymous traffic never takes the
  members' —, 503 beyond), body of 16 MiB at most,
  60 s to read the request and 5 min to answer (beyond the portal
  server's timeouts, per request), `Upgrade` refused (501): a tool's pages
  are kept live by the Chest (“Realtime”), never through a socket of the
  tool's own. Toward the tool:
  path, query and `Host` unchanged, every `Chest-*` header removed, the
  `__Host-chest` cookie removed, `X-Forwarded-Proto: https` and `X-Forwarded-Host`
  set by the Chest (the client's removed); a tool asleep is woken first
  (“Server tools asleep”), its request held. Toward the browser: every
  `Set-Cookie` named `__Host-chest`, unreadable or carrying `Domain` is removed
  — a tool's cookie belongs only to its host. An instance switchover makes
  no request fail.
- **Public host** `<tool>.<chest>.<base>` (`ToolPublicHandler`), with no OIDC
  client and no session: TLS and exact name (421 otherwise); a path that is not
  in its simple form (`//`, `.` or `..` segment, `\`, `%2F`, `%5C`, `%2E`,
  `%00`) → 400; tool absent or removed → 404; first segment `chest`, in
  any case → 302 to the team host, same path and same query, whether the
  public part is open or not; without a public part → 404 “Page
  not found”; closed part → 404 with the Chest's page “This page
  is not published.” (`toolfront.NotPublished`: nothing about the tool is
  said); otherwise relayed without identity, with, added to every response,
  the `packagefile.DefaultCSP` policy (`default-src 'self'`, `script-src
  'self'`, `frame-ancestors 'none'`…): two policies combine, the tool
  can only tighten. It forbids any inline script — including those of
  Next.js hydration. A version approved with `csp`
  (`Binding.OwnCSP`, `Visit.OwnPolicy`) replaces this policy with its
  own: to a response that carries a non-empty `Content-Security-Policy`,
  the Chest adds only `packagefile.FloorCSP` (`frame-ancestors 'none';
  base-uri 'self'; object-src 'none'` — no fetch directive,
  no script blocked); a response from this tool without a policy, or with an
  empty policy, receives `DefaultCSP`: the widening is the tool's
  policy, never its absence. Its policy is then its responsibility —
  approved like a permission (“Next.js on Chest”, below, for a
  nonce-based policy). `/_chest/` is the Chest's there too, never the
  tool's (`Portal.publicChest`): the visitors' uploads (“Files”), and
  the two scripts of embedding; anything else 404.
- **Embedding the public part** in the company's website: the owner or
  an admin allows sites one at a time (`POST /api/tools/{app}/embeds
  {"origin", "allowed"}`, 204; 400 `invalid_origin`, 409
  `no_public_part`, 403 for anyone else — a Builder too; `GET …/public`
  says them as `embeds`, the page reading up to 64 MiB as for the team),
  kept in the access policy (`access.Embed`, per Chest and tool, gone
  with the tool): https origins in their one plain form, a domain name of
  two labels at least, a port at most, no address, no wildcard
  (`access.ValidEmbedOrigin`), each once. No count bounds them: only the
  capacity of the policy (`access.MaxBytes`), beyond which a site is
  refused 507 (`ErrFull`) as a member is. The public part —
  its host and its custom domain, never the team host — then says them in
  `frame-ancestors` instead of `'none'` (`Visit.Ancestors`,
  `toolfront.framed`): on the policy the Chest adds (`DefaultCSP` or
  `FloorCSP`; a tool's own `frame-ancestors` still intersects) and on
  the Chest's own pages there (waking, full, unavailable), so a framed
  tool that sleeps shows its waking page in the frame. A page asked as a
  frame (`Sec-Fetch-Dest: iframe`, a `GET`) gets `<script
  src="/_chest/frame.js" async>` after its `<body>` (the banner
  mechanism: asked uncompressed): it tells the height of the page,
  `{chest: "height", height}` (the root's box, or what overflows it), by `postMessage` to each allowed site by
  name (never `*`), at each change (`ResizeObserver`). The site's page
  loads `/_chest/embed.js` (served to anyone, `Cross-Origin-Resource-
  Policy: cross-origin`, the public origin written in it): it sets to
  that height the frame whose window sent it, from that origin only,
  1 to 100,000 px. The settings give the snippet (an `<iframe>` of the
  public address, 600 px until told, and the script). The Chest sets no
  cookie on the public part; a tool's own cookies are third-party in a
  frame (the SDK's contract says to keep a framed page's state in the
  page). Both scripts are served only while a site is allowed.
- **Team host** `<tool>-chest.<chest>.<base>` (`NewToolTeamHost`, a child
  portal): its own OIDC client, registered
  under the label `access.TeamLabel(tool)`, and its own sessions (cookie
  `__Host-chest; Path=/`, an in-memory store of its own): the session of another
  tool or of the portal means nothing there, two session cookies → 400. TLS, exact
  name (421), origin of any request except `GET` and `HEAD`: the portal's
  guards. The Chest keeps only `GET /callback` and `/_chest/` there: `/_chest/members/{member id}/photo?v=<rev>`
  (a member's photo, to a session that has the tool, and only of a member who
  has it too — 404 for any other, as for none —, `Cache-Control: private,
  max-age=300`, the revision in the address), the code step and its files,
  `/_chest/files/{token}` (a signed link to one of the tool's files, without a
  session: “Files” above);
  every other path belongs to the tool, in its simple form (400 otherwise):
  - **`/chest`, `/chest/*`** (first segment `chest`, in any case):
    `Allowance.Forward` — body and query of any size, no portal header
    added. Fetch metadata: a method other than
    `GET`/`HEAD` requires `Sec-Fetch-Site: same-origin` and the host's `Origin`
    (403 otherwise); `same-site` or `cross-site` is accepted only for navigation
    (`Sec-Fetch-Mode: navigate`). Without a session: a `GET` navigation (mode
    `navigate`, or no mode and accepting HTML) to a destination of
    2048 characters at most starts sign-in and comes back to it; any other
    request → 401 “Sign-in required”. Member removed, or without the tool
    (`Team.Access`, re-read at every request) → 403, the Chest's “Access removed”
    page (“Contact an admin to get access to this tool again.”, link to the portal, CSP `default-src 'none'; style-src
    'unsafe-inline'`): the tool is not called. Otherwise the session is
    saved and its lock released (`core.Settle`) before the relay — a
    slow tool does not hold the member's session —, then the request goes out
    with the `Chest-Member` assertion.
  - **`Chest-Member` assertion** (`toolfront.Assertion`, the member as
    `Team.Seen` gives it): compact JWS HS256, `typ: JWT`, HMAC-SHA256 key of
    “Chest-Member v2” under `CHEST_TOKEN` (specific to the instance; the
    label's version changes when a claim changes meaning or goes, so that a
    reader of another shape refuses it; a claim added keeps it),
    `iss` = origin of the team host (or of its custom address),
    `aud` = tool name, `iat`, `exp` = `iat` + 60 s; `sub` (the member
    identifier), `given_name`, `family_name`, `name` (first and last name,
    otherwise the local part of the address), `picture` (the path of the
    photo on the team host, `/_chest/members/{id}/photo?v=<rev>`, empty
    without a photo), `role` (`access.ToolRole`: the role of the assignment as
    long as the tool declares it, otherwise the first — owner, admins and
    builder without an assignment included; empty for a tool without roles),
    `admin`, `builder`, `groups` (the member's groups the tool sees: those
    that give it to them, all with `members.groups`), `language` (the one the Chest speaks to the member,
    `Portal.Language`: theirs, else the Chest's default — the tool's
    private part speaks it; the SDK's `member(request).language`),
    `time_zone` (the zone the member works in, `Policy.ZoneOf`; the SDK's
    `member(request).timeZone`, “A member's time zone” below),
    and `email` only for a version that holds `members.email`. Nothing the
    same for every member is asserted: the organization and the Chest's time
    zone are the Chest's, in the tool's environment (below). A
    `Chest-Member` coming from the client is removed beforehand. **Reading
    by the SDK**: `member(request)` (the SDK's `client/src/member.ts`,
    vendored copy `tests/sdk/chest-client`) takes a Node or Web request,
    reads exactly the `chest-member` header, derives the key from the text of
    `CHEST_TOKEN` as above, requires the JWS header
    `{"alg":"HS256","typ":"JWT"}`, compares the signature in constant time,
    `aud` equal to `CHEST_TOOL`, `iat`/`exp` within 5 s and the shape of the
    claims (`sub` an `mbr_` identifier, `groups` `grp_` identifiers,
    `language` a primary tag), and
    returns `{id, firstName, lastName, name, photo, role, isAdmin,
    isBuilder, groups, language, timeZone, email?}` — the `Member` the
    members API answers too — (`photo` and `role` `null` when empty) or
    `null` — never an error. Its test reads a vector signed by
    `toolfront.Assertion`: changing one means changing the other.
  - **Static files** of the build (`static`, `/_next/static/`
    by default), in `GET`/`HEAD`: relayed to everyone, with no session read, with no
    identity or cookie from the Chest.
  - **Everything else** → 302 to the public host, same path and same query.
  - Relayed responses: `frame-ancestors 'none'` (`packagefile.TeamCSP`)
    added only when the tool sends no policy; the tool's own
    policy is its own.
- **Public part closed at installation**: the manifest only says
  that the tool has one (permission `public`, “Its pages will be visible to
  the whole Internet” at approval). Opening or closing it is a decision of whoever runs
  the tool — owner, admin, the tool's builder —, kept in the
  policy (`public`, per Chest: `access.Team.SetPublic`,
  `Policy.PublicOpen`), which no version changes and which goes with the tool.
  Routes: `GET /api/tools/{app}/public` (`{declared, open, url}`) and
  `POST /api/tools/{app}/public` `{"open":bool}` for whoever runs the tool
  (403 otherwise, 404 for a removed tool, 409 without a public part). `GET
  /applications` gives `url` = the origin of the team host
  (the interface requires it to be `https`, with host `<tool>-chest.` + the portal name)
  and `public_url` = the public host + `/` as long as the part is open. The
  tile and “Open” open `url + "/chest"` in a new tab (`target="_blank"`,
  `rel="noopener noreferrer"`), the Chest kept beside it, as every link to a
  tool's team host, public host or custom domain does; the portal's own
  pages stay in place. The tool's page has the “Public” tab
  (`/tools/{name}/public`): the Open/Closed switch and the address;
  when declared and closed, the tab and the overview tell whoever runs
  the tool so in one line, “Public part closed: its pages are visible to no one.”, with “Open”. Installed from the catalogue,
  a tool that declares `public` can have it opened in the same decision:
  `POST /api/catalogue/install {…, open_public: true}` (checkbox “Open its public
  part”, unchecked by default; 400 for a tool without a public part,
  a replacement or an update) opens it in the name of whoever decided, once
  the tool is in service; a refusal leaves it closed, and the log says so.
- **What a tool is told of its Chest** (`chest/runtime/context.go`,
  `cmd/chest/node_chest.go`; the SDK's `chest`): the same for every member,
  so never in the `Chest-Member` assertion — the organization
  (`CHEST_ORGANIZATION`, `access.Policy.Organization`), the time zone
  (`CHEST_TIME_ZONE`, `Policy.Zone`: an IANA zone, `UTC` while none was
  chosen), the Chest's language (`CHEST_LANGUAGE`, its default language,
  English while none) and its currency (`CHEST_CURRENCY`,
  `Policy.CurrencyCode`: an ISO 4217 code of a currency in circulation,
  `access.ValidCurrency`, the euro while none was chosen — neither the
  language nor the zone says a company's currency; set by the owner or an
  admin in Settings → General, team operation `{operation: "currency",
  currency}`, a list of the codes with their names in the page's language,
  `Intl.DisplayNames`, the codes from the team view's `currencies`). And
  what is the tool's own, per tool (`runtime.Addresses`): its team host's
  origin (`CHEST_TEAM_URL`) and, for a tool with a public part, its public
  address (`CHEST_PUBLIC_URL`: the custom domain served for it, else its
  public host; `nodeApplicationHosts.addresses`), origins without a path,
  for the links it writes where no request tells its host (a mail, a
  scheduled job); a draft is told its draft host for both. `runtime.ChestOf` reads them from the policy at each
  start of an instance (`startOf`, with the variables and the memory) or of
  a workbench, `RunServer` and `RunWorkbench` refuse any value the Chest
  does not keep (`access.ValidOrganization`, `ValidTimeZone`, a language
  the product speaks, `ValidCurrency`, https origins), and they are container arguments (`--env=NAME=value`:
  nothing secret). The same zone is the `timezone` of the tool's database
  role (`Cluster.Ensure`, at the same start) and of the console's sessions.
  **The zone** is the company's reference — its day, its business rules,
  its database sessions: set by the owner or an admin, as the default
  language, team operation `{operation:
  "time-zone", time_zone}` (`access.ValidTimeZone`: `UTC` or an area and a
  location, e.g. `Europe/Paris`, `America/Argentina/Buenos_Aires`, known to
  the Go zone database embedded in both executables — `time/tzdata` —,
  never a legacy alias, an offset or anything to quote), read by every
  member in the team view (`time_zone`); at opening, the one the holder's
  browser was in (“The holder's choice”). Settings → General shows it, the
  time there now, and for the owner and the admins a field with the browser's zones
  (`Intl.supportedValuesOf`, each with its time now): a city typed
  (“paris”, “new york”) is the zone it names (`zoneOf`), anything else is
  not sent. **Told again**: once the team accepted an `organization`,
  `time-zone`, `default-language` or `currency` operation, the portal calls
  `Config.ChestChanged` → `nodeApplications.ChestChanged`, which returns at
  once; a worker of the node (changes in a row coalesced) redeploys every
  server tool awake as “Restart to apply” does (a tool asleep is not woken:
  it reads the Chest when it wakes), without downtime — each new
  instance told the Chest as it is then, its role's zone set again —, the
  tool's log saying “Started again: the Chest's settings changed”. A tool
  whose new instance does not answer keeps the one in service, told the
  former values, until its next start. A workbench is told at its next
  start. **Why the environment**, not a Chest API read: every tool has it,
  without `CHEST_API` (which only tools with a capability have), with no
  request, no cache and no failure path, in a scheduled job as on a
  request; and a pooled database session keeps the zone it opened with, so
  a change needs new instances anyway — the environment and the database
  change together, at one restart. A tool's addresses change when a custom
  domain of its public part starts or stops being served
  (`PrepareDomain`, `ForgetDomain`): `nodeApplications.AddressChanged`
  starts that tool again the same way, awake only (“Started again: its
  address changed”).
- **A member's time zone** (`access.Policy.ZoneOf`): each member works in
  their own zone — the one they chose in their profile
  (`Member.TimeZone`, empty for automatic), else the one their browser was
  last in (`Member.DetectedTimeZone`), else the Chest's. The session says
  the chosen one and what automatic means now (`time_zone`,
  `automatic_time_zone`); when the member chose none and the browser's zone
  (`Intl`) is another, the portal tells it once, silently
  (`POST /api/profile {operation: "detected-time-zone", time_zone}`,
  `Team.DetectTimeZone`, which writes nothing for the same zone). The
  profile's “Time zone” list offers “Automatic (<zone>, <time>)” then every
  zone of the browser (`{operation: "time-zone", time_zone}`, empty for
  automatic, `Team.SetTimeZone`). Tools are told it with each request of the
  member (`time_zone` claim) and in the members API (`time_zone`), so a
  tool shows times to each member in their zone and reminds them at their
  hour; the fake members of a draft are in the Chest's zone. The rule for
  tools (the SDK's README): store instants in UTC, decide the company's
  day in the Chest's zone, show times in the member's.
- **Variables** (`chest/toolenv`, `cmd/chest/node_variables.go`), as on
  Vercel: `NAME = value` pairs that whoever runs the tool sets in
  the “Variables” tab; the tool reads them through `process.env`. A
  **secret** value is never read back: neither returned to the browser nor logged
  — it is replaced or removed.
  - **Rules**: name `packagefile.EnvName` (grammar of an environment name,
    never `CHEST_*`, `PORT`, `NODE_*`, `NPM_*`, `HOME`, `PATH` nor the
    proxy variables, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`,
    `NO_PROXY`), and, for a tool whose version in service has a database, neither
    `DATABASE_URL` nor a name starting with `PG` (`toolenv.DatabaseName`:
    the Chest gives it those); value in
    UTF-8 without NUL, 8 KiB at most; 64 variables and 64 KiB (names and values)
    per tool. The names the manifest expects (`env`) tell what is missing;
    a variable that is not expected can be set.
  - **At rest**: one file per tool, `apps/<tool>/variables`, in its
    Compartment (0600, written aside then renamed, directory synced;
    removed when the last variable is): the header
    `chest-variables-1`, a random 12-byte nonce at each write and
    the JSON of the variables sealed with **AES-256-GCM** (Go library), the
    associated data naming the tool — one tool's file does not open
    as another's, a changed byte does not open. The key is
    the node's: `installation/variables.key`, 32 random bytes, 0600, created
    at the first variable set (written aside then renamed); file
    present without its key, link, shared file or directory: unreadable, without
    saying anything about the content, and no variable is then rewritten under a new
    key.
  - **Lifecycle**: the file follows the Compartment — kept when one
    version replaces another (update, rollback, source replaced: same name,
    same data), removed with the tool (`apps/<tool>/` in its entirety). The key
    stays: it seals nothing else.
  - **At startup**: each instance reads the variables as they are
    when it starts; a change therefore applies at the next start.
    If they are unreadable, the instance does not start (supervision retries; the one in
    service continues).
  - **Routes**, for whoever runs the tool (owner, admin, builder of
    this tool: `serverRunner`, 403 otherwise; 404 for a removed tool or an absent
    tool): `GET /api/tools/{app}/variables` →
    `{"variables":[{"name","secret","value"?}],"expected":[…]}` (`value`
    omitted for a secret, `Cache-Control: no-store`); `POST
    /tools/{app}/variables` `{"operation":"set","name","value","secret"}` or
    `{"operation":"remove","name"}` (strict JSON, 49 KiB at most: 413
    beyond) → 204, 400 invalid or reserved name, 413 beyond the limits, 404
    unknown variable; `POST /api/tools/{app}/redeploy` `{}` → 204: the version in
    service restarts next to the instance that is serving, with the current
    variables, through the zero-downtime switchover (`Replace` of the same version, under
    the installation lock — 409 during a version change); an
    instance that does not answer is stopped and the one in service keeps the
    traffic (503). No value is logged; a node error does not
    carry one.
  - **Page**: the “Variables” section (`/tools/{name}/variables`) of a
    server tool: first the expected names, each defined or “Missing”
    with “Enter” (the tool's header also says “Variable … missing”),
    then the others (dots for a secret, “Replace” and “Remove”); the
    Name / Value / Secret form (checked by default); “Paste a .env”,
    read in the page (`envfile.ts`: `NAME=value`, `export`, quotes,
    comments; 64 variables, 8 KiB per value), which shows the names taken
    and ignored — never a value — then sets each variable, secret by
    default; after a change, “Changed: they apply at the
    next start.” with “Restart to apply”.
  - **`podman inspect`** does not show the variables: they are neither in
    the container configuration nor in Podman's database. The file
    `s/env` exists in plain text, 0600, in the instance's private directory
    (under the node's temporary directory) between the launcher's write and
    read — the moment it starts. The tool's server has its
    variables in its environment, by construction.
- **Custom domains** (`chest/tooldomain`, `cmd/chest/node_domains.go`,
  `chest/portal/tool_domains.go`), Vercel-style: a tool's public part
  (part `public`) also served under a name its owner holds, the
  tool's hosts continuing to serve. The members' address remains
  the Chest's team host: there is no domain for it (`part:
  "team"` → 400 `invalid`). **A decision for whoever administers the Chest**
  (owner, admin); a builder is refused like a member (403) and does not
  see the section.
  - **Name** (`tooldomain.Rules.Check`): as typed, lowercased
    with no trailing dot, then the `pattern.Hostname` grammar (lowercase
    ASCII, at least two labels, 253 characters, last label
    starting with a letter, neither `*` nor an address); a non-ASCII character
    is refused separately (`punycode`: “Enter the punycode form
    (xn--…)”); refused (`reserved`): the portal host, the tools
    domain, the provider, the Chests' base domain (the portal's
    parent) and any name under them, and the suffixes `localhost`, `local`,
    `internal`, `invalid`, `onion`, `arpa`, `example`, `home`, `lan`,
    `corp`; `test` only in the lab. A name once per Chest;
    one domain per tool; sixteen per Chest.
  - **Registry** `tool-domains/registry.json` (in the domains
    directory, next to the node; 0600, replaced in one piece, re-read and rechecked at
    every read): `{version: 1, domains: [{name, tool, part, token,
    state, added, added_by, checked, verified, reason, detail, misses,
    first_miss}]}`; `token`, 32 random bytes in base64url, taken when
    added; the TXT `_chest.<name>` must be
    `chest-verification=<token>`, the CNAME must lead to the tool's host for
    that part. `challenges/<name>` carries the token as long as the domain
    exists; `admitted/<name>` exists only for a verified or active name.
  - **States**: `pending` (added, waiting for its records) →
    `verifying` (verified, admitted: the front routes it, the certificate
    keeper obtains its certificate) → `active` (its certificate there: served);
    `failed` (lost); `removing` (being removed, finished at the node's next
    startup).
  - **Verification** (“Verify”, in the background, once every ten
    seconds at most, 429 otherwise): the TXT, asked of the servers of the name's
    zone (labels walked up until its name servers are found,
    queried directly; the system resolver afterwards), 5 s; then
    reachability: `GET http://<name>/.well-known/chest-domain`, the name
    resolved once, each address judged (`egress.Forbidden`, except the
    node's own addresses), only those dialed, no
    redirect followed, 5 s, 256 bytes read, the response compared with the token
    — only equality is reported. Reasons: `txt_missing`, `unreachable` (the
    name leads to no admitted address), `proxied` (it leads to another
    server: a proxy, like Cloudflare's orange cloud — the
    records must stay **DNS only**, a documented limitation).
    When both pass: the name is admitted (`verifying`); once its certificate is
    obtained (`tooldomain.Set.Covers`), the node serves it (`PrepareDomain`) and
    marks it `active`; a refusal by the authority is displayed (“Certificate
    refused: …”, the keeper's `.error` file).
  - **Serving**: `portal.ToolPublicDomainHandler`, one more host of the
    tool (`publicDomainHost`, never the name of another host: no
    shared cookie), like the public host — 421 for another name, `/chest`
    sent back to the team host, the same policies (the Chest's floor
    alongside the tool's own for a version approved with `csp`, otherwise
    `packagefile.DefaultCSP`), through the same `servePublic`. The tool's
    address becomes this name: `public_url` of `GET /api/tools`, the URL
    of `GET /api/tools/{app}/public`, and the team host's redirect to the
    public part. File links stay on the team host.
  - **Continuous check**: an active domain is rechecked every six
    hours; three failures in a row over at least four intervals (24 h)
    lose it (`failed`, reason `lost` and what was missing): no longer served,
    no longer admitted, its certificate removed. “Verify” recovers it.
  - **Routes** (`Cache-Control: no-store`): `GET /api/tools/{app}/domains` →
    `{public?: {name, state, checking?, reason?, detail?, checked?,
    records: [{type: "CNAME", name, value}, {type: "TXT", name, value}]}}`;
    `POST /api/tools/{app}/domains` `{operation: "add", part, name}` → 204,
    `{operation: "verify", part}` → 202, `{operation: "remove", part}` →
    204; errors `{"error": code}`: 400 `invalid`, `punycode`,
    `reserved`; 409 `taken`, `occupied`, `too_many`, `no_public_part`;
    404 `not_found` (also for a removed or absent tool); 429
    `too_soon`.
  - **Removal**: `removing`, the name is no longer served, admitted or certified,
    then its token goes, and the registry forgets it; an interrupted removal is finished
    by the monitoring or at the next startup. Removing the tool
    (`POST /api/installation/uninstall`) removes its domains first.
  - **Page**: the tool's “Public” tab has the “Custom
    domain” section (public part, if the tool declares one): the name and “Add”, then the two
    records (a copy button each), “Verify”, “Remove”, and the state in
    words (“Waiting for DNS records”, “Issuing certificate”, “TXT
    record not found: publish the _chest record.”, “Active”, “Lost: the TXT record is gone”).
  - **Lab only**: `node.json` (`portal.tool_domains_lab`,
    `{name_server, http_port, recheck_seconds}`) makes all names be asked
    of a lab name server, reachability be checked on another
    port, rechecks happen in seconds and `.test` be admitted; refused by a
    server that has a dependency binding.
  - **Backups**: `tool-domains/` is in the node directory, therefore
    in the nightly archive; not in the structured archives. Restored
    at another address, an active domain fails its rechecks as long
    as its CNAME does not lead to the new server ([backup.md](../deploy/backup.md)).
- **Preparation** (`cmd/chest`, `Prepare`): for a server, the two names
  checked against the portal's certificate (the Chest's wildcard names
  them: nothing is requested), the team host's client, then the two
  hosts.
### Perseus Code: projects, workbenches, drafts

Lot PB1 of [Perseus Code](../../../01_produit/02_specs/perseus-build.md):
what the Perseus service (PB2) works on, built before the chat. A
**project** is a tool being built inside the Chest; its **workbench** is the
sandbox where its commands and its dev server run; its **draft** is its live
preview. The node owns all of it: Perseus never runs Podman, never holds a
key, and asks the node for everything through the node's internal socket.

- **Projects** (`chest/buildproject`, `installation/build/`, 0700):
  `projects.json` — per project `id` (`prj_` and 26 base32, `pattern.ProjectID`),
  `name` (48 characters, `packagefile.ValidText`: the builder's first words,
  then the `title` of its `chest.json` as soon as a turn writes or moves it
  there and again at each turn's end, until a builder names it, `named`),
  `creator`, `builders` (member identifiers:
  who may open it besides the owner and the admins), `created`; 20 projects
  on a Starter server, 50 from Team. One directory per project: `workspace/`
  (its files, `/workspace` in its workbench), `cache/node_modules` and
  `cache/npm` (its dependencies and npm's cache, mounted beside the
  workspace), `repo.git` (its checkpoints), `egress.jsonl` (what its
  workbench reached), `preview.jsonl` (its preview log).
  - **Files**: what runs in the workbench writes the workspace, so the node
    reads and writes it only through an `os.Root` of it — never a link out
    of it — and opens only regular files (`O_NONBLOCK`, then checked by
    `fstat` against the entry: a FIFO or a device never blocks the node).
    A path is relative, slash-separated, 16 deep and 512 bytes at most,
    segments of `[A-Za-z0-9._@+-]` without `.`/`..`, never under
    `node_modules`, never `.git`, never an environment file (`.env`,
    `.env.*`: variables are the Chest's). A file is 1 MiB at most, written
    aside then renamed; a listing gives 5,000 entries at most.
  - **Disk**: the workspace without dependencies 1 GiB, the cache 2 GiB —
    measured after each command and write, never enforced by the kernel
    (rootless has no quota): beyond, writes and commands are refused
    (`over_disk`) until files are deleted or the cache cleared.
  - **`chest check`** (`check`): the workspace packed as `git archive` would
    for the build (`buildproject.Pack`: directories and regular files,
    `node_modules` and links left out, the archive's bounds) and read by the
    Chest's own validator (`sourcearchive.Validate`, migrations included):
    `{ok, reason, detail, name, permissions, roles}`, the reason the
    archive's word (`no_manifest`, `manifest`, `migrations`,
    `newer_chest`…). `chest check` (`@argentic/chest-check`) runs the same code, built for
    WebAssembly (`cmd/chest-check`).
- **Checkpoints** (`chest/buildhistory`, `repo.git`): a bare Git repository
  in Git's own format, written by the node alone — loose zlib objects named
  by their SHA-1, one branch `main`, one commit per checkpoint (message
  1,000 characters, author a member's identifier or `perseus`, no address),
  the workspace's regular files and directories without `node_modules` nor
  links, executable or not. Outside the workspace, never mounted: code in
  the workbench cannot rewrite history. An object is read back only under
  its own name. **Restore** makes the workspace the checkpoint's tree
  (what it did not hold removed, `node_modules` untouched) and records that
  as a new checkpoint (“Restore <id>: …”): history only grows. It is not
  a Git service: nothing is served, pushed or pulled; PB4 exports it.
- **Workbench** (`chest/runtime/workbench.go`, `RunWorkbench`): one
  container per active project, of the tools' pinned Node image
  (`runtime/base-image`, no image of its own), under the server tools'
  profile and tighter: `--network=none`, read-only root, `/tmp` a 256 MiB
  `noexec` tmpfs, `--init` (an init that reaps), `--userns=keep-id` and the
  node's user, every capability dropped, `no-new-privileges`, Podman's
  seccomp, 1 GiB on a Starter server and 2 GiB from Team without swap, one
  CPU at a low weight (`--cpu-shares=128`), 512 processes, 4096
  descriptors, no Podman log. Its writable mounts are its instance's
  directory at `/run/chest` (the sockets, as a tool's), the workspace at
  `/workspace`, the cache at `/workspace/node_modules` and `/npm`
  (`NPM_CONFIG_CACHE`); the Chest's launcher and runner are mounted
  read-only at `/chest`. Environment: `CHEST_TOKEN` (the key its draft's
  assertions are signed with, random per run, named only in the arguments),
  `CHEST_TOOL` (the draft host's label), `CHEST_API` (the draft's own API of
  the Chest, below), `PORT=3000`, `HOME=/tmp`, `NODE_ENV=development`,
  npm's quiet settings, and what a tool is told of its Chest
  (`CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, read at the
  workbench's start) — no key, no token, no variable of the Chest.
  **Entry**: the tools' own launcher (`/chest/launcher.mjs`, the same file,
  `sourcebuild.Launcher`) starts the **runner** (`chest/runtime/workbench.mjs`)
  as it starts a tool's server, so that the runner and everything it runs
  inherit what the launcher gives a tool: `HTTP(S)_PROXY` to the Chest's
  proxy (`CHEST_EGRESS=1`), `DATABASE_URL` and `PG*` to the preview
  database (`CHEST_DATABASE=1`, credentials laid in `s/database` and
  removed by the launcher; a role `pb_…` is one it accepts), and
  `http.sock` relayed to `PORT`, where the dev server listens.
  - **The runner** listens on `/run/chest/workbench.sock` (0600), which
    the node dials (`chest/toolsocket`, never through a link) — never the
    reverse: `GET /` (`{dev}`), `POST /run {argv, timeout, limit}` (one
    command in `/workspace`, an argument vector — never a shell line —, in a
    process group of its own killed with everything it started when it
    ends or at its time limit; its output, standard output and error in
    order, kept to `limit` bytes: the first half and the last, `omitted`
    counting the bytes between; 127 for a program that is not there; four
    at once), `POST /dev/start {argv}` (the dev server, the only process
    that lasts, its output the container's: the preview log), `POST
    /dev/stop` (SIGTERM to its group, SIGKILL 5 s later). Commands go
    through the runner rather than `podman exec`: killing a `podman exec`
    client leaves its process running, while the runner bounds a process
    tree. What escapes its group (`setsid`) lives until the workbench
    stops — the command policy forbids starting it, the sandbox bounds it.
  - **Network**: reads of `registry.npmjs.org` only, through the Chest's
    proxy (`egress.NewRegistryProxy`, as a build: `GET` and `HEAD` asked in
    plain HTTP at `NPM_CONFIG_REGISTRY=http://registry.npmjs.org/`, sent on
    in HTTPS under the registry's verified certificate, the node's guard:
    never an address of the node, of the Chest or of a private or metadata
    network), each request in the project's `egress.jsonl`. No TLS tunnel
    (a tunnel to port 80 is read as plain HTTP, request by request): a
    publish, a login or an unpublish is refused (`Chest-Egress: refused;
    reason=method`), as is a client that asks the registry in HTTPS
    itself. The AI gateway, the node's services and other workbenches
    are not reachable: the container has no network. A node that does not
    know the Chest's names yet serves no carrier: npm reaches nothing.
  - **Preview database**: a role and a database `pb_<id>` (the project's
    identifier without its prefix, `tooldatabase.DraftOf`) in the tools'
    cluster, made like a tool's (`Cluster.EnsureDraft`: same attributes and
    bounds, `sameuser` in `pg_hba`, its password derived under its own
    label), reached through the same carriers (`Cluster.Relay`). At each
    start of the dev server the workspace's migrations are played as the
    role, strictly (`MigrateDraft`); a migration already played that changed
    or went starts the database again from empty; `seed.sql` (optional,
    1 MiB, one transaction, `SeedDraft`) is played on a database made
    empty. Restoring a checkpoint drops it; removing the project drops it.
    No console, no reader (PB3's Data tab).
  - **Lifecycle** (`cmd/chest/node_workbench.go`): started at the first
    command or dev server of a project (the runner answering within a
    minute), stopped after **15 minutes** without a request of its project
    (an operation of the socket, a request of its draft) and no command in
    flight, recreated at the next. Active at once: Starter 1, Team 2,
    Business 4, Scale 8 — the plan read from the server's memory
    (`planOf`: below 6 GiB Starter, 10 GiB Team, 18 GiB Business); a new one
    stops the least recently used idle one, none idle is `busy`. **Capacity**:
    its memory is reserved beside the tools awake
    (`nodeApplications.reserved`, `makeRoom`): idle tools are put to sleep
    for it, least recently used first; a workbench that still does not fit
    the node's budget is refused (`capacity`). What a killed node left is removed at the next start
    (`RecoverServers` on the workbenches' scope, the fingerprint of
    `installation/build`). Workbenches stop before the tools database, with
    the tools (`nodeApplications.Close`).
  - **Commands** (`command`): refused before anything runs when forbidden
    (`chest/buildpolicy`, whoever asks — the node's copy of the policy's
    forbidden list: the network tools, another user, containers, a shell,
    background starters, `npm publish`/`login`/global installs, `git
    push`/`remote`, any word naming `/run/chest`; a program named by itself,
    64 words, 16 KiB), 5 minutes by default, 10 for an installation
    (`npm ci`, `npm install`), 64 KiB of output.
  - **Dev server**: the package's `dev` script (`npm run dev`), `no_dev_script`
    without one; the roles of the draft read from its `chest.json`; the
    draft answers behind the front once the dev server first answers
    (3 minutes at most, “Dev server answering” in the log), `failed`
    otherwise. **Preview log** (`toollog`, `preview.jsonl`): what the
    workbench and its dev server print, and the Chest's lines
    (“Workbench started”, “Dev server starting”, “Dev server answering”,
    “Workbench stopped”).
- **Draft host** (`chest/draftfront`, `cmd/chest` `prepareDraft`):
  `prj-<the project's 26 base32>--build-chest.<tools domain>`
  (`buildproject.DraftLabel`): its project's identifier, fixed at its
  creation, never its name — the builder never reads it but in Open in a
  new tab; no tool's name has `--`, so no tool's host is ever a draft's —, named by the portal's certificate (the
  Chest's wildcard) before it is served. Never on the Internet: a member enters with a **ticket** the
  portal hands them (`POST /api/build/projects/{project}/preview` → `{url}`,
  for a member who may open the project: its builders, the owner, the
  admins; 403 otherwise), 32 random bytes, single use, one minute, 1,000
  waiting at most; it becomes a session of the draft host only
  (`__Host-chest-draft`, HMAC under a key of the node's run — a restart
  ends every session —, 12 hours), never given to the draft
  (`toolfront.DraftCookie`, dropped both ways). A page
  navigated to without that session, or with a spent ticket (a preview
  opened in its own tab, bookmarked, reloaded past its session or after a
  restart of the node), goes back (303) to its project in the portal,
  `/build/{project}`, which signs in if need be and frames it again with a
  new ticket — a fixed address of the portal, never one the request names;
  the portal's frame and the draft's own requests are told to open the
  preview from the Chest (403). Every request reads the
  policy again (access taken back is access gone), requires the host's
  name and its one plain form, refuses another site's writes; the draft
  is forwarded by the tools' front (`toolfront.Target`) **routed as its
  tool's hosts will route it once published** — one rule,
  `toolfront.PartOf`, for the team host (`teamServe`) and the draft's:
  `/chest…` the members' part, a GET under a `build.static` prefix the
  static files as they are, without a member, anything else the public
  part when `chest.json` declares one, not found otherwise (found on
  test9, 2 October: a draft that loaded `/assets/` worked in its preview,
  published without its styles and script) —; the members' part
  (`frame-ancestors 'none'` when it sends no policy) is asserted **fake
  members** with `env: "draft"`: three, fixed identifiers — an owner
  (admin), a manager, a plain member —, **View as** picking one and a role
  the draft declares (`POST /_chest/view-as`, a form from the host's own
  pages). Every HTML page carries the **banner** (“Perseus Code · draft ·
  not in service”, `common/i18n` `Draft`) and the View as form, written by
  the front right after the opening `<body>` within the first 64 KiB
  (`Visit.Banner`; the draft is asked uncompressed; written in ASCII, every other character a numeric reference, so that it reads right in a page of any encoding), styled by
  `/_chest/draft.css` — no script. A draft whose dev server does not run
  says so (503). The draft's files' links (`/_chest/files/…`) and its
  members' uploads (`/_chest/files/upload/…`, from the host's own pages)
  are served there under the draft host's session only — unlike a team
  host, a link alone opens nothing (`toolfiles.ServeLink`,
  `Tool.Receive`, shared with the team host). Not yet (PB3): hot reload
  (the front refuses protocol upgrades: no WebSocket).
- **The Chest's API of a draft** (`chest/draftapi`, `cmd/chest`
  `serveAPI`): the workbench's launcher opens `CHEST_API` as a tool's does
  (`api.sock`, `toolfiles.Serve`), with the routes a tool in service
  reaches, so that the SDK works in the preview as once published. The
  rule: **a preview acts as its project's builders only, never reads what
  they could not, never reaches a member of the Chest.** Members are the
  draft's three fake members (`draftfront.Team`: the declared roles, the
  owner the first, the manager the second, the member the last; addresses
  at `draft.invalid`), and, for a draft that declares `members.groups`
  (read at its dev server's start, as its roles), one group that gives it
  nothing, “Office”, of the manager and the member — in `GET /groups`,
  their `groups` and their assertion; notifications, broadcasts and badges
  go to the draft's own inbox (`<project>/inbox`), delivered to no one, each
  notification and broadcast said in the preview's log; files are the draft's own (`<project>/files`,
  bounded by the declared quota and `buildproject.MaxWorkspace`), removed
  with the project; sealed values are sealed and opened under the draft's
  own key (`<project>/sealed-values.key`, never the Chest key nor a tool's:
  a draft never opens a tool's values), for its fake members, whose
  requests carry their tickets; AI is the Chest's gateway counted as Perseus Code's —
  the project's, for its creator, in the journal —, within the Chest's
  monthly budget and Perseus Code's rate (`Gateway.DraftAPI`). Each
  capability is granted by what the draft's `chest.json` declares at the
  call (read as a package, `sourcefile.Source.Package`; 403 `capability_not_granted`
  otherwise), so a missing declaration fails before publishing; the
  members' lifecycle (`/erasures`) is not served. An event the draft emits
  (`POST /events`) is checked as a tool's (`toolevents.Check`: its type,
  data among its fake members, audience, subject, time), told to no tool,
  and said in the preview's log with the installed tools it would reach
  once published (`Engine.Receiving`); 202 `{id, receivers: 0}`.
- **Internal socket** (`cmd/chest/node_build_api.go`):
  `<server>/run/perseus/node.sock`, Perseus's one way to the node; its
  routes, the handshake and the turn grants are PB2's (below).
- **Where it runs**: a node that builds tools (the bundle's runtime beside
  its installation) and runs rootless Podman; elsewhere Perseus Code is
  absent (said once in the node's log) and the preview route answers 404.
- **Proof**: Go tests (the runner run by the local Node in place of the
  container, the draft host, the socket), and the VM proof
  (`probe-workbench-macos.sh`, [testing](testing.md)).

### Perseus Code: the Perseus service and the chat

Lot PB2 of [Perseus Code](../../../01_produit/02_specs/perseus-build.md):
**Perseus**, the build agent, and the conversation a builder has with it on
a project's page. Perseus runs as **its own confined service**
(`chest perseus`, the systemd user unit `perseus.service`), holds no
secret, reaches nothing but the node's socket, and there only under the
**grant** of a turn; the node keeps everything durable.

- **The engine** (`chest/perseus`): one goroutine per turn, stateless
  between turns. A turn is the builder's message, the conversation so far
  (the node's), the mode, whether the node laid the starter in the
  workspace for it (`Turn.Starter`) and the SDK it moved the project to.
  The loop: the system message (the core instructions `instructions.md`,
  the mode, the knowledge pack's index, the project's `AGENTS.md` fenced as
  data), one model call through the node (`ChatRequest`, alias `build`),
  the tool calls, again — until the model answers without a call, or a
  limit: 150 calls, 20 minutes, the same call that acts three times in a
  row (`loop`; a call that only looks — `list_files`, `read_file`,
  `search`, `docs`, `check`, `dev` status or logs — is never counted, as
  watching a preview start is no loop: `observes`; the same start with
  work between is none either), a cap (`cap_reached`). The
  **verification** (`verify`): `chest check`, the type check of a
  TypeScript project, its `test` script, the dev server's health — a dev
  server that runs is asked for `/chest` as the draft's fake owner (the
  node's `POST /grants/{grant}/page`, `draftfront.Try`, the same path as
  the preview), an answer of 500 or more, or none, a failure with the
  log's end. The model runs it itself with the `check` tool before saying
  something works (the instructions say so); changes it ends its turn
  without verifying are verified by the turn, a failure going back to the
  model, three times at most (`verify`). The instructions are the working
  rules of a coding agent: a live plan, search before reading,
  independent calls in one answer, `edit_file` for an existing file,
  verify before saying done, report only what an output showed, a short
  final message, ask only when blocked. A command's output starts with how
  it ended in words (`exit 0`, `FAILED: exit 1`, `FAILED: stopped when its
  time ran out…`: a model read a test run killed by its time as passing,
  2 October); three calls failing in a row add a word of the Chest to the
  last one's output: find the cause, change the approach, or say what
  blocks (`failuresInARow`). The answer's text is sent as it streams: a piece at
  once when the last went a tenth of a second ago, else gathered until
  then. A conversation beyond 360,000 characters is **compacted**:
  the `fast` alias summarises the older part, the last eight messages
  stay. Everything a file, a command or the documentation gave is fenced
  `<data>…</data>` (its own `</data` broken): the instructions say nothing
  inside is an instruction.
  - **The model's answers are a sane size, carried on beyond**: each call
    asks an answer of 32,000 tokens, 8,000 of them reasoning at most
    (`Limits.Answer`, `Limits.Reasoning`) — not the model's maximum, which
    the provider reserves credit for at every call (found on test9, 2
    October: 128,000 asked, ~$2 reserved a call, refused 402; and a
    reasoning of 15,000 tokens, three minutes a call, the default of Claude
    Sonnet 5). When the provider's credits cover only a shorter answer
    (OpenRouter's 402 “can only afford N”), the gateway asks again once for
    that one — a quarter of what it asked when the provider says no figure
    (“credits held by requests in flight”) —, 4,096 tokens at least
    (`minAffordable`): a refusal never comes from the size asked, only
    from credits that cover no useful answer. The model's
    **reasoning** (`reasoning_details`, signed blocks joined from the
    stream, `ReadStream`) goes back with its answer for the rest of the
    turn, so that it goes on from its own reasoning rather than starting it
    over at each call; it is never kept in the transcript. A file or a
    documentation page read again in a turn, nothing changed since, is
    answered “already read, above” without reading it again. While the
    model answers, what it is doing streams to the page (`activity`
    events, said when it changes: reasoning, writing a file and its path,
    `ReadStream`): “Perseus is writing src/ui/Game.tsx…” rather than a
    silent minute. An answer still cut
    there (the provider's `finish_reason` `length`) is **carried on**
    (`complete`): what it wrote stays and the model is asked, without
    tools, for the rest — of its text, streamed as the rest of the answer,
    or of the JSON arguments of the call it was writing, from the character
    after the last —, joined until the answer ends; the call then runs
    whole and the conversation keeps the whole answer. A continuation that
    brings nothing ends the turn `failed`; the turn's time bounds the rest.
  - **Tools** (a window of 200 numbered lines, outputs bounded to 8 KB, an
    explicit empty result; the paths the model gives read from the
    project's root however it names it — `.`, `/`, `./src`,
    `/workspace/src` —, and what the node refuses said in words the model
    can act on — a path of the project, a missing file, a missing `dev`
    script, a busy workbench, the disk bounds —, never a bare code):
    `list_files`, `read_file`, `search`, `docs`, `plan` (a checklist sent
    whole, its item under way `active` — one at most — and those `done`),
    `ask` — Plan mode offers only these —, `write_file`, `edit_file` (one
    exact occurrence; a write's result event carries its lines, `Diff`:
    those between the first and the last changed, two kept around them,
    16 removed and 40 added at most, the rest counted — `changeOf`),
    `delete_file`, `move_file`, `check` (the verification, shown as its
    `check` event, never as a step), `run`
    (an argument vector, never a shell line), `dev` (start, stop, status,
    logs, clear-cache; `start` waits until the dev server answers or
    fails, a minute at most — `Limits.DevStart` —, and says which, a
    preview that never answers with its log's end; `logs` reads the
    current run only, from the node's `perseus.DevStarting` line on — an
    earlier run's crash, read as today's, sent Paul's run on test9 into
    restarts), `chest_events` (`list`: each type the installed tools
    emit — the tool, its sentence, its fields and their kinds — and which
    tools receive it, so that Perseus wires a tool to the others from
    what exists; `send` — Build mode only — posts the running preview a
    sample of a type an installed tool emits, signed as the Chest signs a
    delivery, built from that tool's declared fields with fake ids and the
    draft's fake members (`toolevents.Sample`), refused when the draft does
    not receive that type, the answer and a line in the preview's log). Not
    given: the web, Git, publishing, anything of a tool in service; `db`, `open_page`, `add_package`'s card and `remember`
    come with PB3–PB5.
  - **The command policy** (`chest/buildpolicy`, one package for Perseus
    and the node): `Check` refuses what could leave the workbench's
    sandbox — network tools, shells, containers, other users, background
    starters, `npm publish`/`login`, global installs, `git push`/`remote`,
    `/run/chest` —; everything else runs without asking, `npm install` from
    the registry included: the workbench is the sandbox, as a coding agent's
    is. The only **interaction** is a question (`ask`, 1–3 of them).
  - **The starter** (`chest/perseus/starter`, embedded beside the pack,
    `perseus.Starter`): TypeScript, a Hono server, React rendered on the
    server and hydrated only in islands, Vite, the SDK as its packed
    tarball (`vendor/`), `/chest` greeting the member, a strict CSP with a
    nonce, `build.static` `["/assets/"]` (its browser's files, served by
    its hosts once published), `dev`/`build`/`start`/`test` scripts (`test`
    ended once its tests ran, `--test-force-exit`: a route that opened the
    preview's database pool held the real replay's `npm test` five
    minutes), a test on the SDK's
    `fakeChest`, `AGENTS.md` — with “Using the Chest”, the exact code of
    the database (`db.ts`, a migration, `seed.sql`), the members,
    notifications, files and AI, the one place the model starts from —,
    `chest.json` on contract 0.4. Before a turn
    that builds, the node lays it in a workspace with neither
    `package.json` nor `chest.json` (`buildproject.Start`, the manifest's
    name and title from the project's), then moves it to its SDK; the
    turn's first step installs it (`npm ci`) and the instructions tell the
    model to extend it.
  - **The knowledge pack** (`chest/perseus/knowledge`, embedded in the
    binary of the release): the SDK's guide and reference — its `AGENTS.md`
    and `README.md`, one page per section, taken from the SDK's clone at
    the commit of its vendored copy —, the starter (`starter.md`: its
    `AGENTS.md` and main files, from `chest/perseus/starter`); Forms as an example (its manifest, package, migration and main
    files, from its clone's head); `chest-json.md`, written by hand.
    `scripts/perseus-knowledge.mjs` (`npm run build:knowledge`) writes the
    pages and `pack.json` (their order, the sources' commits, the version:
    a digest of the pages, checked when the binary reads the pack). Each
    turn records the pack's version in its transcript.
- **The service** (`cmd/chest/perseus.go`, `chest/perseus/client.go`):
  `chest perseus -directory <server>` checks its confinement first
  (`Confined`: no capability, no new privileges, a seccomp filter, a user
  and a network namespace of its own, no family but `AF_UNIX`, none of the
  server's files but the socket's directory) and exits 78 otherwise. It
  opens the node's turn stream (`GET /perseus/turns`, its build — the
  digest of its executable — in `Perseus-Build`; another build is refused
  409 `build_mismatch`), again with a rising delay when it ends, and runs
  each turn pushed. Stopped (a Chest update), it stops its turns at their
  next step — each says `interrupted`, cause `update` — before it lets the
  stream go. Its log: turns' identifiers, mode, end, duration, a failed turn's
  cause (the node's or the gateway's refusal); never content. The unit and its hardening: [node service operations](node-service-operations.md).
- **The node's side** (`cmd/chest/node_perseus.go`, `node_build_api.go`):
  one Perseus at a time holds the stream. A builder's message makes a
  **grant** — 32 random bytes, the project, the session, the member, the
  mode, 25 minutes — pushed with the turn; **one turn at a time per
  project**. Every request of the turn names its grant
  (`/grants/{grant}/…`): `files`, `file` (read, write, delete), `move`,
  `search`, `run`, `check`, `dev`, `logs`, `ask`, `chat`, `events`,
  `tool-events` (GET the map, POST a sample to the preview:
  `not_emitted`, `not_received`, `not_running` 409). The
  node checks again, whatever Perseus says: the grant alive and its member
  still opening the project (a builder who lost the status ends the turn
  at its next request), the mode (Plan changes nothing: 403 `plan_mode`),
  the forbidden commands, the interaction offered (questions only, 1–3),
  the file scope (`buildproject`), the events (only
  Perseus's kinds; what the node writes — ids, authors, costs,
  checkpoints, answers — never taken from it). A turn **ends** once: when
  Perseus says so (`stop`), Stop, its time, its member's status, Perseus
  gone (`interrupted`, cause `restart`), a node that stopped (found open at
  the next start), a failure (`failed`, its cause as the AI gateway said
  it — `credits`, `key`, `rate`, `refused`, `provider`, `no_connector`
  (`perseus.FailureCauses`) — and the provider it named as its scope,
  checked by the node; the page says each in words). Its grant is revoked, Perseus told, then the node
  records its **checkpoint** when the workspace changed
  (`buildhistory.Changes`, author `perseus`, the message's first line),
  its **cost** (the gateway's settlements of its calls) and its **end**.
- **Sessions** (`chest/buildsession`, `<project>/sessions/`, 0700):
  `index.json` — per session its title (the first message's first line),
  when it began and changed, its cost (micro-euros), its mode — and `<session>.jsonl`, the transcript: events
  numbered from 1 (`turn`, `text`, `message`, `tool`, `result`, `plan`,
  `check`, `compaction`, `interaction`, `answer`, `checkpoint`, `cost`,
  `end`), 2 MiB an event, 64 MiB a transcript, 200 sessions a project. The
  next turn's context is made from it: the last compaction's summary, then
  each turn's message and Perseus's `message` events, a call left without
  its result dropped.
- **The pages** (`chest/portal/perseus.go`; builders, the owner, the
  admins — 403 `denied` otherwise; a project for its builders who hold the
  status, the owner, the admins): `GET /build/new` (the document, the
  page to start a project), `GET /build/{project}` (the document,
  its CSP adding the project's draft host to `frame-src`, and nothing
  else),
  `GET|POST /api/build/projects` (`{available, ai, projects}`; `{name,
  message?, mode?}` → the project and its first session, the message its
  first turn), `GET /api/build/projects/{project}` (its state — building,
  waiting, idle —, sessions, preview), `POST …/delete` (its creator,
  the owner, an admin), `POST …/name {name}` (renamed; its draft host does
  not change), `POST …/sessions {message?, mode?}`, `POST
  …/sessions/{session}/messages {text, mode, images?}` (202; the
  pictures by the names `POST …/attachments` gave — at most four, the
  project's own, refused `no_vision` 409 when the model of the alias
  `build` reads none), `POST …/attachments` (a PNG, JPEG or WebP picture
  as the body, 3 MiB at most, checked from its bytes, kept in the
  project's `attachments/` beside the workspace — never checkpointed nor
  published —, 64 MiB a project) → `{name}`, `GET …/attachments/{name}`
  (served with its own type, `nosniff`, sandboxed), `GET
  …/sessions/{session}/events` (Server-Sent Events from `Last-Event-ID`,
  the model's own messages emptied — where each model call ended —; the session's lock released while it
  streams, `core.Allowance.Stream`), `POST …/interactions/{interaction}
  {choice | answers}`, `POST …/stop`, `GET …/checkpoints`, `POST
  …/checkpoints/{checkpoint}/restore` (never while a turn runs), `GET
  …/checkpoints/{checkpoint}/files` (`{parent, files}`: each file with
  what the checkpoint changed — `added`, `changed`, `removed` —, read from
  its history, `buildhistory.Files`), `GET
  …/checkpoints/{checkpoint}/file?path=` (`{path, text}`, or `binary`, or
  `large` beyond 256 KiB — known from the object's header, never read
  whole), `POST
  …/preview` (the draft host's entry; the preview wakes up: its dev
  server started when the draft has one and no turn runs). Errors:
  `invalid` 400, `cap_reached` 402 (`scope`), `denied` 403, `not_found`
  404, `busy`, `no_ai`, `not_asked`, `project_quota` 409,
  `perseus_unavailable`, `unavailable` 503.
- **Pictures to the model**: a turn's message names its pictures
  (`perseus.Turn.Images`, `Message.Images`, the `turn` event's `images`);
  Perseus passes the names on, and the node, on the grant's `chat`, turns
  each user message naming pictures into the model's text and image parts
  (data URLs read from the project's attachments; the eight most recent
  shown, older ones named in words) — Perseus never holds their bytes.
  The gateway counts an image part as 1,600 tokens in the worst case, not
  as its data's text, and refuses pictures (`no_vision`) to a model not
  listed as reading them (`Provider.vision`); `BuildImages` tells the page.
- **The screens** (`chest/web/portal/src/build.ts`,
  `components/PerseusBuild.tsx`, `components/Markdown.tsx`, `diff.ts`,
  `photo.ts`): **Build with Perseus** (Tools, Add a tool) opens
  `/build/new` in place. Perseus Code is one page like an AI chat: on the
  left New tool and the member's projects where something was said
  (`started`), the open one with its conversations (a drawer on a phone);
  in the middle `/build/new` (“What should we build?”, examples; or, for a
  member who is not a builder, **Ask to become a builder**; without an AI
  connector, **Open Settings**: `PerseusAccess`) or a project's
  conversation; on the right the preview, only once there is something to
  preview (a checkpoint, or a dev server that runs, starts or failed),
  the split dragged or moved with the arrow keys and kept on the browser
  (`localStorage`, read and written in `try`). What the builder writes is
  kept on the tab as they write it (`sessionStorage`, in `try`): the
  description of a new tool, and per project the message and the answers
  being chosen to a question (controlled by the page's state, never the
  form's alone) — a page loaded again finds them; a message sent or answers
  given are forgotten. The events' stream the browser gives up (an answer
  that is not a stream) is opened again three seconds later, the project
  read first, the events already shown kept. A `chest.json` written
  re-reads the project: its name. Each showing of the draft — the first, after a turn that changed it, Reload — enters with a new ticket: a frame replaced while its entry was under way (the entry's ticket spent, its cookie never set) would land on the draft without a session. A project's header: its
  name, renamed in place; where a published project stands; one menu
  (Checkpoints, Rename, Delete); Publish, whose sheet opens in the portal's
  dialog (the panel's `build-publish`). The conversation: the builder's
  messages with their pictures, Perseus's answers as they stream, rendered
  from their Markdown as elements — never HTML: paragraphs, lists,
  headings, fenced code, inline code, stress (a highlight: the brand has no
  bold), italics, links only to http(s) —, one answer per model call (the
  page reads where each call ended in its emptied `message` events), each
  call a quiet row — a square, what it did, how it ended (`+4 −1`, failed)
  — that opens on what it did (an edit's lines numbered, open at once; a
  file written; a command's output; an error, open at once), the calls
  that only looked in a row gathered into one (“Read 7 files, searched
  twice”), the verification a row, the plan a checklist open while Perseus
  works (its item under way in blue) and folded after, cards for what
  Perseus asks, a single **Build it** under a plan (a project's messages
  are planned until then, built after), each checkpoint with Restore and
  See changes on hover or focus; the composer (Enter sends, Shift+Enter a
  new line, pictures pasted, dropped or chosen; Stop, or Escape, while
  Perseus works). A message the Chest took
  (202) is never said unconfirmed: the project read after it is only a
  refresh; a request with no answer in time says so (`timedOut`), and the
  project's views have response limits of their own (`limits.ts`). The
  preview: the draft host in a sandboxed frame with a few icons (desktop or
  phone width, reload, open in a new tab) and a small **Code** that shows
  instead the code of a checkpoint, read only: its files with what it
  changed, a file's changes line by line or the whole file. One column on
  a phone, Chat | Preview.
- **The SDK the Chest ships** is in its knowledge pack as npm packs it
  (`chest/perseus/knowledge/chest-sdk-<version>.tgz`, built by
  `scripts/perseus-knowledge.mjs` from the SDK's clone at the commit of
  its vendored copy, counted in the pack's version). A draft depends on it
  in its workspace (`file:vendor/chest-sdk-<version>.tgz`) — never on the
  registry, which may not have that version —, and on **no other**:
  before each turn that builds (a plan changes nothing), the node makes
  the project depend on the SDK this Chest ships (`buildproject.UseSDK`) —
  its tarball written, any other version's tarball removed, the package's
  dependency and its lock (`version`, `resolved`, `integrity`) naming it,
  another version's installed copy removed from its `node_modules`. A
  project that depended on another version is told to the turn
  (`Turn.SDK`), which runs `npm ci` first — a step the builder sees — and
  says it to the model before the builder's message: the preview and the
  published tool (the archive carries it) run the SDK this Chest ships.
- **A draft that crashed** says so: a dev server that runs but does not
  answer (node `--watch` waiting after a crash) is `failed` for the page
  and for Perseus (`toolfront.Instance.Answers`), and the draft host's
  page for a server that does not answer is its own (“The draft stopped
  answering”, `Visit.Unavailable`), never the Chest's “Tool unavailable”.
  The draft host speaks the language of the member entered (the
  portal's `LanguageOf`), before any entry the browser's.
- **The draft host** frames only in the portal: every answer's
  `frame-ancestors` is the portal's origin (`draftfront`), the tool's own
  `'none'` replaced. The portal and the draft host are the same site on a
  Chest (`prj-…--build-chest.<chest>.<domain>` under `<chest>.<domain>`),
  so the draft host's session cookie (`SameSite=Lax`) holds in the frame;
  the browser lab has the same topology — its portal at `apps.localhost`,
  its tools and drafts under it — and checks what the frame renders.
- **Not built yet**: the Data, Logs and Check tabs, the Code view's file
  of the workspace between checkpoints,
  WebSocket hot reload (PB3), sharing, the Chest memory, Settings →
  Perseus, inbox notifications of long turns,
  the secret-in-a-message warning (PB5), the agent journal's Perseus
  lines, the ten-task benchmark with a real key.
- **Proof**: Go tests (the engine against a scripted node — a happy turn,
  forbidden commands, an injection in a file, the loop guard, a cap,
  verification, Plan, compaction, stop and interruption, resume —; the
  node with the real engine over its socket, the grants' checks, a crash
  and Continue, the node's restart; the pages' routes and stream; the
  gateway's calls and caps; the unit's rendering), the VM proof of the
  unit (`probe-perseus-macos.sh`) and the browser lab (`perseus.spec.ts`),
  [testing](testing.md).

### Perseus Code: publishing

Lot PB4 of [Perseus Code](../../../01_produit/02_specs/perseus-build.md):
a project becomes a tool — the third source of a tool, beside the
catalogue and GitHub — through the Chest's one build path and the rules of
every tool (`chest/portal/publish.go`).

- **What is published** is a checkpoint: the node checks the workspace by
  the Chest's rules (`chest check`: the archive, then the migrations; a
  refusal is `check_failed` with its reason), records it as a checkpoint of
  the publisher when it changed (“Publish”), and packs that checkpoint as
  `git archive` packs a commit (`buildhistory.Archive`: directories and
  files in path order, executables kept, dated by the checkpoint, its
  identifier the comment of the global header, within the archive's
  bounds; the same checkpoint always gives the same bytes). Never while a
  turn runs (`busy`); only by a member who opens the project — its
  builders who hold the status, the owner, the admins (403 otherwise).
- **The build** is the one of every source (`sourceRun`, the archive in
  hand instead of fetched): `sourcebuild.Intent` with `Commit` the
  checkpoint and `Project` the project, which `status.json` keeps — the
  same recipe, `npm ci`, migrations, checks and ledger.
- **The decision** (`GET /api/build/projects/{project}/publish`, the sheet:
  the check, what the manifest declares and the digest `approval` of its
  name, permissions and roles, the tool the project runs as with its
  version and what the workspace asks beyond it, the decision, the
  project's proposal waiting or rejected; `POST …/publish {name?,
  approval}` → 202 `{name, state}`, the source refused with `changed` when
  it is no longer what the sheet showed):
  - a **new tool** published by the owner or an admin is installed in that
    decision, under the name chosen (`as`, the rules of “Tool names”; no
    builder recorded: they run every tool);
  - by a builder, it is a **proposal** (`chest/proposal`, source
    `perseus`: the project and the checkpoint, what the manifest declared;
    one pending per project, `pending` 409); approving it rereads that
    checkpoint's archive, which must still declare the same, builds and
    installs it, and records the builder assigned to the tool
    (`Team.RecordBuilder`); a rejection's reason reaches the project;
  - the **tool a project was published as** takes each later publication as
    its next version (its manifest must still name the tool:
    `manifest_name`): put in service at once when it asks nothing more
    (`packagefile.Beyond`) and its builder sees the tool's data, or when
    the owner or an admin publishes it; built and left as an offer for them
    when a builder publishes a version that asks more or does not see the
    data (“the version waits for the owner or an admin”, the tool's page: a
    version to approve, the owner and the admins told in their inbox —
    “Identities and authorizations”); the previous version stays one
    rollback away (`/api/installation/rollback`).
- **The link** between a project and its tool is the registry's
  `project`: `GET /api/build/projects` and a project's page give `tool`
  (the name of its last build) and `published` (the checkpoint of the
  version in service), from which the pages say “In service”, “Changes not
  published”, the tool's source “Perseus Code · <project>” with **Open
  project**, and one row per project on the Tools page (the tool, its
  project a link of it). Removing the tool forgets its builds, and so the
  link; the project stays, a draft again.
- **The steps** (`proposed`, `building`, `installed`, `approval`,
  `failed` with its reason, `rejected` with the decision's reason) are
  written by the node in the project's latest conversation (event
  `publish`, `perseus.Publication`), never by Perseus, and the node log
  says each publication (`Perseus Code: <project> published as <tool>
  (checkpoint …)`).
- **Not built yet**: the reviewer's findings in the sheet, the export
  (“Download source”, a Git bundle), the agent journal's line for a
  publication, an inbox item for a proposal.
- **Proof**: Go tests (the archive of a checkpoint; the proposal source;
  the ledger's project; the node's recording and archive, refusals while a
  turn runs and to a member; the portal's decisions — proposal, approval,
  version put in service, version left for the owner, owner's install
  under a chosen name, check refused, changed, pending, manifest name,
  rejection —), the browser lab (`perseus.spec.ts`), [testing](testing.md).

### Next.js on Chest

A Next.js server (App Router) runs on the v2 contract with nothing specific
to Chest; Forms (repository `chest-by-argentic/forms`, its `README.md`,
“On a Chest”) is the example. What the Chest imposes, and what the tool
does:

- **Inline scripts**: Next.js hydration runs some, which `DefaultCSP`
  forbids. The tool declares `"csp": "tool"` (with `public`) and sends its
  nonce policy on every page — a `proxy.ts` (the Next.js 16 `middleware`)
  draws one nonce per request and puts it in the request's
  `Content-Security-Policy` (Next.js reads it there and sets it on its
  scripts) and in the response's; pages are rendered on demand. On the team
  host, its policy is its own (`TeamCSP` is only added to a response without
  a policy).
- **Read-only file system**, 64 MiB `noexec` `/tmp`: `next start` writes
  nothing if no page is cached at runtime — all rendered on demand
  (`dynamic = "force-dynamic"`), without the image optimizer
  (`images.unoptimized`, otherwise `.next/cache/images`). No variable moves
  `.next/cache`; it is not needed this way. Measured on the Mac, read-only
  tree after `npm prune --omit=dev`: pages, server actions, CSV route served
  without error.
- **`PORT`**: `next start` reads it; `-H 127.0.0.1` keeps it on the loopback
  where the launcher relays. `static` by default, `/_next/static/`, serves
  its built files on both hosts without a session.
- **Memory**: at runtime, `next-server` holds ~150 MiB (Mac, after a few
  pages), under the 512 MiB. At build time, Next.js 16's default Turbopack
  build reached 1.2 GiB on the Mac, with no adjustable bound; webpack
  (`next build --webpack`, a single process, `experimental.cpus: 1`,
  `webpackBuildWorker: false`, no cache left in the image) succeeded with a
  V8 heap limited to 256 MiB. On the real server, 512 MiB were killed by the
  kernel (`npm error signal SIGKILL`) whereas the lab VM let it through: the
  bound is now 1.5 GiB (`sourcebuild.BuildMemory`, above).
- **Imports**: webpack and Turbopack do not resolve `./x.js` to `./x.ts`; a
  tool imports its TypeScript files with the `.ts` extension
  (`allowImportingTsExtensions`) and vendors from the SDK only files without
  relative imports (`member.ts`), or the compiled SDK.
- **Size**: ~330 MiB of dependencies after `npm prune --omit=dev` (`next` and
  its SWC binaries, `sharp`, which it pulls in optionally), 3 MiB of
  `.next`.

### Tool names

A tool's name makes its address (`<name>.<chest>.<base>`) and is the key of
everything the Chest keeps about it: binding, access and builders in the
policy, OIDC identity and client (`appidentity`), registry build, GitHub
link, Compartment (`apps/<name>/`). Two tools never bear the same name in a
Chest.

- **Name chosen at installation**: the name is the manifest's, unless the
  person who installs or proposes chooses another (`as`). The chosen name
  never enters the author's manifest: it is recorded alongside — the
  registry intent (`Intent.As`, and `manifest` in `status.json`), the GitHub
  link (`tool` and `manifest`), the proposal (`app` and `manifest`) —, and
  the package the Chest writes for the image it built carries it, as it
  already carries the image and the permissions read: that package was
  never the author's. What is approved remains exactly what was shown: the
  catalogue fingerprint (the manifest's `name`, repository, commit,
  permissions, roles) and, for a repository, the manifest reread at the
  head; the chosen name is added to it in the same decision, and every
  commit built must still give the name the manifest gave (otherwise
  “manifest names another tool”). Rule for a chosen name
  (`access.ValidToolName`): a host label of at most 48 characters, lowercase
  letters, digits and single interior hyphens, never `login` or `node`. The
  chosen address is under the Chest's wildcard certificate, like that of
  any tool.
- **Checking a name**: `GET /api/tools/name?name=<name>[&catalogue=<tool>]`
  `[&permission=<p>…][&role=<r>…]` (what the sheet shows of the source: at
  most 37 permissions and 16 roles, 300 characters each; any other key, or a
  repeated `name`/`catalogue` → `invalid`), for any member of the Chest (the
  one who can propose), changing nothing: `{available}` or
  `{available: false, reason}` — `invalid`, `reserved` (fixed service, node
  offer, catalogue tool other than `catalogue`, unless it follows a
  repository), `taken` (a tool runs under this name: `tool` gives its title
  and, only to whoever administers the Chest, `replaceable` and `more`
  `{permissions, roles}` — what the source asks beyond the version in
  service, by the package rule, `packagefile.Beyond`: the page does not
  recompute it), `busy` (build or installation in progress, proposal
  pending or approved, repository linked under this name). The installation
  routes apply the same rule (`nameReason`): 400 for an invalid name, 409
  otherwise.
- **Routes**: `POST /api/catalogue/install {name, approval, as?, replace?, open_public?}`,
  `POST /api/github/links {repository, branch, as?, replace?}`, `POST /api/proposals
  {…, as?}`; approving a proposal installs under the proposed name. The link
  set from a tool's page (“Link a repository”) names that tool (`as`): its
  builds are its next versions, under the rule of any update.
- **Replacing the source while keeping name and data**: with
  `replace: true`, on the name of a tool in service whose versions the Chest
  knows, the new source is built and put into service as the **next
  version** of that tool (`Updates.Update`, widening approved in the
  decision — the page showed the difference): same binding, data, access,
  builders; the version left behind remains the previous one, a rollback
  (`/api/installation/rollback`) restores it. A decision reserved to the owner
  and admins (403 for a builder or a member; a member never proposes a
  replacement). From a repository, its link replaces the tool's in the
  decision (`githublink.Store.ReplaceLink`); from the catalogue, the
  repository the tool followed is unlinked once the version is in service. A
  catalogue name whose tool now follows a repository is no longer reserved
  to the catalogue (its builds are the repository's) and the catalogue no
  longer offers it updates.
- **Removing frees the name immediately** (“Removing a tool”): a new
  installation under that name starts from scratch.
- **Renaming** does not exist yet: changing the name of an installed tool
  requires a new host, a certificate, an OIDC client and a redirect from the
  old address. A catalogue tool installed under another name does not
  receive the catalogue's “Update” (the entry is tracked by its name):
  replacing it with the same entry (`replace`) is its update; the progress
  of such an installation before the registry (the download) can only be
  read on the tool's page, not on the entry.

### Updating a tool

An installed tool is **replaced by a new version of itself**, Vercel-style:
a more recent build of its linked repository, or a more recent commit of the
catalogue. Its data does not move — it lives outside the image, in
`apps/<id>/state` — and the previous version remains one click away.

- **Rule**: a version that asks for **nothing more** than the one in service
  (same name; permissions and roles within those approved,
  `packagefile.Beyond`) is put into service **with no one involved** when it
  comes from a linked repository whose member sees the tool's data —
  auto-deploy is the builder's rule; only the owner and admins link
  repositories; a version that asks for **more**, or whose code is a
  builder's who does not see the data (“Identities and authorizations”),
  remains an offer, with the difference in words (“Also asks for: …”) or
  whose code it is, until the owner or an admin decides; so does **every
  version that declares `sealed`**, whoever wrote it and wherever it
  comes from (`HasSealed` in `deployBuild`, `installationUpdate`,
  `sourceInstallBuild` and the catalogue's update): its code can read
  sealed data, and the page says so (“This version can read sealed
  data”) — the owner's or an admin's Update is that approval — the tool's
  builder puts into service what asks for nothing more when they see the
  data, never more (403 `approval_required`); a token never does either. The catalogue
  never deploys on its own: “Update Notes (commit abc1234)” is a decision,
  which approves what the entry shows.
- **Durable** (`chest/provision`, `Applications.Replace`): the new version is
  written to `package.next.json`, the `.applications` inventory names its new
  approval — that is the decision point —, then the files follow:
  `package.json` becomes `package.previous.json`, `next` takes the name. An
  interruption between these steps is finished at the next opening
  (`resumeSwap`): a `next` the inventory has not named is discarded, a named
  `next` takes its place; a torn write corrupts nothing. A single level of
  rollback: `Rollback` swaps the two files (the version left behind becomes
  the previous one). The inventory also keeps, per tool, the **origin** of
  each version (commit and end of build, read from the registry) for the
  line “Version in service: <sha7> from <date>”.
- **Switchover** (`cmd/chest`, `nodeApplications.Update` / `Rollback`): the
  image is local (built here, `ImagePresent`); the version's migrations are
  run (“Database”); the inventory is rewritten; then the version starts
  **alongside** the one in service, takes the traffic once it responds
  (60 s), and the previous one stops once drained (“Server tools”, versions
  without downtime). Failing a response: `Rollback` of the inventory, the
  version in service never stopped responding, and the failure is reported
  (“version not confirmed; the previous one stays in service”). The portal
  then replaces the binding (same target, roles and public part of the
  version) and tells the team (`Team.UpdateApplication`: a role that
  disappeared falls back to the default role).
- **Registry and portal**: `sourcebuild.Intent{Update, Commit}` — set by the
  relayed push and by “Check now” when the tool is in service, and by the
  catalogue on “Update” —; the ready build is put into service
  (`deployBuild`, under the installation lock) or left to the owner, and the
  outcome is written to `status.json` (“Deployed: in service.”, or the
  reason). Routes for whoever runs the tool:
  `POST /api/installation/update {app, approval}` (the named offer, at the
  fingerprint shown; whatever more it asks for the owner and admins — the
  page said so —, nothing more for a builder: 403
  `{"error":"approval_required"}` otherwise) and `POST /api/installation/rollback
  {app}` — both wait up to 45 s for the change under way (a version just put
  in service holds the installation lock while the one it replaced drains and
  stops), 409 `installation busy` beyond; `POST /api/catalogue/install` of an installed tool follows the same
  rule; `GET /api/installation` gives per offer `current`, `version`, `previous`
  (image, approval, permissions, roles, commit, date) and `more` (what the
  offer asks for in addition); `GET /api/catalogue` gives `version`, `previous`,
  `update` and `more` of a tool in service.

### Room for a new tool

Nothing counts the tools, the builds or the linked repositories of a Chest:
what limits them is its server (`chest/serverroom`, the one rule). A new tool
is installed only where the server would still hold it:

- **Memory**: every tool in service **were they all awake**, each with its
  own memory (`toolmemory`), plus the new tool's (256 MiB, the default),
  within **95 %** of what the tools may use (`toolmemory.Budget`: the
  server's memory less the 1.5 GiB kept for the Chest, what tool sleep
  counts, node_sleep.go);
- **Disk**: the disk used, plus the image a build is expected to take,
  within **90 %** of the disk. The expected image is the **average of the
  images the ledger keeps**, each measured once built (`podman image inspect
  {{.Size}}`, `Status.ImageBytes`, the layers it shares with others counted
  in it: an overestimate); 1 GiB (`sourcebuild.DefaultImage`) before any.
  Every build weighs it at `Ledger.Stage` — a new version too — and is
  refused `sourcebuild.ErrDiskFull` beyond; the disk is measured as Settings →
  Server measures it (`serverroom.Measure`, a laboratory's
  `health_lab.disk_extra_bytes` counted).

`Room.Full` names the resource that would not hold it, the memory first. A
server that measures neither (a developer's machine) holds everything.
`GET /api/installation/room` (owner and admins) says it — `{full, tools,
budget, known, tool, memory_share, disk_used, disk_size, build, disk_share,
plan, next, upgrade}` (MiB for the memory, bytes for the disk; `plan` and
`next` from `serverroom.Plans`, the sizes the service offers; `upgrade` the
owner's request, below). Every decision to install a new tool refuses it 409
`{"error":"server_full","resource":"memory"|"disk"}` — from the catalogue, a
repository, a proposal approved, a Perseus Code project published, an offer,
a Retry —, and the installation itself weighs the memory again under the
installation lock (two decisions never take the last room together): a
failure then says `memory full` or `disk full`. A version of a tool in
service, or a source put in place of one, asks no memory.

**The screen of a full server.** The install sheet is as ever; a decision
refused `server_full` turns the panel into its screen (`ServerFull`): “Your
server is full”, why (the resource), the numbers in Details (the resource's,
then the three meters of Settings → Server), and what resolves it, by role —
the **owner** moves to the larger server (below); the owner and the
**admins** free some space (the tools in service, the largest in memory
first, then on disk, each removed after the usual confirmation), then retry
the installation once the server holds it; **anyone else** is told to ask
the owner or an admin. The same screen follows a Retry, an approval and a
Perseus Code publication of a new tool.

**The larger server.** `POST /api/server/upgrade` (the owner alone; 403 for
an admin) records the owner's request for the plan after the server's
(`serverwatch.Watcher.AskUpgrade`; 409 when there is none larger or one was
asked): kept in `health/state.json` and carried by every report to the
central (`serverhealth.Report.Upgrade`: when, the plan, the memory then)
until the server's memory grew — then it ends by itself. The central sees it
as the alert `upgrade` about the plan (`serverhealth.UpgradeAsked`, the
operators' only, never the owner's): its Admin lists it and the fleet alerts
mail every operator (`central/fleetalert`), who enlarge the server (“Server
upgrade”, `01_produit/02_specs/owner-space-and-billing.md`). Payment is not
wired yet: this request is where it will be.

**Images of former builds** are removed once nothing keeps them
(`cmd/chest/node_images.go`): kept are, for each tool, the version in
service and exactly one before it (Rollback), and the image of each build
the ledger keeps (an offer, a version waiting for its approval, the last
ready one of a failed attempt). Only the images the Chest built — labelled
`dev.chest.build` — are considered, listed before what is kept is read and
never while a build runs; one a container uses, Podman refuses. The node
collects at its start, every ten minutes, and five seconds after a version
changes, a rollback, an uninstallation or a cancelled installation.

### Failed installations

An installation that did not end with the tool in service — its fetch, its
build or its installation failed — **frees its name and its repository at
once**: nothing was claimed for them (the link is claimed once the tool runs,
and nothing is prepared for a name before: the tool hosts are under the
Chest's wildcard certificate). What stays is the attempt, **never left
without a way out**: the Tools list shows it (“The installation failed”, the
reason in words, its log, Retry and Cancel for whoever administers the
Chest), and so do the Deployments of the tool. The attempt is **kept on
disk from the decision on** (`chest/installattempt`, one file per name under
`attempts/` of the node, written atomically): its source (`github` with the
repository, branch and installer, or `catalogue` with the entry), what the
manifest says of the tool (title, description, icon) and, failed, the reason
in words — so that a failure before any build, fetch included, survives a
restart of the node with its name and its reason. It is forgotten when the
tool runs, is cancelled or is removed. `GET /api/installation/attempts`
(owner and admins; 403 otherwise) lists them — `tool`, `source`,
`repository`, `branch`, `catalogue`, `state`
(`fetching|building|installing|failed`), `reason`, `title`, `description`,
`icon` (served where a built tool's is,
`/api/chests/{chest}/apps/{app}/icon`) —, the live run first, then the
registry's build, then the kept reason (`interrupted` when the node stopped
under it). Both routes are the owner's
and the admins' (403 for a member), take `{app}`, and refuse a tool in
service or one with a build or a run under way (409) and a name no failed
installation holds (404):

- `POST /api/installation/retry` — 202 `{name, state}`, followed as the
  first run. The name must still be free — else 409 `{"error":"name_taken"}`
  (another tool, a waiting proposal or a reserved name holds it): the page
  says “The address todo was taken meanwhile: choose another.” and opens the
  sheet of the repository (or of the catalogue entry) with that address,
  judged again, to choose another — and the repository followed by
  no other tool (`linked`); both are held again while it runs, the tool's
  once it runs. The ready build of the attempt, staged to be installed and
  whose installation failed, is installed as is (nothing rebuilt); else the
  **commit the attempt was of** (the registry's `commit`; the head of the
  branch when none was recorded) is fetched again with the retrier's
  installation, built with the install intent (the manifest of that commit
  is what is approved, as at the decision) and installed; a tool of the
  catalogue is installed again from the catalogue; a version of a Perseus
  Code project that did not build answers `no_retry` (published again from
  its project).
- `POST /api/installation/cancel` — 204: the row goes — the attempt and the
  run forgotten, the build deleted (`Ledger.Forget`), whatever the node kept
  of a half installation removed, as the uninstallation below takes them;
  when another tool took the name meanwhile, only the attempt is forgotten.

### Removing a tool

“Remove tool”, in the settings of an installed tool's page, is **a
decision of whoever administers the Chest** (owner or admin, never a
builder), and it is **final**: reinstalling later starts from scratch
(decision of 23 September 2026). Route: `POST /api/installation/uninstall {app}`
— 204; 404 for a tool that is not running; 409 while a build of the tool is
running, the catalogue is installing it or the installation lock is held;
403 for a member.

- **What is removed**: the container (stopped and removed, without a grace
  period); the Compartment and its data (all of `apps/<id>/`: package,
  previous version, `state`, variables, memory); **every access** of the
  tool in the policy (`Team.RemoveApplication`: direct access, group access,
  opening to everyone, and the builder status of its proposers); the linked
  repository whose `tool` is the tool (`links.json`); what the registry holds
  for the name (`builds/<id>/`: built image, log, presentation images,
  `Ledger.Forget`); the log of its network egress
  (`installation/egress/<id>.jsonl` and its previous one) and its runtime log
  (`installation/logs/<id>.jsonl` and its previous one). The catalogue shows
  it as “available” again.
- **What is kept**: the server's nightly backups, which hold a copy of the
  data — variables included, with the node key — until their retention
  ends; the variables key (`installation/variables.key`), which no longer
  seals anything of the tool; the OCI image in podman's storage (it carries
  no data; a later build replaces it); the certificate for the tool's
  address, already requested, harmless.
- **What also goes, at the provider**: the team host's OIDC client
  (`appidentity`, `<name>-chest.json`), deleted by `Registrar.Forget` —
  `DELETE /clients-registrations/default/<id>` with that client's
  management token (`registrationAccessToken`, kept at its creation), then
  the file, only once the deletion is confirmed (204): an installation never
  finds the access of a vanished client. Both hosts stop being served;
  reinstalled, the tool prepares them again, with a new client of the same
  identifier. A client without a management token or an interrupted
  registration cannot be proven ours: they stay, whole and counted, for the
  operator, and the node log says so; a later installation under that name
  takes them over as is. A provider that does not confirm makes the removal
  fail, and it is requested again. The cap of fourteen identities
  (`appidentity.MaxIdentities`) therefore counts the kept clients, not every
  name ever installed; a server counts as one (its public host has no
  client).
- **The name is free immediately**: no more binding, access, builder, build,
  link or Compartment under this name, and the failure of a previous
  installation that the portal kept in memory is forgotten; an installed
  proposal retains nothing of it. A new installation under the same name
  (`GET /api/tools/name`: available) starts from scratch.
- **Order, so that a restart at any moment leaves a safe state and asking
  again finishes the work**: the policy first — a tool that survives this
  step is a tool no one has any more, still listed, still to be removed;
  never a Compartment whose former access a reinstallation would bring back
  —, then the node (`Applications.Withdraw`: the `.applications` inventory
  stops naming the tool and records the name in `removing` — that is the
  decision point —, the container stops, `Applications.Remove` erases the
  directory and removes the name from `removing`; opening the inventory
  finishes a removal left halfway, before any tool starts, and a name being
  removed is not free for an installation), finally the binding here, the
  GitHub link and the builds. Each step has no effect once done.

### GitHub link

**A single GitHub App** for all Chests, “Chest by Argentic”, Vercel-style
(decision of 22 September 2026). It belongs to Argentic; **each member of a
Chest installs it on their own GitHub account** (or an organization they
administer) and chooses the repositories the Chest can read — nothing else,
never with write access (decision of 24 September 2026: this is the
product's particularity, each person sees only **their own** GitHub). Only
the central holds the app's key: it issues installation tokens and relays
the webhooks; it **never reads the code**. The Chest fetches the code
itself, with the token of the member whose repository it is; nothing GitHub
sends is believed beyond “this branch has moved”. Members **propose** a tool
from one of their repositories; the owner and administrators decide, and
link their own directly.

- **The app on the central** (`central/githubrelay`, `opening.json`
  `github: {app, directory?, api?, web?, ca?}`): `github-app.json` (id, slug,
  webhook secret, `key_file`, client id and client secret), written by
  `set-github-app-linux.sh` without displaying anything, RSA key read at
  startup and kept in memory. The app **requests the user's authorization
  (OAuth) during installation**: its callback URL is the central's
  `/github/setup`. Without this block, Chests receive “GitHub not
  configured” (503) and nothing else changes. Installations are recorded in
  `github/installations.json` (`installation_id ↔ chest, member`, GitHub
  account, and the GitHub `user` who proved it theirs): **an installation
  serves one member of one Chest** — a member can link again, replacing
  theirs; an installation bound to another member or another Chest is
  refused (409); a record without a member, without its proving user, or an
  installation recorded twice makes the file unreadable (`central migrate`
  drops the records made before the proof). Removing a Chest
  (`enrollment-release`) forgets its installations and its pending tickets —
  no push is relayed to it any more, nor to a future Chest of that name —
  and uninstalls the app from the accounts that were the proving user's
  own; a return from GitHub with a ticket of that Chest no longer links
  anything (the ticket is rechecked when the link is recorded).
- **What a Chest asks of the central** (`/fleet/v1/github/*`, the server's
  relay token, server `ready`, the Chest being the one in the fleet record —
  never the one the call names; each step names the member it concerns,
  `{member, owner}`, the subject as the Chest knows it): `github/ticket` →
  `{url}` (the app's installation page with a random `state` kept a quarter
  of an hour by the central, tied to this member of this Chest; at most 16
  pending per Chest, 4,096 for all, so that one Chest asking in a loop only
  uses up its own); `github/installation` →
  `{installation_id, chest, member, account, user}` or 404; `github/token`
  (`{member, repository?}`, the only step that names a repository) →
  `{token, expires_at}`, the member's installation token minted by the
  central (JWT RS256 with the app's key, `iss` = id, `iat` − 60 s,
  `exp` + 9 min, `POST /app/installations/{id}/access_tokens`), **always
  narrowed** to `permissions: {contents: read, metadata: read}` and, when a
  repository is named, to `repositories: [<name>]` — a repository of the
  installation's account, any other refused; `github/forget` → 204, the
  member's installation is removed and, when it is on the proving user's
  own account (`account` = `user`), the app is uninstalled from it
  (`DELETE /app/installations/{id}` with the JWT; a silent GitHub is logged,
  not refused); an organization's installation stays installed for its
  administrators to remove. The Chest keeps one client per member, with a
  token to browse (the repository list and the root checks) and one per
  repository whose code it reads (branch head, tarball), each until one
  minute before it expires (32 at most), and reads GitHub **directly** with
  them:
  repositories (`GET /installation/repositories`, the first hundred, sorted
  by `pushed_at` descending — RFC 3339 timestamp normalized to UTC, dropped
  if invalid without excluding the repository; those without a date last,
  then by name, `private` kept), the regular files at the root of a branch
  (`GET /repos/{repo}/contents/?ref={branch}`, entries of type `file`: 404 —
  branch not found, empty repository — is none, any other response unknown,
  1 MiB read at most), branch head, tarball (32 MiB, three HTTPS redirects; the standard
  client drops the authorization when changing host). The channel to the
  central is the same as the mail one (`portal.Relay`, `relay` in
  `node.json`).
- **Connecting** (any member, from the dashboard, “Add” or “Propose a tool”
  then GitHub): one button, one GitHub page. `POST /api/github/connect` requests
  the member's ticket and returns `{url}`; the page goes there. GitHub, once
  the repositories are chosen and the member authorized the app, sends the
  member back to the central,
  `GET /github/setup?code&installation_id&setup_action&state`. **The
  installation number is never believed on its own** (anyone can type one):
  the ticket is consumed (constant time, spent whatever comes of it), the
  `code` is exchanged for a token of the GitHub user who came back
  (`POST {web}/login/oauth/access_token` with the client id and secret),
  `GET /user` names them and `GET /user/installations` (a hundred per page,
  ten pages at most) must list that installation, of this app (`app_id`),
  giving its account — otherwise 403, nothing bound; the user token is then
  revoked (`DELETE /applications/{client_id}/token`), the central keeps
  none. An installation bound to another member or Chest is refused (409).
  The link is recorded, then 303 to `<Chest
  portal>/github/installed` — nothing secret in the address — and the Chest
  asks the central again what it knows (“GitHub connected: acme”) then
  brings back to “Add a tool” (`/tools/new`), open to any member, where
  the repositories of the connected account are listed: connecting one's
  GitHub is each member's business. A return without a ticket (the
  installation changed from GitHub's own pages) looks nothing up and answers
  the same neutral page for any installation: which Chest an installation
  serves is never told.
  What GitHub calls on the central is limited per client address before
  anything is verified (`common/ratelimit`, the address given by the
  front): 30 returns a minute, 30 doorbells with a refused signature a
  minute — beyond, that address is refused (429, `Retry-After`) before its
  body is read. Signed doorbells, GitHub's for every customer, are never
  counted per address; the pushes forwarded to one Chest are, 120 a minute
  (beyond, dropped and logged: “Check now” reads the branch).
  `GET /api/github` tells the
  member the state of **their** link (`none`, `installed` with `account`,
  `unavailable`, `unreachable`); `GET /api/github/repositories` lists **their**
  repositories, from most recently pushed to oldest: an array of
  `{full_name, default_branch, pushed_at?, private?, check?}` where `check`
  says what the default branch is, the way a host detects a framework —
  one read of its root per repository (`githubChecks`): `ready` when
  `chest.json`, `package.json` and `package-lock.json` are there (a source
  the Chest builds), otherwise the word of the first one missing
  (`no_manifest`, `no_package`, `no_lock`, `sourcearchive.MissingAtRoot`,
  the rule of the archive itself). Every listed repository is checked, six
  reads at a time, eight seconds each, fifteen for the whole list; what
  GitHub did not answer in time leaves the field absent (unknown) and is
  asked again next time. What was found is kept an hour per member, per
  repository, branch and push date (a push makes it ask again), forgotten
  on return from GitHub (`/github/installed`) and on disconnection: a list
  read again costs GitHub nothing. “Add a tool” says “Checking
  repositories…” meanwhile, then lists only the repositories the Chest
  builds, each with its name, a lock when private, the last push in
  relative form and an **Import** button at the end of the row — the row
  itself chooses nothing; Import opens the repository's sheet (below).
  The others are not shown: a line under the list says the rule (a
  `chest.json` at the root, with `package.json` and `package-lock.json`, or
  the repository cannot be installed); without any, “No Chest-compatible
  repository” says the same rule, with an example `chest.json`; repositories
  not checked are counted with “Retry”. The API keeps the first file each
  one lacks (`check`), for an agent.
  **Disconnecting** (`POST /api/github/disconnect`, any member): the central
  removes their installation (and the app from their account if no one else
  is linked to it), their links stop — the built tools remain installed —,
  the Chest forgets what it held from them; they can connect another
  account.
- **Choosing a repository** (any member): `POST /api/github/read {repository,
  branch}` reads the head of the branch with the member's installation and
  returns what the manifest declares — `{name, title, description,
  permissions, roles, role_labels, commit}` — keeping nothing: the page shows
  the tool (presentation, capabilities, roles) before any decision. A member
  then sends a proposal; the owner and administrators install.
- **Refusals** of the GitHub routes, and of a proposal of a repository, are
  `{"error": code}` (`githubError`, `stageError`, `nameRefused`), never a bare
  status: a source refused is 400 with the word of `sourcearchive.Reason`;
  `not_installed`, `linked`, `reserved`, `taken`, `busy`, `too_many` 409;
  `invalid`, `invalid_name` 400; `members_propose` 403; `github_refused` 502,
  `github_silent` 504; `github_unconfigured`, `central`, `unavailable`,
  `build_not_started` 503. The portal says each in words
  (`notify.ts`, `m.notices.github.refusals`).
- **Links** (`installation/github/links.json`, at most eight, repository
  `owner/name`, branch of simple components, `member`: the installation that
  reads the repository — the manager who linked, or the member whose
  proposal was approved, always present; `tool` is the tool's name, and
  `manifest` the one the manifest gives when the tool is installed under
  another): `POST /api/github/links {repository, branch, as?, replace?}` (owner
  and administrators only; a member receives 403 and proposes) reads the
  head of the branch, fetches the commit's tarball, validates it
  (`sourcearchive.Validate`) to learn the **name the manifest gives the
  tool** — the tool takes this name or the chosen one (`as`, “Tool names”)
  —, refuses a name that a fixed offer bears, that another repository
  already gives or that is not free and, the tool not being in service,
  **builds and installs it in this decision** (like the catalogue:
  `sourceRun`, followed on the installation screen); a tool in service
  that followed no repository is linked and receives the build as its next
  version. **The link of a new tool is claimed once the tool runs**
  (`Store.Claim`, after its installation): while it is installed, its run
  holds the name and the repository (another decision on either is refused);
  a failure frees both at once (“Failed installations”). **A link exists
  only for a tool installed**: the store itself refuses to write one for
  another (`githublink.Open` is given what the node has installed,
  `Store.Claim` answers `ErrNotInstalled`), and the link of a tool goes with
  it (uninstallation, a cancelled installation): every reader of the links
  — the name held, the repository held, the pushes followed, the list —
  trusts them as they are. A repository followed by a tool or held by an
  installation under way is refused 409 `{"error":"linked","tool":<that tool>}`
  — the page names the tool and opens it. No count of links is refused: a
  Chest follows as many repositories as its server holds tools (“Room for a
  new tool”). `POST /api/github/links/delete` forgets the link; it,
  `POST /api/github/links/auto` and `POST /api/github/links/check` belong to whoever
  runs the link's tool — owner, admins, its builder; 404 for an unlinked
  repository, 403 for another tool. `GET /api/github` gives the state (`none` /
  `installed` + account / `unavailable`: GitHub not configured /
  `unreachable`: central unreachable), the links (all of them for whoever
  administers; for a member, their own and those of the tools they build)
  and, per link, the latest registry build, a version put in place from
  another source under way or failed (`install`:
  `fetching|building|installing|failed`, cause in words) and the latest
  round trip (commit, `fetching|staged|failed`, cause in words). An
  installation from a repository not linked yet is an attempt (“Failed
  installations”, `GET /api/installation/attempts`), never a link.
- **Webhook** `POST /github/events` **on the central**, public: neither
  session nor origin, body ≤ 1 MiB, `X-Hub-Signature-256` checked in
  constant time against the app's secret — bad signature: 401 and nothing
  else; signed: 202 whatever it says. `installation` (`created` records the
  account, `deleted` forgets the link) and `push` only. A push is mapped from
  its `installation.id` → Chest(s), then **relayed over the control
  channel** (`nodelink`, pinned mTLS like `prepare`/`start`):
  `POST /github/push {repository, branch, sha}` (`githublink.Push`, without
  the installation, which stays on the central) ≤ 4 KiB, 202 as soon as the
  node has it, 404 on a node without a link. Three attempts in two minutes
  (0 s, 30 s, 90 s), then the push is abandoned and logged. The node then
  does what it already did: link found → commit tarball → registry; unknown
  branch → nothing. The commit's manifest must still give the name it gave
  the link (`Link.Named`); the build is filed under the linked tool's name.
  **Central stopped = pushes wait**; “Check now”
  (`POST /api/github/links/check`) rereads the head and builds with the token
  alone: the fallback when a webhook was lost.
- **Lab**: the fleet central runs on the workstation
  (`fleet-central/central.json`, `opening.json` with lab `github.api/web/ca`),
  the node is its `ready` server under a relay token written by the
  preparation, its `target.json` is its control target; the SSH tunnel
  brings `localhost:8447` from the VM back to the workstation.
  `tests/lab/service/lab-github-linux.py` plays GitHub in the VM for the
  already created app: an installation page that rings the central and sends
  back to its `/github/setup` with the ticket and the code of the
  installing user (alice for the organization acme, bob for his own
  account), the code exchange, `GET /user`, `GET /user/installations` and
  the revocation of user tokens, `POST /lab/code/<user>` for the forged
  returns the proof makes, tokens minted against the central's JWT, verified
  for real (RS256 in Python, public key read by `cryptography` or
  `openssl`), refused unless narrowed to reading and serving only the
  repositories they name, a repository
  `acme/todo` whose tarball is `todo.tar.gz` (the exported server test bench,
  named `todo`, its manifest narrowed to its roles and its database:
  `prepare-source-archive.mjs`) repackaged under `acme-todo-<sha>/` with git's
  global header, and `POST /lab/push`, which advances the branch by one
  commit — a file added, the tool's version changed (“Version: vn” on its
  team page), and with `?widen=1` the public part requested in `chest.json`
  — and rings the central.

### Catalogue

The catalogue is the GitHub organization `chest-by-argentic`: one **public**
repository per tool, with no GitHub App or account, and no file delivered to
customers — the Chest **discovers** the catalogue by reading the
organization. Installing is **a decision** of the owner: the access
displayed, approved, and the Chest fetches, builds and installs on its own.

- **Discovery** (`chest/catalogue`, `Source.Tools`): `GET
  {api}/orgs/chest-by-argentic/repos?type=public&per_page=100` (at most a
  hundred repositories), then, per public repository with a simple name,
  `GET /repos/{org}/{name}/commits/{default branch}` (the pinned commit: the
  head at the time of discovery) and `GET
  /repos/{org}/{name}/contents/chest.json?ref={commit}` (base64 content, at
  most 16 KiB, read by `sourcefile`). A repository without a `chest.json`, or
  whose manifest cannot be read, is not a tool — the SDK
  (`chest-by-argentic/Chest-SDK`, public, without a manifest) is therefore
  never listed, by construction; two repositories naming the same tool make
  none; at most sixteen tools, sorted by name. The entry:
  `{name, permissions, roles, role_labels}` of the manifest at that commit,
  `repository`, `commit`, `title` and `description` (the manifest's,
  otherwise the repository name with an initial capital and its description,
  one line of at most 300 characters), `icon` and `preview` (types of the
  images the manifest names, read at the same commit by
  `GET /repos/{org}/{name}/contents/chest/<file>?ref={commit}`, checked like
  those of an archive; an image that is missing or is not one leaves the
  entry without it). The images live in
  `installation/catalogue/pictures/<name>.icon|preview`, replaced in one
  block at each discovery, served by `GET /api/catalogue/{name}/icon|preview`
  (`icon_url`, `preview_url` of the entry) without asking GitHub anything;
  the approval ignores the presentation. Client: that of `common/download`
  (TLS ≥ 1.2, 30 s, three HTTPS redirects, 1 MiB per JSON response),
  `Accept: application/vnd.github+json`, `User-Agent: Chest`, **no token**.
- **Cadence**: nothing at startup, nothing in the background, no button.
  Discovery happens when the owner opens the Tools page (`GET /api/catalogue`)
  and the last one is more than **24 h** old; otherwise the last one is
  served. It is kept on disk, `installation/catalogue/discovery.json`
  (0600, `{"version":1,"at","tools"}`, reread and revalidated at startup by
  the rules of a server package — public part, own policy, capabilities and
  network egress (`Tool.valid`); an invalid kept discovery is not read, and
  the catalogue discovers again —: a restart does not rediscover). A
  discovery that fails keeps the previous one (served, with its date);
  without any, the page says “catalogue unavailable”, and a new look retries
  at most once per minute. Cost: 1 + 2 × repositories anonymous calls per
  day and per Chest, far from GitHub's anonymous limit. The page says
  “Catalogue seen on <date>”.
- **What the owner approves**: `GET /api/catalogue` (owner only, 403 otherwise)
  returns `{state: ready|unavailable, discovered, tools}`; each entry carries
  its `approval` = hex SHA-256 of the canonical JSON
  `{"name","repository","commit","permissions","roles"}` (this order,
  without spaces), its state
  `available|fetching|building|installing|installed|failed`, the cause in
  words and the registry build when there is one.
  `POST /api/catalogue/install {name, approval, as?, replace?, open_public?}`
  finds the entry in the latest discovery (never a call to GitHub) and
  recomputes the `approval` — the owner approves exactly what was shown to
  them; an entry that has changed since (another commit at the head) is
  refused (409) —, refuses an unknown name (404), a tool installed or in
  progress (409), and responds 202: everything else happens in the
  background.
- **Reading the code**: `GET {codeload}/{org}/{name}/tar.gz/{commit}` (fixed
  host `codeload.github.com`, **no token**), same client (32 MiB), in the
  private folder `installation/catalogue/` (one download at a time),
  validated by `sourcearchive` (GitHub's top-level directory removed).
- **Intent**: the archive enters the lot D registry with
  `sourcebuild.Intent{Install, Approved{name, permissions, roles}}`; the
  registry refuses (`ErrMismatch`, “the code does not declare what the
  catalogue announces”) an archive whose `chest.json` says something other
  than the manifest published at that commit — nothing is built that could
  not be installed — and records `install: true` in `status.json`. A
  catalogue build is never an offer of “Add a tool”; a catalogue name (from
  the latest discovery) is reserved, except to the tool that bears that name
  and follows a repository since a replacement (neither an archive nor a
  linked repository takes it); a fixed package offer bearing that name is
  hidden, only the catalogue installs it (the package's offline build
  remains the code's fallback).
- **Installation**: the portal waits for the end of the build
  (`Ledger.Ended`), rereads the built manifest (`Package`), compares it
  again with the entry, then follows the ordinary installation path
  (`InstallPackage`, 60 s) under the single installation lock, after
  rechecking the owner; the outcome is written to `status.json`
  (`installed: true` or `reason`, `Ledger.Installed`). In memory, the portal
  keeps only a job in progress or a failure from before the registry (read
  refused); after a restart, a build that is ready and not installed reads
  “installation interrupted” and is decided again. The Tools page follows
  Downloading… / Building… / Installing… / Installed, with the log; a tool
  already installed under this name reads “installed”, with its version in
  service. When a discovery names a commit more recent than the one the
  version in service comes from (known origin only: a version of unknown
  origin is never said to be older), the page offers “Update Notes (commit
  abc1234)”, with what the entry asks for in addition; the same decision
  (`POST /api/catalogue/install`, at the fingerprint of the new entry) fetches,
  builds with the intent to update and puts into service — see “Updating a
  tool”.
- **Lab**: `node.json` can name `portal.catalogue_source: {api, codeload,
  ca}`; `node-files` takes them as `catalogue_api`, `catalogue_codeload`,
  `catalogue_ca`, all together; the `await.json` of a waiting server takes
  them as `catalogue_api` and `catalogue_codeload` (HTTPS origins, together,
  like `acme_directory` and `name_server`: nothing in service) and writes
  them into the `node.json` of the opened Chest under `ca.pem`, the roots
  retained for that server.
  `tests/lab/service/lab-github-linux.py` is also the organization: public
  repositories `notes` and `mismatch` (the tree of `todo.tar.gz`, the server
  test bench with a narrowed manifest, whose `chest.json` bears the tool's
  name, at a commit of its own) and `web` (the tree of `web.tar.gz`, the
  whole exported server test bench, with a public part),
  `GET /orgs/chest-by-argentic/repos`, `/repos/…/commits/main`,
  `/repos/…/contents/chest.json`, and codeload — the `mismatch` archive
  requesting the public part that its published manifest does not request.
  In `--organisation-only NAME TARBALL` mode (opening proof), it is only the
  organization, without app or central: a repository `testweb` whose tree is
  the output of `export-store.mjs testweb` (the manifest there carries the
  tool's title, description and icon), served to the Chest opened on the
  VM's loopback.

## Contract map

The contract — a tool is a web server (decision of 24 September 2026,
`01_produit/98_travail/tools-and-sdk.md` in the company folder). What is
delivered of it is described in the sections above; this section gives its
map, then what remains to be done.

### The principles

- One tool per host of its own (`<tool>.<chest>.<domain>`, plus
  `<tool>-chest.<chest>.<domain>` for a server's members part), never under
  the origin of the portal or the provider; one OIDC client per team host,
  none on the public host.
- Deny by default, rights computed server-side, manifest approved by a
  human, manifest difference stated in words at each version; the SDK makes
  things easier, it is not the boundary.
- Rootless Podman, read-only file system, capabilities dropped,
  `no-new-privileges`, fixed limits; build by the Chest's recipe
  (`chest/sourcebuild`), never by a `Containerfile` from the archive.

### What exists

- **Manifest** `chest.json`, `"chest": "0.5"`, the version of the tool
  contract it needs (“Application contract”; published with every rule in
  the SDK's `contract/`, judged by `chest check`, the Chest's validator in
  WebAssembly): `name`,
  presentation, `roles` (from strongest to weakest; owner, admins and
  builders come in with the first) and their labels `role_labels`
  (presentation, never approved), `public`, `csp` (`"tool"`: the public part
  sends its own policy; a permission), `capabilities` (`database`, `sealed`, `files`,
  `members`, `members.email`, `members.groups`, `notifications`, `ai` with its key `ai`,
  `realtime`; each a permission), `realtime` (its channels and feeds, the
  Chest's rules, never a permission), `emits` (event types, each with its
  sentence and its fields' kinds; each a permission), `receives`
  (`member.*`, with `members`, and event types; each a permission), `network` (32 entries or `["*"]`, each a permission;
  widening is a new permission), `env` (expected names, never values),
  `build` (`node`, `npm ci`, `start`, `port`, `static`). Unknown or
  duplicate keys refused, 16 KiB.
- **Front end** (“Server tools”): one server, two hosts — the public part on
  the tool's host, closed at installation, `/chest` on its team host with the
  `Chest-Member` assertion (read by the SDK's `member(request)`), the
  “Access removed” page, static files on both hosts, `/_chest/` guarded by
  the Chest (photos, code step, signed file links). The container is
  reachable only through the front end: the assertion's signature is a
  second defense.
- **Container** (“Server tools”): `podman run` of the manifest's `start`
  behind the Chest's launcher, `PORT` set, no network at all, 256 MiB by
  default (512 or 1024 at the choice of the owner or an admin) and 1 CPU,
  reached through the launcher's unix socket; supervision (60 s to respond,
  restart with increasing delay), versions without downtime. What the Chest
  offers the tool goes through carriers (`chest/carrier`) that **the Chest
  opens towards the container** in `/run/chest` — the direction proven under
  SELinux —, never through an internal network: declared network egress
  (`egress.sock`), database (`database.sock`), Chest API (`api.sock`).
- **Services** (“Server tools”) and their SDK (repository
  `chest-by-argentic/Chest-SDK`, without dependencies):

| Capability | SDK | Chest side |
|---|---|---|
| (always) | `member(request)` | `Chest-Member` assertion on the team host; `null` elsewhere |
| (always) | `chest.organization.name`, `chest.timeZone`, `chest.language`, `chest.currency`, `chest.today()`, `chest.tool.teamUrl`, `chest.tool.publicUrl` (`chest.ts`) | `CHEST_ORGANIZATION`, `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, `CHEST_CURRENCY`, `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` at each start, every server tool awake started again when one changes; the zone is also its database role's `timezone` |
| (development) | `chest check` (`@argentic/chest-check`, a devDependency: `check/src/cli.ts`, bin `chest`) | the Chest's validator (`cmd/chest-check`) in WebAssembly, `check/check.wasm.gz`, written with `contract/contract.json` by `scripts/build-contract.mjs`; nothing reached |
| (variables) | `process.env` | Variables tab; `DATABASE_URL` and `PG*` refused to a tool that has a database |
| `network` | `fetch`, `node:http(s)` via `HTTP(S)_PROXY` | Chest proxy, log, Network tab |
| `database` | `databaseUrl()` | a PostgreSQL database and a role of the tool's own in the tools cluster; `migrations/*.sql` run before a version's switchover, recorded in `chest_migrations`; a failure keeps the version in service; size measured, shown |
| `sealed` | `seal`, `sealMany`, `open`, `openMany`, `isSealed` (`sealed.ts`, `CHEST_API`) | values sealed under the tool's key, kept sealed in its database; opened for the member of a request (`Chest-Opener`) who has the tool and one of the value's roles, in its context; every open journaled, the owner's totals; shown “Sealed” everywhere else; every version approved by the owner or an admin |
| `files` | `put`, `get`, `stat`, `list`, `move`, `delete`, `url` (thumbnail, download), `uploadUrl` (`files.ts`, `CHEST_API`) | the tool's private files in its Compartment, 32 MiB per object and 1 GiB unless `files` in the manifest asks otherwise (up to 512 MiB and 100 GiB), 10,000 objects; `url` signs a 15-min link served by the team host; `uploadUrl` authorises one browser upload straight to the Chest (single use, 15 min); thumbnails of images; the Storage view and its journal. `uploadUrl(folder, {public: true, types})` a visitor's upload of the public part, its type recognised by content, paced per visitor, private to the members; `StorageFull` when the server's disk is full. Public files are not built |
| `members`, `members.email`, `members.groups` | `members.list`, `get`, `lookup`, `groups.list` (`members.ts`, `CHEST_API`) | the members who have the tool now, by identifier, name, photo, role and groups; their addresses with `members.email`; every group of the Chest with `members.groups`; 600 calls a minute |
| `notifications` | `notify`, `broadcast`, `withdraw`, `badge.set`, `badge.setMany` (`notifications.ts`, `CHEST_API`) | badges on its tile and items in the members' inboxes, inside the Chest — to some, to everyone who has the tool, or to groups or roles, each in their language; quotas per tool; each member receives them by mail as they chose (the Chest's service, not the tool's) |
| `realtime` | `publish`, `send`, `online`, `presence` (`realtime.ts`, `CHEST_API`); in the browser `connect` (`realtime-client.ts`, the one module of the SDK for a page) | the Chest's hub: the pages' connections on `/_chest/realtime` of the team host and of a draft's, the manifest's channels and their rules, membership tables read on the tool's database, feeds turned from its rows at commit, presence, backfill and replay from the change log, session renewal; the tool asleep meanwhile |
| `ai` | `ai.chat` (whole or streamed), `embed`, `models`, `usage` (`ai.ts`, `CHEST_API`) | the Chest's AI gateway: the owner's OpenRouter key and the Chest's aliases, the tool's monthly cap and the Chest's, reserve then settle, a usage journal without content; the key never in the container |
| `receives: ["member.*"]` | `events.handle`, `verify`, `acknowledgeErasure` (`events.ts`) | the members' lifecycle posted, signed, to its `/chest-events` through its launcher, at least once with an id; the erasures it acknowledges |
| `emits`, `receives: [<type>]` | `events.emit`, `events.handle` (`events.ts`, `eventrules.ts`; the cause passed by itself inside a handler) | what it emits checked against its declaration and written for every linked tool; what other tools emit posted, signed, to its `/chest-events` with its source and who may see it, in order per subject, at least once with an id; failed deliveries kept for an admin to send again |
| `schedules` | `schedules.handle`, `verify` (`schedules.ts`; the signed delivery shared with events, `signed.ts`) | each run posted, signed, to its `/chest-schedules` at its times on the Chest's clock, the tool woken, at least once with an id, journaled on its overview |

  Typed errors: 403 `capability_not_granted`, 413 `too_large`, 429
  `quota_exceeded` and `rate_limited`, 503 `unavailable`, for sealed values
  `MemberRequired`, `NotAllowed`, `SealedInvalid`, `SealedLocked`,
  `SealedLost`, and for AI
  `AiCapReached`, `AiUnavailable`, `AiModelNotAllowed`, `AiRefused`
  (`client/src/errors.ts` in the SDK).
  For a tool's own tests, the SDK's `testing` module signs assertions like
  the Chest's (`signAssertion`, `withMember`) and plays its API in the
  test's process (`fakeChest`: the Chest's organization, zone and language,
  members, groups, files, badges and
  notifications, erasure acknowledgments, AI answers — whole or streamed,
  a cap, a paused gateway —, with the same bounds and errors;
  `deliver` delivers a member's or a tool's event and `run` a run of a
  schedule, signed as the Chest signs them; `emitted` lists what the tool
  emitted, checked against the `emits` it is given).
- **A server tool's page**: Overview (including the space used: database and
  files), Access, Deployments, Logs, Data (the database), Settings — General,
  Public (including custom domains, for whoever administers the Chest),
  Variables, Network.
- **Names** (“Tool names”): a tool's name is the identifier of its data
  (database, files, variables, access). Name chosen at installation;
  **replacing the source** (another repository, a fork) creates a version
  like any other under the same name, hence the same data; **deleting**
  removes the tool and its data and frees the name.
- **Roles**: member < builder < admin < owner; builder status is per tool
  (“Identities and authorizations”, “Who runs what”): its tools only —
  deployments and logs, rollback, variables, access and roles, public part,
  network, space. It does not open: domain, deletion, approval of a new
  permission, appointing other builders.

### What remains (target)

- **Build through the proxy**: `npm ci` still goes through the open network,
  outside the declared egress.
- Then, in product order: `member.aliased` (moving one tool's data to
  another Chest); a builder's own view of the erasures to confirm by hand;
  mail to the public from tools (a booking recap, a quote, a receipt),
  later: an SDK `mail` send backed by a connector to the company's own
  provider, never sent by Argentic; the Chest receives no mail
  ([spec](../../../01_produit/02_specs/mail.md) § 5);
  runtime logs and state in the tool's page; per-tool bounds adjustable by an
  admin; dated archive of a deleted tool's data, and renaming; `python`
  modelled on `node`.

## Languages

The central and every Chest are English first and speak French; English is
the default and the source of every catalogue. The server decides the
language of a page, never the browser alone:

- **A Chest** speaks to each member in their own language, else in its
  default one, else English (`common/i18n.First`; `access.Policy.LanguageOf`).
  The member's is `access.Member.Language`: chosen at sign-up — the account
  creation page of a Chest offers the languages before its fields
  (`register.ftl`, the provider's `kc_locale` links; the default one
  shown first; the realm's `locale` attribute is never a field of the
  form), the provider keeps it as the account's `locale` and tells
  it in the ID token (`locale` claim of the `profile` scope), and the first
  sign-in that tells it gives it to a member who has none
  (`Team.AdoptLanguage`, from `Admit`) — or in their profile
  (`POST /api/profile {operation: "language", language}`,
  `Team.SetLanguage`), after which the page sends the browser through
  `GET /language`: a sign-in with `kc_locale`, which the provider keeps for
  the account (its pages and its mails to them — the reset mail) and which
  comes back to the profile; the member of the session is not asked the
  sign-in code again for that round trip, nor for `/password`. A later
  `locale` from the provider never overrides the member's choice. The
  Chest's default is `access.Policy.DefaultLanguage` (absent is English).
  At opening it is the language the holder chose on the central with the
  Chest's name (`access.Spec.Language`, carried by the reservation), which
  is the owner's own too (`access.InitialPolicy`): the owner's account
  creation page is already in it. It is
  changed by the owner or an admin through the team operation
  `default-language` (`{operation: "default-language", language: "fr"}`;
  one the product speaks, naming nothing else) — Settings → General; the
  team view says it (`default_language`). It speaks to whoever has no
  language of their own: an invitation (its mail), the pages before anyone
  is known (the sign-in the portal starts without a session), a public
  host (which reads no session), a new member until they choose.
  `Portal.Language(r)` is the language of a request's member, else the
  default; the portal writes it on its document (`chest/portal/ui.go`:
  `<html lang>` of `assets/index.html`, a template), and so do its own
  pages: the end states of a login (`/login`, `refusal.go`), the code step
  and its mail (`code.go`, the member the code is for), the pages the
  Chest answers on a tool's host (`toolfront`: unavailable, access
  removed, sign-in required, refused, not found, not published, waking up,
  server full). A tool is
  told it too: the `language` claim of `Chest-Member` (the SDK's
  `member(request).language`), which the tool's private part speaks; a
  public part, which knows nobody, keeps its own switch.
- **The central** speaks the visitor's language: the one they chose with
  the switch at the foot of its pages (`POST /language`, kept a year in the
  cookie `__Host-language`, Secure, HttpOnly, SameSite=Lax, holding the tag
  alone), else `common/i18n.Negotiate` reads `Accept-Language` (bounded; by
  weight, a region counts for its language, English when none matches);
  its shell says `Vary: Accept-Language, Cookie`. The holder's choice of a
  language for their Chest proposes the page's.
- **The login** follows: `portal.Role.Language` gives the language of a
  request, and every login the shared core starts carries it as
  `ui_locales`. Every realm is imported with internationalization on,
  English by default, English and French supported (`providerbootstrap`);
  the login theme's wording is `messages_en.properties` and
  `messages_fr.properties`, hand-written key for key over Keycloak's own
  base messages of each language. A realm imported before is given them as
  `deploy/servers.md` says.
- **Mails**: a Chest asks the central for a template in the language of
  its recipient — the member's for a code, the default for an invitation
  (`language` in the relay request; one the product does not speak is
  refused). The reset mail comes from the provider through the SMTP door:
  the subject our email theme gives it is each language's own
  (`providertheme.ResetLanguage` reads them from the theme), and the
  central writes its own template in that one.
- **API**: error bodies stay English codes (`approval_required`,
  `quota_exceeded`…); the interfaces word them. The Chest's own runtime log
  lines (`stream: "chest"`) and build logs are English.

Where the words are: the interfaces keep their catalogues,
`chest/web/portal/src/i18n/{en,fr}.ts` and `central/web/site/src/i18n/{en,fr}.ts`
(a message is a string or a function of its values; `en.ts` is `as const`,
every other language `Catalogue<typeof en>`, which tsc refuses with a key
missing or one too many), with `common/web/i18n.ts` (the languages, the one
the document says, `plural` through `Intl.PluralRules`, `number` and `date`
through `toLocaleString` in that language). The servers' words are
`common/i18n` (`en.go`, `fr.go`: one `Messages` per language;
`TestEveryLanguageSaysEverything` refuses a missing word or a value the
English does not place).

**How to add a language** (German, `de`, for the example). Every step is
checked by a type or a test; nothing else names the languages:

1. `common/i18n`: `de.go` giving the whole `Messages` (as `fr.go` does),
   `German Language = "de"` in `i18n.go`, added to `Languages` and
   `catalogues` — `go test ./common/i18n` refuses a missing word. The
   realms of new Chests support it from then on (`providerbootstrap`
   reads `i18n.Languages`); an existing realm is given it as
   `deploy/servers.md` says for French.
2. `common/web/i18n.ts`: `'de'` in `languages`, `de: 'Deutsch'` in
   `languageNames` — every choice of a language (the central's switch and
   its opening form, Settings → General, the profile) lists it.
3. The interfaces: `chest/web/portal/src/i18n/de.ts` and
   `central/web/site/src/i18n/de.ts`, each typed `Catalogue<typeof en>`,
   registered in the `src/i18n/index.ts` beside them — `npm run
   check:types` refuses a key missing or one too many.
4. The login theme: `common/providertheme/login/messages/messages_de.properties`,
   key for key with `messages_en.properties`, and the email theme's
   `messages_de.properties` (`common/providertheme/email/messages`, a reset
   subject of its own) — `go test ./common/providertheme` compares the keys
   and refuses a subject another language has.
5. `npm run build:web`, then `npm run check`. The SDK needs no change: it
   reads any language tag in `Chest-Member`.


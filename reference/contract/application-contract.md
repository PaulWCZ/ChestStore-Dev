# Application contract — excerpt of the Chest's architecture

Snapshot of `docs/architecture.md` of the private Chest repository (sections “Application contract”, “Contract map”, “Languages”). See `reference/README.md`.

## Application contract

A tool is **an ordinary web server**, of any framework, that the
Chest builds from its code, runs and places behind its own front:
the `"version": 2` manifest (“Building from source”), the container,
the front and the services (“Server tools”), the map and what remains to
be done (“Contract map”, further down). The package declares `name`, an image
immutable by digest, `roles`, `public`, `csp`, `capabilities`, `network`,
`env` and `server: {port, static}`; what it asks for is a list of
permissions put into words at approval (`packagefile.Permissions`). Unknown
fields and duplicate JSON keys are refused. The approved digest binds
the examined bytes; it certifies neither their provenance nor their harmlessness. An
application cannot approve its own permissions. The inventory accepts
six tools; this lab ceiling does not define the commercial offers.

**A single contract: the server.** A tool is a web server (`"version": 2`);
the first contract (a worker connected by a private channel, an isolated frame) is
withdrawn and its code deleted. A manifest or package of another version,
or without a version, is refused: “version 2 expected: declare "version": 2”
(`sourcefile.ErrVersion`, down into the archive); a package has no
`permissions` list. A Chest always opens empty: the reservation names no
tool, and no recorded format — central reservation, `installation.json`,
control channel requests — has a key to name one (`app` or
`approval` are refused there like any unknown key; `migrate` rewrites the
earlier records, [servers.md](../deploy/servers.md)).

**Proposal and Builder.** Any member of the Chest can propose a package
(`chest/proposal`): its exact bytes are kept in a private file, nothing
is executed, registered with the provider or granted. Sixteen pending
proposals at most, two per member, one per tool name, 64 kept; beyond that,
the one decided longest ago (refused or installed, which no longer changes)
gives up its place — the author has read the decision, the installed tool is
in the Chest —, never a pending or approved proposal; an altered file makes
the whole list unavailable. A member sees only the status of their own; the
owner sees the author and the bytes to examine. Approving **is** an
ordinary installation: same bytes, same digest, always reserved to the
owner and admins. The author then becomes
Builder of the tool: a status written in the policy (`builds`), which
makes them run this tool and nothing else of the Chest (“Who runs what”,
above), and disappears with the member or the tool. The status is written when
the tool joins the Chest (`publish`: the team records the tool, writes its
Builder, then the binding becomes active): the tool never appears without
its author running it. A failure of the writing leaves the tool outside the
Chest and the proposal pending; approval is requested again and each
step already done has nothing left to do. Backup of pending proposals
remains to be delivered.

**A test tool in the repository.** `tests/apps/testweb` (“Server test
bench”, its `README.md` is its contract) exercises “Server tools”:
`node:http` only, a public part (`/`, the version in service,
`/api/whoami` which sees nobody there), the members part under `/chest` (name and
role read by the SDK's `member(request)`, notes written by `editor`, admins and
Builders), `/static/` served on both hosts, clean exit on `SIGTERM`.
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
the commit of the copied SDK. The exporter (`export-store.mjs`) reads this copy; the
store's tools carry the same copy under `packages/chest-client`. The same
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
of an archive is a linked GitHub repository or the catalogue (below); the
registry's `POST /api/builds` route remains the entry point for the labs — the Tools page
no longer offers archive upload.

- **Source manifest** `chest.json` at the root of the archive
  (`chest/sourcefile`): `name` and `roles` follow the rules of the package
  manifest — the same parser checks them —, and `build` says
  how to build (below, “Source manifest v2”). A manifest of another
  version, or without a version, is refused: “version 2 expected: declare
  "version": 2”.
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
- **Source manifest v2** (server tool): `"version": 2`, any other
  version refused. Fields `name`, `roles`, `public` (boolean: the tool has a
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
  `members` and `members.email` — the last only with `members` —
  (“Server tools”, Database, Files, Members); each is a
  permission, after `public` and before the network, in this order (“A PostgreSQL
  database of its own”, “The Chest keeps it; no other tool can
  reach it.”; “Keeps private files of its own, up to 1 GiB”, “Stored
  apart; shown only through a short-lived signed link.”; “Sees the name,
  photo, role and groups of the members who have access to it”; “Sees the
  email address of the members who have access to it”, both under People). With `files`,
  the optional key `files` asks the storage: `{"quota": "5 GiB",
  "maxObject": "100 MiB"}` (whole MiB or GiB; quota 100 MiB–100 GiB,
  object 1–512 MiB; any other key refused — `publicUploads` and
  `publicFiles` of the spec are not built); the permission is then
  `files:<quota>:<object>` (`files:5GiB:100MiB`, compact, canonical;
  the defaults stay `files`), stated “Keeps private files of its own, up
  to 5 GiB, 100 MiB per file”, and beyond a version that had less
  (`packagefile.Beyond`: larger quota or object). The pages state
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
  A refusal says why in one word (`sourcearchive.Refusal`, always
  `ErrInvalid`; `sourcearchive.Reason`): `no_manifest`, `no_package`,
  `no_lock`, `manifest`, `manifest_version` (a manifest of another version),
  `node_modules`, `link`, `too_large`, `picture`, `tree`, `archive`.
- **Generated recipe** (`chest/sourcebuild.ServerContainerfile`), never taken
  from the archive: `FROM <the package's pinned Node image>` (`runtime/base-image`,
  copy of `deploy/chest/base-image`, the package's only pin), `WORKDIR /app`, copy of
  `package.json` and the lock, `RUN ["npm","ci","--no-audit","--no-fund"]`, copy
  of the code, `RUN ["npm","run",<script>]` if `command` (exec form, without
  `--if-present`: a missing or failing script makes the build fail),
  `npm prune --omit=dev` and `chmod -R a-w,a+rX /app` (everything read-only, executables stay executable: busybox's `a=rX` removed their execute permission), **then** only the
  launcher: `COPY .chest-build/launcher.mjs /chest/launcher.mjs` and
  `chmod a=r` — outside the tool's tree, nothing it installs or
  builds replaces it —, for a tool that has a database its **migrations**:
  the files of `migrations/` at the root of the archive
  (`^[0-9]{4}_[a-z0-9_-]{1,64}\.sql$`, regular files, 256 at most,
  1 MiB each, 8 MiB in total, UTF-8 text without NUL — a refused file makes
  the build fail with its reason), checked by the Chest and copied
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
  --cpu-shares=256 --ulimit=nproc=256:256 --cap-drop=ALL
  --security-opt=no-new-privileges`, ten minutes at most, output kept as a
  log (256 KiB, the end), readable during the build.
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

  **The network stays open during the build** —
  npm downloads the dependencies from the registry; it is the only moment when a
  tool's code reaches the network without going through its declared egress, which
  applies only at run time — known limitation: each `RUN` (the installation
  and its scripts, the author's build command) has the default network of
  rootless `podman build`, hence the Internet and, depending on pasta, the
  host's addresses (loopback services, the hosting provider's metadata); a
  build through the proxy, which would let only the npm registry be reached,
  is to come; a tool's run-time container keeps
  `--network=none` (`chest/runtime`). `--layers` keeps the
  `npm ci` layer between two builds with the same lock: the build cache.
  The built image is checked to be present, then bound to the package manifest
  written by the Chest (`{"name","image","permissions","roles"}`; for a
  server `{"version":2,"name","image","roles","public","csp","capabilities","network","server":{"port","static"},"env"}`,
  `public` written only if true, `csp` and `capabilities` only
  if declared, `network` only if
  declared, `env` only if it names variables, `static` always).
- **Build registry** `installation/builds/<name>/`: `source.tar.gz`,
  `build.log`, `status.json` (`building|ready|failed`, source fingerprint,
  dates, image, cause; for a server `contract: 2` and `server`, its
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
  (text) and `GET /api/installation` for whoever runs the tool — a Builder
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
  `CHEST_API=1` when it keeps files or reads its members (below). The tool's variables are neither
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
  time, 60 new ones per minute (burst of 30), a tunnel closed after 5 min
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
  `serverRunner`: 403 for a member or the Builder of another tool, 404
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
  then once a day, and never read. A tool that writes nonstop
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
  its Builders), as in Vercel. **API** `GET
  /tools/{app}/logs?after=<cursor>&limit=<n>` (`chest/portal/tool_logs.go`,
  `serverRunner`: 403 for a member or the Builder of another tool, 404
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
    `temp_file_limit` 256 MiB; database `OWNER` the role, `TEMPLATE template0`,
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
    keeps running, and the reason (“migration 0003_broken.sql failed (SQLSTATE …);
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
    `standard_conforming_strings=on`, `bytea_output=hex`, ISO dates in UTC,
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
      the tool takes its reader with it (`Drop`). Limit: a `SECURITY
      DEFINER` function of the tool runs as the tool, by design.
    - **Reading**: in a `READ ONLY` transaction (a function that writes,
      called by a `SELECT`, fails: `read_only`), as the reader. Overview: the
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
  - **More routes**: `GET /files/{name}?stat` → the object (with
    `width`, `height` for a JPEG, PNG, GIF or WebP the Chest measured at
    the put); `POST /files/move` `{"from","to"}` → the object at its new
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
    `invalid_body` beyond). The token, base64url(JSON `{tool, name, max,
    types, exp, id, boot}`) `.` HMAC-SHA256 under the node key with its
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
    another tool or run); the type must be one it accepts (415
    `type_refused`); the first 512 bytes of a JPEG, PNG, GIF, WebP,
    AVIF, HEIC, BMP, TIFF, PDF, ZIP, gzip, 7z, RAR, tar, bzip2, xz or
    CAB must be of its type (400 `type_mismatch`); then the bounds of a
    put (413, 429). The read deadline of the request is 30 minutes.
    201 `{name, type, size}`. SVG, HTML and scripts are served as
    downloads, never inline (`shown`). No antivirus scan.
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
  manifest `capabilities: ["members"]`, and `"members.email"` — which
  requires `members` — for the addresses; each its own sentence at approval):
  who has the tool, read from the policy at every call (`Team.Directory`,
  once the node's portal holds the team — until then, and whenever the policy
  cannot be read, 503 `unavailable`, never an older answer), on the same
  carriers as the files. **Who**: exactly the members who have the tool at
  that moment — a grant, a group, open to all, or running it (owner,
  admins, its builders: `Team.Access`); a member without access answers as an
  identifier that does not exist. A member is `{id, first_name, last_name,
  name, photo, role, admin, builder, groups, email?}`: `photo` the path of
  their picture on the team host (`/_chest/members/{id}/photo?v=<rev>`),
  `role` the one the tool declares (`access.ToolRole`) — both `null` for none
  —, `groups` those that give the tool, `email` only with `members.email`;
  never the provider, the account, an invitation or anything of sign-in.
  Routes: `GET /members?after=&limit=&q=&role=&group=` → `{"members": […],
  "next"}`, ordered by name (lowercase, accents removed) then identifier,
  `limit` 100 by default and 500 at most, `next` an opaque cursor (the
  base64url of the last key and identifier), `q` (64 characters at most) the
  start of a first name, a last name or a name — or an address with
  `members.email` —, case and accents aside; `GET /members/{id}` → the member,
  404 `member_not_found`; `POST /members/lookup {"ids"}` (200 at most, each
  once) → `{"members", "former": [{id, name?, status: "former"}], "unknown"}`
  — a former member is one who left after having the tool
  (`Policy.Former`), `{id, status: "erased"}` once their data was erased; `GET /groups` → `{"groups": [{id, name, members}]}`,
  the groups that grant the tool. Errors `{"error": code}`: `invalid_query`,
  `invalid_id`, `invalid_body` 400, `capability_not_granted` 403,
  `member_not_found`, `not_found` 404, `rate_limited` 429 (600 calls a
  minute per instance, `Retry-After`), `unavailable` 503. The addresses in
  the `Chest-Member` assertion follow the same permission
  (`Binding.MemberEmail`).
- **Notifications** (`chest/toolnotify`, `chest/inbox`,
  `cmd/chest/application_members.go`, manifest `capabilities:
  ["notifications"]`, its own sentence at approval): the counter a tool shows
  one member on its tile (a badge) and the items it puts in their inbox,
  inside the Chest only (no mail, no push). Only the members who have the
  tool at the time of the call (`Team.Directory`, as for the members; 503
  `unavailable` while it cannot be read) receive anything; the others, and
  unknown identifiers, are `skipped`. Routes: `PUT /badges/{id} {"count"}`
  and `PUT /badges {"badges": [{member, count}]}` (500 at most, each member
  once) → `{"set", "skipped"}`, a count 0 to 9,999, 0 clearing it,
  idempotent; `POST /notifications {"members", "title", "body"?, "path"?,
  "key"?}` → `{"delivered", "skipped"}` (1 to 500 identifiers, each once,
  in the order given): `title` 1 to 80 characters, `body` 280 at most, both
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
  A member who muted the tool counts as delivered, nothing kept: the tool
  never learns who muted it. Quotas per tool (`toolnotify.Quotas`, one per
  node, in memory — a restart starts them over —, fixed windows): 1,000
  recipients kept an hour, 100 items per member a day (muted and replaced
  ones included; one recipient over it refuses the call), 600 badges a
  minute; 429 `quota_exceeded` with `Retry-After`; a refused call changes
  nothing. Errors `invalid_body`, `invalid_id`, `invalid_count`,
  `invalid_title`, `invalid_text`, `invalid_path`, `invalid_key` 400,
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
    removed its items and badges.
  - **In the pages** (`chest/portal/inbox.go`,
    `chest/web/portal/src/components/Inbox.tsx`): `GET /api/inbox` →
    `{items (the newest 100: id, tool, title, body?, url, created, read),
    unread, badges: [{tool, count}], senders: [{tool, muted}]}`; `POST
    /api/inbox/read {ids | all}`, `/api/inbox/unread {ids}`,
    `/api/inbox/mute {tool, muted}` answer the same. The bell of the header
    carries the unread count (a black pill, 99+), read with each page and
    every 30 s while the page is seen, and when it is seen again; its panel
    (400 px, full screen on a phone) lists the items beside the icon and the
    name of their tool, a black dot while unread, the body on two lines;
    an item opens its link in a new tab and is marked read; its menu marks
    it unread (or read) and mutes its tool; “Mark all as read”. The badge
    is a pill on the tile of the home only (the tools list manages tools);
    Profile → Notifications lists the senders, “Notify me” each.
  - **For agents**: `GET /api/v1/inbox` (the same, without the senders)
    and `POST /api/v1/inbox/read {ids | all}` (a write), with a member's
    token — narrowed to tools, only theirs —; the MCP server's `inbox`
    tool reads it, fenced as untrusted data. An agent never sends a
    notification: tools do.
- **Member lifecycle events** (`chest/toolevents`,
  `cmd/chest/application_events.go`, manifest `"receives": ["member.*"]` —
  only that value, only with `members`; the permission
  `receives:member.*`, its own sentence at approval, “Is told when the
  members who have access to it change or leave”): `member.updated {id,
  changed: ["name" | "photo" | "role" | "groups" | "email"]}` (`email` only
  with `members.email`; a version that gains or loses it is no address
  change), `access.revoked {id}` (the member stays in the Chest),
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
  ever saw (4,096 at most) and its **outbox** — the events not yet
  accepted, 1,000 at most (beyond, the oldest go and the tool is out of
  sync). A tool that does not receive events is observed all the same (who
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
  10 min, 30 min, then every hour (no instance in service: again in 5 s,
  not counted), for 72 hours; then the event goes and the tool is **out of
  sync** — `out_of_sync` in `GET /api/tools` (and `/api/v1/tools`) for
  whoever runs it, “Out of sync” on its tile and its row, “Out of sync
  since …” on its overview — until an
  instance of it starts again: it reconciles by listing its members at its
  start. **At least once, same id**: an event leaves the outbox only once
  accepted, the file written before the next; a node that stops keeps it,
  and its next run delivers what waits at once, with the id it had. No
  order is guaranteed. A tool removed takes its file with it.
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
- **Storage view** (`chest/portal/tool_files.go`, `cmd/chest/application_files.go`;
  tab Storage in the Data family, beside Database, `chest/web/portal/src/storage.ts`,
  `components/ToolStorage.tsx`): for whoever runs a server tool whose
  version in service declares files (`serverRunner`: 403 for a member or
  the Builder of another tool; 404 `no_files` otherwise), `Cache-Control:
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
    Builder); 400 `quota_not_offered`; journaled `quota`.
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
    {size, used, free}}` (the disk of the installation, `statfs`); Team →
    Settings → Storage shows it, each tool leading to its Storage tab.
  - **Agents**: `GET /api/v1/tools/{app}/files` (query), `GET
    …/files/journal`, `POST …/files/url`, `POST …/files/delete` (a
    write: refused to a read-only token), the same rights and journal
    (the token's name in it); MCP `files_list`, `files_link`,
    `files_delete` (two steps).
- **Storage** (`GET /api/tools/{app}/storage`, `chest/portal/tool_storage.go`,
  `cmd/chest/node_storage.go`), for whoever runs the tool (`serverRunner`:
  403 for a member or the Builder of another tool, 404 for a removed tool or
  an absent tool, `Cache-Control: no-store`) → `{"database": {"bytes",
  "measured", "limit"} | null, "files": {"bytes", "objects", "quota",
  "max_objects", "max_object", "asked", "set", "choices"} | null, "memory": {"mib", "choices"}}`: the size of the
  database as measured (`bytes` null as long as it has never been measured),
  file usage against its limits; a part the version does not
  declare is null; the tool's memory and the possible choices
  (“Memory”, below) — this is how its Builder reads it. The
  Overview of a server tool turns it into a “Storage” row: “Database: 12 MB
  · Files: 3 MB of 1 GiB”, a part beyond its limit underlined and
  stated (“over 1 GiB”, “full”); nothing without the route.
- **Visible database** (`chest/portal/tool_database.go`,
  `cmd/chest/application_console.go`, engine: “Console” above):
  for whoever runs the tool (`serverRunner`/`scope.Runs`: the
  owner, an admin, its Builder, data included; 403 for a
  member or the Builder of another tool), only a server tool whose
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
  owner and the admins choose it, a Builder reads it.
  - **At rest**: `apps/<tool>/memory` in its Compartment (the number and
    a line ending, 0600, written aside then renamed, directory synced;
    absent for 256); read at each instance start along with the
    variables — a choice applies at the next start; an altered file
    or a link: the instance does not start (the one in service continues). It
    follows the Compartment: kept when one version replaces another (update,
    rollback, source replaced), removed with the tool, in the nightly
    archive with the Compartments.
  - **Capacity guard** (a guard, not a guarantee): a choice that
    gives the tool more than it has is refused if the sum of the memories of
    all the node's server tools, this choice included, exceeds the node's
    budget: `MemTotal` from `/proc/meminfo` minus 1.5 GiB kept for the Chest,
    Keycloak and PostgreSQL (`toolmemory.Reserve`). A decrease or the same
    choice always passes; outside Linux (development machine), no
    budget and no guard. Nothing is measured of what the other processes
    actually consume, and an installation does not go through the guard: a
    new tool gets 256 MiB.
  - **Route**: `POST /api/tools/{app}/memory` `{"mib"}` (strict JSON) → 204;
    `serverRunner` then owner or admin only (403 for a member
    and for any Builder, even of this tool), 404 for a removed tool or an
    absent tool, 400 outside the choices, 409 “not enough memory on the node for its
    tools” beyond the budget, 503 otherwise. Reading is through Storage
    (`GET /api/tools/{app}/storage`, `memory`), putting into service is as for the
    variables (`POST /api/tools/{app}/redeploy`).
  - **Page**: the “Settings” tab of a server tool has a
    “Resources” section: the “Memory” row, a 256 / 512 / 1024 MiB list
    for the owner and the admins, the value alone for a Builder;
    after a choice, “Applies at the next start.” with
    “Restart to apply”.
- **Supervision** (`cmd/chest/application_server.go`): one instance at a
  time per version, put into service as soon as it answers anything at all to
  `GET /` (60 s at most), taken out when it stops — the tool is then the
  Chest's 503 page —, restarted after 1 s, 2 s, 4 s… 5 min at most, the delay reset
  to zero after ten minutes in service: supervision never gives up. At
  node startup, a server is waited for 60 s then left to its
  supervision; it does not decide the node's state. The lock on the
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
  server's timeouts, per request), `Upgrade` refused (501). Toward the tool:
  path, query and `Host` unchanged, every `Chest-*` header removed, the
  `__Host-chest` cookie removed, `X-Forwarded-Proto: https` and `X-Forwarded-Host`
  set by the Chest (the client's removed). Toward the browser: every
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
  the `toolfront.DefaultCSP` policy (`default-src 'self'`, `script-src
  'self'`, `frame-ancestors 'none'`…): two policies combine, the tool
  can only tighten. It forbids any inline script — including those of
  Next.js hydration. A version approved with `csp`
  (`Binding.OwnCSP`, `Visit.OwnPolicy`) replaces this policy with its
  own: to a response that carries a non-empty `Content-Security-Policy`,
  the Chest adds only `toolfront.FloorCSP` (`frame-ancestors 'none';
  base-uri 'self'; object-src 'none'` — no fetch directive,
  no script blocked); a response from this tool without a policy, or with an
  empty policy, receives `DefaultCSP`: the widening is the tool's
  policy, never its absence. Its policy is then its responsibility —
  approved like a permission (“Next.js on Chest”, below, for a
  nonce-based policy).
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
    label's version is the shape of the claims: a reader of another shape
    refuses it), `iss` = origin of the team host (or of its custom address),
    `aud` = tool name, `iat`, `exp` = `iat` + 60 s; `sub` (the member
    identifier), `given_name`, `family_name`, `name` (first and last name,
    otherwise the local part of the address), `picture` (the path of the
    photo on the team host, `/_chest/members/{id}/photo?v=<rev>`, empty
    without a photo), `role` (`access.ToolRole`: the role of the assignment as
    long as the tool declares it, otherwise the first — owner, admins and
    Builder without an assignment included; empty for a tool without roles),
    `admin`, `builder`, `groups` (the groups that give the tool to the
    member), and `email` only for a version that holds `members.email`. A
    `Chest-Member` coming from the client is removed beforehand. **Reading
    by the SDK**: `member(request)` (the SDK's `client/src/member.ts`,
    vendored copy `tests/sdk/chest-client`) takes a Node or Web request,
    reads exactly the `chest-member` header, derives the key from the text of
    `CHEST_TOKEN` as above, requires the JWS header
    `{"alg":"HS256","typ":"JWT"}`, compares the signature in constant time,
    `aud` equal to `CHEST_TOOL`, `iat`/`exp` within 5 s and the shape of the
    claims (`sub` an `mbr_` identifier, `groups` `grp_` identifiers), and
    returns `{id, firstName, lastName, name, photo, role, isAdmin,
    isBuilder, groups, email?}` (`photo` and `role` `null` when empty) or
    `null` — never an error. Its test reads a vector signed by
    `toolfront.Assertion`: changing one means changing the other.
  - **Static files** of the build (`static`, `/_next/static/`
    by default), in `GET`/`HEAD`: relayed to everyone, with no session read, with no
    identity or cookie from the Chest.
  - **Everything else** → 302 to the public host, same path and same query.
  - Relayed responses: `frame-ancestors 'none'` (`toolfront.TeamCSP`)
    added only when the tool sends no policy; the tool's own
    policy is its own.
- **Public part closed at installation**: the manifest only says
  that the tool has one (permission `public`, “Its pages will be visible to
  the whole Internet” at approval). Opening or closing it is a decision of whoever runs
  the tool — owner, admin, the tool's Builder —, kept in the
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
  - **Routes**, for whoever runs the tool (owner, admin, Builder of
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
  (owner, admin); a Builder is refused like a member (403) and does not
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
    `toolfront.DefaultCSP`), through the same `servePublic`. The tool's
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
  in the certificate (requested then awaited), the team host's client,
  then the two hosts; `Announce` requests a server's two names as soon
  as a build says it is a server (the catalogue does not know it: the proper
  name alone).
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
everything the Chest keeps about it: binding, access and Builders in the
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
  certificate for a chosen address is requested when its build is ready (the
  registry announces the name under which it files it), then awaited by the
  installation, like that of any tool.
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
  Builders; the version left behind remains the previous one, a rollback
  (`/api/installation/rollback`) restores it. A decision reserved to the owner
  and admins (403 for a Builder or a member; a member never proposes a
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
  comes from a linked repository — auto-deploy is the Builder's rule; only
  the owner and admins link repositories; a version that asks for **more**
  remains an offer, with the difference in words (“Also asks for: …”), until
  the owner or an admin decides — the tool's Builder puts into service what
  asks for nothing more, never more (403 `approval_required`). The catalogue
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
  page said so —, nothing more for a Builder: 403
  `{"error":"approval_required"}` otherwise) and `POST /api/installation/rollback
  {app}` — both wait up to 45 s for the change under way (a version just put
  in service holds the installation lock while the one it replaced drains and
  stops), 409 `installation busy` beyond; `POST /api/catalogue/install` of an installed tool follows the same
  rule; `GET /api/installation` gives per offer `current`, `version`, `previous`
  (image, approval, permissions, roles, commit, date) and `more` (what the
  offer asks for in addition); `GET /api/catalogue` gives `version`, `previous`,
  `update` and `more` of a tool in service.

### Removing a tool

“Remove tool”, in the settings of an installed tool's page, is **a
decision of whoever administers the Chest** (owner or admin, never a
Builder), and it is **final**: reinstalling later starts from scratch
(decision of 23 September 2026). Route: `POST /api/installation/uninstall {app}`
— 204; 404 for a tool that is not running; 409 while a build of the tool is
running, the catalogue is installing it or the installation lock is held;
403 for a member.

- **What is removed**: the container (stopped and removed, without a grace
  period); the Compartment and its data (all of `apps/<id>/`: package,
  previous version, `state`, variables, memory); **every access** of the
  tool in the policy (`Team.RemoveApplication`: direct access, group access,
  opening to everyone, and the Builder status of its proposers); the linked
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
- **The name is free immediately**: no more binding, access, Builder, build,
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
  webhook secret, `key_file`, client id), written by
  `set-github-app-linux.sh` without displaying anything, RSA key read at
  startup and kept in memory. Without this block, Chests receive “GitHub not
  configured” (503) and nothing else changes. Installations are recorded in
  `github/installations.json` (`installation_id ↔ chest, member`, GitHub
  account): **one installation per Chest member**, a member can link again,
  the same installation can serve several members or several Chests of the
  same account; a record without a member is unreadable. Removing a Chest
  (`enrollment-release`) forgets its installations and its pending tickets —
  no push is relayed to it any more, nor to a future Chest of that name —
  and uninstalls the app from accounts no other Chest uses; a return from
  GitHub with a ticket of that Chest no longer links anything (the ticket is
  rechecked when the link is recorded).
- **What a Chest asks of the central** (`/fleet/v1/github/*`, the server's
  relay token, server `ready`, the Chest being the one in the fleet record —
  never the one the call names; each step names the member it concerns,
  `{member, owner}`, the subject as the Chest knows it): `github/ticket` →
  `{url}` (the app's installation page with a random `state` kept a quarter
  of an hour by the central, tied to this member of this Chest; at most 64
  pending tickets); `github/installation` →
  `{installation_id, chest, member, account}` or 404; `github/token` →
  `{token, expires_at}`, the member's installation token minted by the
  central (JWT RS256 with the app's key, `iss` = id, `iat` − 60 s,
  `exp` + 9 min, `POST /app/installations/{id}/access_tokens`);
  `github/forget` → 204, the member's installation is removed and, if no one
  is linked to it any more, the app is uninstalled from the account
  (`DELETE /app/installations/{id}` with the JWT; a silent GitHub is logged,
  not refused). The Chest keeps one client per member, with the token until
  one minute before it expires, and reads GitHub **directly** with it:
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
  the repositories are chosen, sends the member back to the central,
  `GET /github/setup?installation_id&setup_action&state`: the ticket is
  consumed (constant time), GitHub is queried about the installation
  (`GET /app/installations/{id}` with the JWT: it exists under the app, and
  on which account), the link is recorded, then 303 to `<Chest
  portal>/github/installed` — nothing secret in the address — and the Chest
  asks the central again what it knows (“GitHub connected: acme”) then
  brings back to “Add a tool” (`/tools/new`), open to any member, where
  the repositories of the connected account are listed: connecting one's
  GitHub is each member's business. A return without a ticket (“Redirect on
  update”) sends back to the already linked Chest. `GET /api/github` tells the
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
  already gives or that is not free, keeps the link and, the tool not being
  in service, **builds and installs it in this decision** (like the
  catalogue: `sourceRun`, followed on the installation screen); a tool in
  service receives the build as its next version. The same branch linked
  again, with nothing in service for its tool, resumes the decision instead
  of refusing it. `POST /api/github/links/delete` forgets the link; it,
  `POST /api/github/links/auto` and `POST /api/github/links/check` belong to whoever
  runs the link's tool — owner, admins, its Builder; 404 for an unlinked
  repository, 403 for another tool. `GET /api/github` gives the state (`none` /
  `installed` + account / `unavailable`: GitHub not configured /
  `unreachable`: central unreachable), the links (all of them for whoever
  administers; for a member, their own and those of the tools they build)
  and, per link, the latest registry build, the installation of its tool
  under way or failed before the registry held a build (`install`:
  `fetching|building|installing|failed`, cause in words — what the portal
  follows from the decision on, the fetch of the repository included) and
  the latest round trip (commit, `fetching|staged|failed`, cause in words).
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
  back to its `/github/setup` with the ticket, `GET /app/installations/1`, a
  token minted against the central's JWT, verified for real (RS256 in
  Python, public key read by `cryptography` or `openssl`), a repository
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

- **Manifest** `"version": 2` (“Building from source”): `name`,
  presentation, `roles` (from strongest to weakest; owner, admins and
  builders come in with the first) and their labels `role_labels`
  (presentation, never approved), `public`, `csp` (`"tool"`: the public part
  sends its own policy; a permission), `capabilities` (`database`, `files`,
  `members`, `members.email`, `notifications`; each a permission), `receives`
  (`["member.*"]`, with `members`; a permission), `network` (32 entries or `["*"]`, each a permission;
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
| (variables) | `process.env` | Variables tab; `DATABASE_URL` and `PG*` refused to a tool that has a database |
| `network` | `fetch`, `node:http(s)` via `HTTP(S)_PROXY` | Chest proxy, log, Network tab |
| `database` | `databaseUrl()` | a PostgreSQL database and a role of the tool's own in the tools cluster; `migrations/*.sql` run before a version's switchover, recorded in `chest_migrations`; a failure keeps the version in service; size measured, shown |
| `files` | `put`, `get`, `stat`, `list`, `move`, `delete`, `url` (thumbnail, download), `uploadUrl` (`files.ts`, `CHEST_API`) | the tool's private files in its Compartment, 32 MiB per object and 1 GiB unless `files` in the manifest asks otherwise (up to 512 MiB and 100 GiB), 10,000 objects; `url` signs a 15-min link served by the team host; `uploadUrl` authorises one browser upload straight to the Chest (single use, 15 min); thumbnails of images; the Storage view and its journal. Later: public files under `public/` and public uploads (`publicFiles`, `publicUploads`, spec'd, not built) |
| `members`, `members.email` | `members.list`, `get`, `lookup`, `groups.list` (`members.ts`, `CHEST_API`) | the members who have the tool now, by identifier, name, photo, role and groups; their addresses with `members.email`; 600 calls a minute |
| `notifications` | `notify`, `withdraw`, `badge.set`, `badge.setMany` (`notifications.ts`, `CHEST_API`) | badges on its tile and items in the members' inboxes, inside the Chest; quotas per tool |
| `receives: ["member.*"]` | `events.handle`, `verify`, `acknowledgeErasure` (`events.ts`) | the members' lifecycle posted, signed, to its `/chest-events` through its launcher, at least once with an id; the erasures it acknowledges |

  Typed errors: 403 `capability_not_granted`, 413 `too_large`, 429
  `quota_exceeded` and `rate_limited`, 503 `unavailable` (`client/src/errors.ts` in the SDK).
  For a tool's own tests, the SDK's `testing` module signs assertions like
  the Chest's (`signAssertion`, `withMember`) and plays its API in the
  test's process (`fakeChest`: members, groups, files, badges and
  notifications, erasure acknowledgments, with the same bounds and errors;
  `emit` delivers an event signed as the Chest signs it).
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

- **Events between tools**: `emit` and `"emits"` in the manifest, links
  between tools set by an admin, on the delivery engine the members' events
  use (`chest/toolevents`: outbox, backoff, signed deliveries to
  `/chest-events`); the same engine for scheduled tasks and jobs.
- **Build through the proxy**: `npm ci` still goes through the open network,
  outside the declared egress.
- Then, in product order: `member.aliased` (moving one tool's data to
  another Chest); a builder's own view of the erasures to confirm by hand;
  `email` (mail connector, lot G);
  runtime logs and state in the tool's page; per-tool bounds adjustable by an
  admin; dated archive of a deleted tool's data, and renaming; `python`
  modelled on `node`.

## Languages

The central and every Chest are English first and speak French; English is
the default and the source of every catalogue. The server decides the
language of a page, never the browser alone:

- **A Chest** speaks its own language: `access.Policy.Language` (absent is
  English), changed by the owner or an admin through the team operation
  `language` (`{operation: "language", language: "fr"}`; one the product
  speaks, naming nothing else) — the portal's Team page, Settings. The team
  view says it (`language`). The portal writes it on its document
  (`chest/portal/ui.go`: `<html lang>` of `assets/index.html`, a template),
  and so do its own pages: the end states of a login (`/login`,
  `refusal.go`), the code step (`code.go`), the pages the Chest answers on a
  tool's host (`toolfront`: unavailable, access removed, sign-in required,
  refused, not found, not published). A member's own preference is not
  there yet.
- **The central** speaks the visitor's language: `common/i18n.Negotiate`
  reads `Accept-Language` (bounded; by weight, a region counts for its
  language, English when none matches), and its shell says `Vary:
  Accept-Language`.
- **The login** follows: `portal.Role.Language` gives the language of a
  request, and every login the shared core starts carries it as
  `ui_locales`. Every realm is imported with internationalization on,
  English by default, English and French supported (`providerbootstrap`);
  the login theme's wording is `messages_en.properties` and
  `messages_fr.properties`, hand-written key for key over Keycloak's own
  base messages of each language. A realm imported before is given them as
  `deploy/servers.md` says.
- **Mails**: a Chest asks the central for a template in its language
  (`language` in the relay request; one the product does not speak is
  refused). The reset mail comes from the provider through the SMTP door:
  the subject our email theme gives it names its language
  (`providertheme.ResetSubject` then `en`/`fr`), and the central writes its
  own template in that one.
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
English does not place). Adding a language: a catalogue for each of these
surfaces and the theme, then its name in `common/web/i18n.ts`
(`languages`, `languageNames`) and in `common/i18n` (`Languages`,
`catalogues`) — the realms' supported languages follow `i18n.Languages`.


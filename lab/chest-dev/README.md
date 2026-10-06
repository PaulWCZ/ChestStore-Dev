# chest-dev — the studio's local Chest

`dev.mjs` runs one tool as a Chest of **contract 0.4** would, on this
machine — any tool that follows the contract (`npm ci`, `build.command`,
`build.start` with `PORT`), whatever its framework (Next.js, or Hono + React
built by Vite like `reference/perseus-starter`) — against the SDK working
copy's `fakeChest` (`sdk/`). `screens.mjs` takes screenshots, `audit.mjs`
runs axe-core, `flows/` are browser flows (`flows/lib.mjs`).

```sh
node lab/chest-dev/dev.mjs tools/private/tasks --reset            # npm run dev: https://127.0.0.1:4000/_dev
node lab/chest-dev/dev.mjs tools/private/tasks --prod --build     # npm ci if needed, build.command, build.start
node lab/chest-dev/dev.mjs tools/private/tasks --prod --sleep-after 10   # asleep after 10 s idle
sh lab/chest-dev/stop.sh 4000
(cd lab/chest-dev && npm test)                                    # the harness's own tests
```

PostgreSQL must run locally (`service postgresql start`; `DEV_DATABASE_URL`
names a superuser otherwise).

## Two hosts, the Chest's routing in front

As on a Chest, the tool has **two origins, over https**: the **team host**
`https://127.0.0.1:<port>` (4000) and the **public host**
`https://localhost:<port+2>` (4002) — two host names, so their cookies are
apart as on a Chest; the tool itself listens on `<port+1>` (`PORT`, plain
http, as behind the Chest's launcher), reached only through them. The
certificate is self-signed for both names (`cert.mjs`, made once with
openssl in `lab/chest-dev/.cert/`, not committed): the browsers of flows,
screens and audits accept it (`ignoreHTTPSErrors`), and the lab scripts
that call the harness from Node set `NODE_TLS_REJECT_UNAUTHORIZED=0` for
themselves. https because the SDK reads only https origins in
`CHEST_TEAM_URL` and `CHEST_PUBLIC_URL` (`chest.tool`, `chest.tools`), and
because `Secure` and `__Host-` cookies then behave as on a Chest. The front (`routing.mjs`, from
`reference/contract/application-contract.md` "Front", "Public host", "Team
host", and `reference/sdk/contract/README.md`) enforces the Chest's rules:

| Host | Request | Goes |
|---|---|---|
| team | `/chest`, `/chest/…` (any case) | to the tool with the `Chest-Member` assertion of the member chosen on `/_dev`. A method other than `GET`/`HEAD` needs `Sec-Fetch-Site: same-origin` and `Origin: <team host>`: **403** otherwise (a browser sends them; `fetch` from Node or curl does not) |
| team | `GET`/`HEAD` under a `build.static` prefix (`/_next/static/` when absent) | to the tool, to anyone, no member |
| team | `/_dev/…`, `/_chest/…` | the harness; the fake Chest's front (photos, files, uploads) |
| team | anything else | **302** to the public host, same path and query |
| public | `/chest…` | **302** to the team host |
| public | `GET`/`HEAD` under a `build.static` prefix | to the tool (static files are served on both hosts) |
| public | anything else | to the tool without identity when `"public": true`; **404** otherwise |
| both | a path not in its simple form (`//`, `.`/`..`, `\`, `%2F`, `%5C`, `%2E`, `%00`); `Upgrade` | **400**; **501** |

Toward the tool: path, query and `Host` unchanged, every `Chest-*` header
from the client removed, and `X-Forwarded-For`, `Forwarded` and
`X-Real-IP` too (never trusted: the Chest adds none), `X-Forwarded-Proto:
https` and `X-Forwarded-Host` set; on the public host, only with
`--visitor-address`, **`Chest-Visitor-Address`**, the address of the
connection the front accepted (proposal, SDK report §4.8: what
`visitors.address()` reads; here always `127.0.0.1`). **By default no
visitor is named, as on a contract-0.4 Chest today**: a public form's
bounds must hold with every visitor unknown (a cookie key, never one shared
"unknown" bucket). Toward the browser: the **CSP the Chest adds** — on the team host
`frame-ancestors 'none'` to an answer without a policy; on the public host
its default policy on every answer, or only the floor policy
(`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) beside the
tool's own non-empty one when `chest.json` says `"csp": "tool"` — and
every `Set-Cookie` named `__Host-chest`, carrying `Domain` or unreadable
removed.

**Every refusal is logged** (terminal and log, "front (team host): GET
/assets/app.css → 302 http://localhost:4002/assets/app.css: outside /chest
and build.static ["/_next/static/"]…", with the page that asked for it), so
a stylesheet or a script loaded outside the rules fails visibly — on the
team host of a private tool it ends in a 404 from the public host. A 302
from the team host is not logged for a tool with a public part (it is how a
visitor on the team host reaches it).

**Files' links and uploads are on the team host**, as on a Chest
(`/_chest/files/…`): the fake Chest signs them with `chest.api`, which the
harness sets to the team host's origin once the fake has started, while the
tool's `CHEST_API` stays the fake's own address (`http://127.0.0.1:<p>`,
where the SDK's calls go). A page's `<img src>` of a file is then
same-origin and the tool's `img-src 'self'` holds; the team host relays
`/_chest/…` to the fake. The harness's cookies (`dev_member`,
`dev_locale`) are the team host's; screens and audits set the public part's
`lang` on the public host too.

## Accessibility audit (`audit.mjs`)

With a tool running in the harness, `audit.mjs` runs axe-core
(`axe-core` 4.10.3, `package.json`) on every screen of the tool's
`docs/screens.json` — each shot's actions replayed, so a dialog or a form
behind a click is checked too — at desktop and phone width (or the sizes a
shot's `only` names), light and dark, in the look the shot names. It prints
each rule broken and where, and exits 1 when one is.

```sh
node lab/chest-dev/audit.mjs tools/private/tasks --port 4000            # WCAG 2.0 and 2.1, A and AA (the default)
node lab/chest-dev/audit.mjs tools/private/tasks --port 4000 --wcag22   # the same, plus WCAG 2.2 AA
```

- **The default** runs axe's rules tagged `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa`: what every tool's audit in `PROGRESS.md` and the tools'
  READMEs means by "axe: 0".
- **`--wcag22`** adds the tag `wcag22aa`. In axe-core 4.10.3 one rule
  carries it: `target-size` (WCAG 2.2 success criterion 2.5.8, *Target
  Size (Minimum)*: a pointer target at least 24 by 24 CSS pixels, or spaced
  so that a 24 px circle around it touches no other). axe leaves that rule
  off unless asked; asking by its tag runs it (checked on 6 October 2026
  with two 10 px buttons: a violation). axe does not test every WCAG 2.2
  criterion — focus not obscured, dragging movements, consistent help,
  redundant entry and accessible authentication are for a person to check.

## The tool's process

- **Its environment is the Chest's, and nothing of the shell's**: `PORT`,
  `CHEST_API`, `CHEST_TOKEN`, `CHEST_TOOL`, `CHEST_ORGANIZATION`,
  `CHEST_TIME_ZONE`, `CHEST_LANGUAGE`, `CHEST_CURRENCY`, `CHEST_TEAM_URL`,
  `CHEST_PUBLIC_URL` (with a public part), `DATABASE_URL` (with
  `database`), `NODE_ENV`, `PATH`, `HOME` — plus the variables the tool
  declares in `"env"` of `chest.json`, taken from the shell when it has them
  (as the owner sets them in the Chest). `NODE_OPTIONS`, proxies and the
  rest of your shell never reach it.
- **How it runs**: `npm run dev` when its `package.json` has a `dev` script
  (`NODE_ENV=development`), else — and always with `--prod` — `build.start`
  (`npm start` or `npm run <script>`, as an argument vector) on the last
  `build.command` output: `.next/BUILD_ID`, or the newest file of `dist/`
  or `build/`. The harness refuses to serve a build older than the sources
  (`--stale-ok` to accept it); `--build` runs `npm ci` (when `node_modules`
  is missing or older than the lock) and `build.command` first.
- **Its own process group**: stopping it stops everything it started (a
  dev server's watcher, a worker), as a container's end does; it never
  outlives the harness. A crash is followed by a start again after 1 s,
  2 s, 4 s… (5 min at most), as the Chest's supervision does.
- **Its log**: stdout and stderr, line by line (a line cut at 4 KiB), with
  the Chest's own lines beside them (started, in service after N ms,
  asleep, woken, the front's refusals, schedule runs), in
  `lab/chest-dev/logs/<tool>/<run>.log` (one file per harness run; not
  committed) and on **`/_dev/logs`** (all, stdout, stderr or the Chest's;
  `/_dev/logs.txt` as text): what an operator would read in the tool's Logs
  tab. Log what explains a failure; never a secret, a token or personal data.
- **Sleep** (`--sleep-after <seconds>`; the Chest: 15 minutes): when no
  request or delivery reached the tool for that long and none is in flight,
  it is stopped (`SIGTERM` to its group, 30 s at most) — "Asleep: no visit
  for N s" —, and the next request, event or schedule run wakes it: a
  request is held until the tool's port answers (60 s at most, then 503); a
  browser opening a page waits 2 s, then gets the Chest's "Waking up
  <title>…" page (503, `Retry-After: 2`, a refresh in 2 s, no script).
  `/_dev/sleep` and `/_dev/wake` play it by hand. A tool that keeps
  something in process memory loses it here — as on a Chest.

## Schedules

`"schedules"` of `chest.json` (contract 0.4; a studio tool's
`chest.proposals.json` is still read) are listed on `/_dev` with **Run
now**: `POST /_dev/schedule` (`name`) wakes the tool and has the fake Chest
post the run, signed with the SDK's own signing, to the tool — on SDK 0.4.x
`POST /chest-schedules` with `Chest-Schedule` and `{id, name, scheduledAt,
attempt}`. A name that is not in `chest.json` is 400. The run and the
status the tool answered go to the log.

## The Chest it plays

| | Value | The tool reads |
|---|---|---|
| Organization | Atelier Martin | `CHEST_ORGANIZATION` → `chest.organization.name` |
| Time zone | `CHEST_TIME_ZONE` of the shell, else `Europe/Paris` | `CHEST_TIME_ZONE` → `chest.timeZone`, `chest.today()` |
| Language | `en` | `CHEST_LANGUAGE` → `chest.language` |
| Currency | `EUR` | `CHEST_CURRENCY` → `chest.currency` |
| Hosts | team `http://localhost:<port>`, public `http://localhost:<port+2>` | `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` (only with a public part) → `chest.tool.teamUrl`, `chest.tool.publicUrl`; `CHEST_TOOL_URLS` (studio) |

The names before 0.3.0 (`CHEST_COMPANY`, `CHEST_TIMEZONE`, `CHEST_LOCALE`)
never reach the tool, even when the shell has them. A zone that is not an
IANA zone stops the harness before anything starts.

**The database is in the Chest's zone.** As a Chest does, the harness makes
the zone the `TimeZone` of the tool's database sessions
(`alter database t_<tool> set timezone to '<zone>'`), at every start and
before migrations and `seed/sample.sql` run: `current_date` and
`now()::date` are `chest.today()`, in a seed too. It logs
`database t_<tool>: sessions in <zone>, current_date <day>`. To check a
tool's dates when the Chest's day and UTC's differ, start it with a zone
far from UTC: `CHEST_TIME_ZONE=Pacific/Pago_Pago` (UTC−11: another day
from 11:00 UTC) or `Pacific/Kiritimati` (UTC+14: another day from 10:00 UTC
until midnight UTC). `DATABASE_URL` stays `…?sslmode=disable`.

## The cast

Seven members (`cast.mjs`, the same ids as the tools' seeds and tests), each
with `language` (the one the Chest speaks to them: fr for Camille, Inès,
Léa, Nora; en for the others) and `timeZone` — **everyone in the Chest's
zone** by default, because flows compare dates and times with Paris's.
Paul Lefèvre (`mbr_paulaaaa…`) is a former member who left three weeks ago
(`leftAt`).

- `--elsewhere`: Tom Walker works from `America/Montreal` (six hours behind
  Paris: his day differs from the Chest's every evening).
- `docs/dev.json` of a tool: `{"roles": {"ines": "approver"}, "timeZones": {"lea": "Asia/Tokyo"}}`.
- Groups (Office, Sales, Tech): as on a Chest where the tool is open to
  everyone, **no group gives the tool** — `member(request).groups` and
  `members.*.groups` are `[]` — every group they are in when the tool holds
  the capability `members.groups` (`chest.proposals.json` `"capabilities":
  ["members.groups"]`, the 0.5 name). `--granting-groups`:
  the three groups give the tool (the former behaviour; a tool given to
  groups).

## Flags

`--port N` (the team host; the tool runs on N+1, the public host on N+2;
the database is `t_<tool>` on 4000, `t_<tool>_<N>` on another port, so two
harnesses of one tool never share it),
`--visitor-address` (name the visitor, the proposal), `--reset` (a new database), `--seed` (load `seed/sample.sql` again),
`--empty` (never load it), `--prod` (serve the last `build.command` output
with `build.start`; refused when sources are newer, unless `--stale-ok`),
`--build` (with `--prod`: `npm ci` when needed and `build.command` first),
`--sleep-after <s>` (put the tool to sleep after that many idle seconds),
`--tools a,b` (tools installed beside it), `--linked` (an
admin linked them for the events they receive), `--elsewhere`,
`--granting-groups`, `--no-mail-connector` (the company's mail provider is
not connected: `mail.available()` says `not_connected` and `mail.send`
throws `Unavailable`, as on a Chest whose owner has not connected it yet;
**Delivery** › Mail `ready` connects it).

**Mail.** A tool mails people **outside** the company only (owner's
decision, 2026-10-06): the outbox shows each message with the Reply-To it
went with (`contact@atelier-martin.test`, the company's address set with
the connector, unless the tool gave its own). The Chest receives no mail:
there is no mailbox and no way to send an email to the tool. Members are
told with notifications; the bell shows each one's French words too
(`translations.fr`).

## /_dev — the controls

Every control is a form POST that answers `303` (to `back`, or `/_dev`) when
done, `400` for a value the Chest would not give. From a flow:

```js
import { control, open } from "./lib.mjs";
const { page, origin, publicOrigin } = await open(port, "hugo", { language: "fr" });
await control(page, origin, "member", { member: id("hugo"), timeZone: "Asia/Tokyo" });
```

| Control | Form | What it plays |
|---|---|---|
| `/_dev/as` | `member`, `language` (`en`, `fr`, or empty: theirs; `locale` still read) | who is signed in on `/chest`. Cookies `dev_member`, `dev_locale` |
| `/_dev/member` | `member`, `timeZone` (IANA) | what the member chose in the Chest: `members.get/list/lookup` answer the `timeZone`; the next request's assertion carries it. No event: the Chest sends none. The tool's `members.lookup` may keep an answer for a minute |
| `/_dev/delivery` | `mail` (`ready`, `not_connected`, `suspended`, `quota`), `webhooks` (`ready`, `suspended`) | whether the Chest delivers: `mail.available()`, `webhooks.available()` and `send` follow it |
| `/_dev/deliver` | `type`, `data` (JSON), optional `occurredAt` (ISO 8601), `source` (a tool's name; the type's first part by default), `id` (`evt_…`: the same event twice) | an event of another tool, as the Chest delivers it |
| `/_dev/event` | `member`, `type` (`member.updated`, `access.revoked`, `member.removed`, `member.erased`) | a member's lifecycle; `member.removed` and `member.erased` move them to the former members with `leftAt` now |
| `/_dev/group` | `member`, `group`, `action` (`add`, `remove`) | an admin moves someone in or out of a group (`member.updated`, `group.changed`) |
| `/_dev/schedule` | `name` (a schedule of `chest.json`) | a run now, signed, to `POST /chest-schedules` (the tool woken first) |
| `/_dev/sleep`, `/_dev/wake` | — | the Chest puts the tool to sleep (its process stops), or wakes it |
| `/_dev/bounce` | `message` (`msg_…` of the outbox), `permanent` (`1`, `0`) or `complained=1` | the message could not be delivered (or was marked as spam): `mail.status(id)` says `bounced` (`complained`), a permanent one or a complaint suppresses the address. Nothing is posted to the tool |
| `/_dev/webhook`, `/_dev/feed`, `/_dev/check`, `/_dev/theme`, `/_dev/clear` | as before | webhooks' answers, calendar addresses, checks, the company's look, the bell |

Every delivery a control makes (an event, a run, a check) wakes a
sleeping tool first, as the Chest does. `GET /_dev/logs` (and
`/_dev/logs.txt`) shows the tool's log.

**Flows and the two hosts.** The team host is `https://127.0.0.1:<port>`
(`origin`), the public host `https://localhost:<port+2>` (`publicOrigin`);
a link a tool writes is one of them. A public page lives on `publicOrigin`; a GET of
a public path on the team origin is redirected there (302), so
`page.goto(origin + "/")` still lands on it, but a URL comparison
(`waitForURL(origin + "/…")`) must use `publicOrigin`. A `POST` to `/chest…`
from `page.request` (no fetch metadata) is refused 403 as on a Chest: post
from the page (a form or the page's `fetch`).

The page shows: the member signed in (language, zone) and the Chest
(organization, zone, today); the bell, badges and files; **Members'
choices** (each member's zone);
**Delivery** (with mail or webhooks); **Events between tools**, each
published event as `<code>type</code> <small>{data}</small>` (the line flows
match) followed by its `key` and `occurredAt`; the former members with the
day they left.

**`quota`** sets the fake's `mail.perDay` to 0 (the harness keeps the options
object the fake reads at each call): `mail.available()` answers `quota`, and
sends are refused (429 `quota_exceeded`) once one message went out that day —
the fake lets the day's first message through (`FakeDelivery` has no
`quota` state; noted for the SDK report). Webhooks have no quota state.

## Unmigrated tools

A tool still on 0.3.0-studio.16 starts and serves, but: everyone reads it in
English (it reads the assertion's `locale` claim, now `language`),
`chest.company()` is `""` (it reads `CHEST_COMPANY`), and its zone is its
own default, Europe/Paris (it reads `CHEST_TIMEZONE`) — while its database
is in `CHEST_TIME_ZONE`. Migrate it first (`sdk031-changes`).

## Known

- `next dev` appends a block to a tool's `AGENTS.md` at each start unless
  its `next.config.ts` says `agentRules: false` (the template does): do not
  commit that change.
- Behind the harness, pages served by `next dev` were seen not to hydrate
  (buttons inert). The front refuses WebSocket upgrades (501) as the Chest
  does, so `next dev`'s hot reload cannot connect; its development files
  outside `/_next/static/` are refused too. Flows that click run with
  `--prod`.
- `npm run dev` of a Vite tool (`reference/perseus-starter`'s
  `scripts/dev.mjs`) rebuilds into `dist/` and restarts the server: its
  files are served under `build.static` like the production ones.

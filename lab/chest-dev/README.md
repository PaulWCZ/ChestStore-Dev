# chest-dev — the studio's local Chest

`dev.mjs` runs one tool as a Chest would, on this machine, against the SDK
working copy's `fakeChest` (`sdk/`, **0.3.1-studio.1**: the released Chest SDK
0.3.0 plus the studio's proposals). `screens.mjs` takes screenshots,
`audit.mjs` runs axe-core, `flows/` are browser flows (`flows/lib.mjs`).

```sh
node lab/chest-dev/dev.mjs tools/private/tasks --reset        # http://localhost:4000/_dev
node lab/chest-dev/dev.mjs tools/private/tasks --prod --reset # after npm run build
sh lab/chest-dev/stop.sh 4000
```

PostgreSQL must run locally (`service postgresql start`; `DEV_DATABASE_URL`
names a superuser otherwise).

## The Chest it plays

| | Value | The tool reads |
|---|---|---|
| Organization | Atelier Martin | `CHEST_ORGANIZATION` → `chest.organization.name` |
| Time zone | `CHEST_TIME_ZONE` of the shell, else `Europe/Paris` | `CHEST_TIME_ZONE` → `chest.timeZone`, `chest.today()` |
| Language | `en` | `CHEST_LANGUAGE` → `chest.language` |
| Currency (studio) | `EUR` | `CHEST_CURRENCY` → `chest.currency` |
| Hosts (studio) | the harness's origin, both | `CHEST_TEAM_URL`, `CHEST_PUBLIC_URL` (only with a public part), `CHEST_TOOL_URLS` |

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
  `members.*.groups` are `[]`; a member's groups are
  `members.groups.of(id)` (with `"groups": "read"`). `--granting-groups`:
  the three groups give the tool (the former behaviour; a tool given to
  groups).

## Flags

`--port N` (the tool runs on N+1), `--reset` (a new database), `--seed`
(load `seed/sample.sql` again), `--empty` (never load it), `--prod` (serve
the last `npm run build`; refused when sources are newer, unless
`--stale-ok`), `--tools a,b` (tools installed beside it), `--linked` (an
admin linked them for the events they receive), `--elsewhere`,
`--granting-groups`.

## /_dev — the controls

Every control is a form POST that answers `303` (to `back`, or `/_dev`) when
done, `400` for a value the Chest would not give. From a flow:

```js
import { control, open } from "./lib.mjs";
const { page, origin } = await open(port, "hugo", { language: "fr" });
await control(page, origin, "member", { member: id("hugo"), mailPreference: "digest" });
```

| Control | Form | What it plays |
|---|---|---|
| `/_dev/as` | `member`, `language` (`en`, `fr`, or empty: theirs; `locale` still read) | who is signed in on `/chest`. Cookies `dev_member`, `dev_locale` |
| `/_dev/member` | `member`, `mailPreference` (`all`, `digest`, `none`), `timeZone` (IANA) | what the member chose in the Chest: `members.get/list/lookup` answer `mailPreference` (absent for `all`) and `timeZone`; the next request's assertion carries the zone. No event: the Chest sends none for these. The tool's `members.lookup` may keep an answer for a minute |
| `/_dev/delivery` | `mail` (`ready`, `not_connected`, `suspended`, `quota`), `webhooks` (`ready`, `suspended`) | whether the Chest delivers: `mail.available()`, `webhooks.available()` and `send` follow it |
| `/_dev/deliver` | `type`, `data` (JSON), optional `occurredAt` (ISO 8601), `source` (a tool's name; the type's first part by default), `id` (`evt_…`: the same event twice) | an event of another tool, as the Chest delivers it |
| `/_dev/event` | `member`, `type` (`member.updated`, `access.revoked`, `member.removed`, `member.erased`) | a member's lifecycle; `member.removed` and `member.erased` move them to the former members with `leftAt` now |
| `/_dev/group` | `member`, `group`, `action` (`add`, `remove`) | an admin moves someone in or out of a group (`member.updated`, `group.changed`) |
| `/_dev/webhook`, `/_dev/receive`, `/_dev/bounce`, `/_dev/feed`, `/_dev/schedule`, `/_dev/check`, `/_dev/theme`, `/_dev/clear` | as before | webhooks' answers, incoming mail, bounces, calendar addresses, scheduled runs, checks, the company's look, the bell |

The page shows: the member signed in (language, zone) and the Chest
(organization, zone, today); the bell, badges and files; **Members'
choices** (each member's email preference and zone, and what their
preferences held back: `chest.held`, `{reason, member, subject, text}`);
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
  (buttons inert; the front does not relay WebSocket upgrades, which may be
  the cause — not established). Flows that click run with `--prod`.

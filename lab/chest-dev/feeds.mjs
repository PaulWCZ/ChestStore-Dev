// The Chest's side of realtime feeds (SDK 0.7.0, chest.json "realtime"), on
// the tool's database: "the Chest installs the triggers after the
// migrations: no SQL to write" (sdk/README.md, "realtime"). Here a trigger
// per table named in "feeds" (and per membership table of a channel joined
// by {table, key, member}) sends each written row's needed columns with
// pg_notify; the harness LISTENs and hands each committed row, in commit
// order, to the fake Chest (realtime.commit), which publishes it on the
// feed's channel to the pages joined there. A membership row deleted takes
// its member out of the channel at once (realtime.removed).
//
// What the harness owns in the tool's database: the schema chest_realtime
// (its function, owned by the superuser, executable by the tool's role) and
// one trigger, chest_realtime, on each of those tables. A notification is
// at most 8000 bytes: a row whose columns are longer is sent with the
// columns that place it only (its first column, the channel's and the
// membership's), as the Chest sends a row too long to be carried whole
// (EventInfo.partial; the fake's commit does not mark it).
import postgres from "postgres";

const namePattern = /^[a-z_][a-z0-9_]{0,62}$/u;
const quote = name => `"${name}"`;

// What each table's trigger sends: the columns that place a row (kept when
// it is too long), then the others a feed carries.
export function plan(realtime = {}) {
  const tables = new Map();
  const of = table => {
    if (!namePattern.test(table)) throw new Error(`chest.json realtime: ${JSON.stringify(table)} is not a table name`);
    if (!tables.has(table)) tables.set(table, { key: new Set(), rest: new Set(), membership: [] });
    return tables.get(table);
  };
  for (const feed of realtime.feeds ?? []) {
    const t = of(feed.table);
    const columns = feed.columns ?? [];
    if (columns[0]) t.key.add(columns[0]);
    const variable = /\{([a-z_][a-z0-9_]*)\}$/u.exec(feed.channel ?? "")?.[1];
    if (variable) t.key.add(variable);
    for (const c of columns) t.rest.add(c);
  }
  for (const channel of realtime.channels ?? []) {
    const join = channel.join;
    if (!join || Array.isArray(join) || typeof join !== "object") continue;
    const t = of(join.table);
    t.key.add(join.key);
    t.key.add(join.member);
    t.membership.push({ key: join.key, member: join.member });
  }
  for (const [table, t] of tables) {
    for (const c of [...t.key, ...t.rest]) if (!namePattern.test(c)) throw new Error(`chest.json realtime: ${JSON.stringify(c)} of ${table} is not a column name`);
    for (const c of t.key) t.rest.delete(c);
  }
  return tables;
}

// startFeeds installs the triggers and listens. onRow(table, op, row) for
// each committed row of a feed's table; onRemoved(table, key, member) when a
// membership row went. Answers {member(table, key, member): bool — who is
// in a membership table now —, tables, close()}.
export async function startFeeds({ superUrl, database, role, realtime, onRow, onRemoved, log = () => {} }) {
  const tables = plan(realtime);
  const url = new URL(superUrl);
  url.pathname = "/" + database;
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql.unsafe(`create schema if not exists chest_realtime;
revoke all on schema chest_realtime from public;
create or replace function chest_realtime.notify() returns trigger language plpgsql set search_path = pg_catalog as $fn$
declare
  kept int := TG_ARGV[0]::int;
  names text[] := TG_ARGV[1:];
  item jsonb := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);
  picked jsonb;
  was jsonb := null;
  message text;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into picked from jsonb_each(item) where key = any(names);
  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into was from jsonb_each(to_jsonb(OLD)) where key = any(names[1:kept]);
  end if;
  message := jsonb_build_object('table', TG_TABLE_NAME, 'op', lower(TG_OP), 'row', picked, 'old', was)::text;
  if octet_length(message) > 7900 then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into picked from jsonb_each(item) where key = any(names[1:kept]);
    message := jsonb_build_object('table', TG_TABLE_NAME, 'op', lower(TG_OP), 'row', picked, 'old', was, 'partial', true)::text;
  end if;
  perform pg_notify('chest_realtime', message);
  return null;
end
$fn$;
revoke all on function chest_realtime.notify() from public;
grant usage on schema chest_realtime to ${quote(role)};
grant execute on function chest_realtime.notify() to ${quote(role)};`).simple();
  const installed = [];
  for (const [table, t] of tables) {
    const [found] = await sql`select to_regclass(${"public." + table}) as id`;
    if (!found?.id) {
      log(`! realtime: no table ${table} in the tool's database (chest.json "realtime"): its rows reach no page`);
      continue;
    }
    const args = [String(t.key.size), ...t.key, ...t.rest].map(a => `'${a}'`).join(", ");
    await sql.unsafe(`create or replace trigger chest_realtime after insert or update or delete on public.${quote(table)} for each row execute function chest_realtime.notify(${args})`);
    installed.push(table);
  }
  // Who is in each membership table now: read once, then kept from the
  // notifications.
  const members = new Set();
  const entry = (table, key, member) => `${table}\u0000${key}\u0000${member}`;
  for (const [table, t] of tables) {
    if (!installed.includes(table)) continue;
    for (const m of t.membership) {
      const rows = await sql.unsafe(`select ${quote(m.key)}::text as key, ${quote(m.member)}::text as member from public.${quote(table)}`);
      for (const r of rows) members.add(entry(table, r.key, r.member));
    }
  }
  const listening = await sql.listen("chest_realtime", text => {
    let n;
    try { n = JSON.parse(text); } catch { return; }
    const t = tables.get(n.table);
    if (!t) return;
    for (const m of t.membership) {
      const now = n.row?.[m.key] == null || n.row?.[m.member] == null ? null : [String(n.row[m.key]), String(n.row[m.member])];
      const before = n.op === "delete" ? now : n.op === "update" && n.old?.[m.key] != null && n.old?.[m.member] != null ? [String(n.old[m.key]), String(n.old[m.member])] : null;
      if (before && (n.op === "delete" || !now || before[0] !== now[0] || before[1] !== now[1])) {
        members.delete(entry(n.table, before[0], before[1]));
        onRemoved(n.table, before[0], before[1]);
      }
      if (now && n.op !== "delete") members.add(entry(n.table, now[0], now[1]));
    }
    onRow(n.table, n.op, n.row ?? {}, n.partial === true);
  });
  return {
    tables: installed,
    member: (table, key, member) => members.has(entry(table, key, member)),
    close: async () => {
      await listening.unlisten().catch(() => {});
      await sql.end({ timeout: 2 });
    },
  };
}

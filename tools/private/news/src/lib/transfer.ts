import { randomBytes } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { localeOf, type Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "../core/tool.ts";
import { groupNames } from "./groups.ts";
import { catalogue, format } from "../i18n/index.ts";
import { withNames, type Version } from "../shared/model.ts";
import { nameOf, people } from "./people.ts";
import { seen } from "./posts.ts";
import { local } from "./time.ts";
import { readZip, writeZip } from "./zip.ts";

// Moving posts in and out of News.
//
// Out: "Download all posts" — every post the publisher sees, as one ZIP:
// posts.json (everything, names written out) and one Markdown file per
// post (its text as written, its other languages, its comments), with its
// files as far as 200 MB go (a list says which were left out).
//
// In: a Slack export (the ZIP a workspace owner downloads: channels.json,
// users.json, one folder per channel with a JSON file per day — format as
// Slack documents it, see THIRD_PARTY.md). One channel at a time: each
// top-level message becomes an Info post by its author when their name is
// a member's of the Chest, by the one importing otherwise (the Slack name
// said in the text), at the time it was written. Nobody is told; importing
// the same export again adds only what is new; an import can be taken back.

// ── Out ────────────────────────────────────────────────────────────────
const exportFiles = 200 << 20;

const slug = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 60) || "post";
const fileSafe = (text: string) => text.replace(/[/\\:*?"<>|\p{Cc}]/gu, "_").slice(0, 120);

type ExportRow = {
  id: string; kind: string; title: string; body: string; locale: string; versions: Version[]; author: string; important: boolean; publish_at: Date; edited_at: Date | null; deleted_at: Date | null;
  event_day: string | null; event_last_day: string | null; event_start: Date | null; event_end: Date | null; place: string | null; seats: number | null; welcome: string | null;
  groups: string[]; people: string[]; confirmed: number;
};

export async function exportAll(sql: Sql, actor: Member | null, zone: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!actor || !can(actor, "publish")) throw new AppError("forbidden");
  const rows = await sql<ExportRow[]>`
    select p.id, p.kind, p.title, p.body, p.locale, p.author, p.important, p.publish_at, p.edited_at, p.deleted_at,
      to_char(p.event_day, 'YYYY-MM-DD') as event_day, to_char(p.event_last_day, 'YYYY-MM-DD') as event_last_day, p.event_start, p.event_end, p.place, p.seats, p.welcome,
      coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body)) from post_versions v where v.post_id = p.id), '[]'::json) as versions,
      array(select g.group_id from post_groups g where g.post_id = p.id) as groups,
      array(select pp.member from post_people pp where pp.post_id = p.id) as people,
      (select count(*)::int from confirmations k where k.post_id = p.id and k.version >= p.confirm_from) as confirmed
    from posts p where ${seen(sql, actor)} order by p.publish_at, p.id`;
  const ids = rows.map(r => r.id);
  const comments = ids.length === 0 ? [] : await sql<{ id: string; post_id: string; parent_id: string | null; author: string; body: string; created_at: Date }[]>`
    select id, post_id, parent_id, author, body, created_at from comments where post_id in ${sql(ids)} and deleted_at is null order by created_at, id`;
  const fileRows = ids.length === 0 ? [] : await sql<{ id: string; post_id: string; role: string; object: string; file_name: string; type: string; size: string }[]>`
    select id, post_id, role, object, file_name, type, size from files where post_id in ${sql(ids)} order by post_id, position nulls last, added_at, id`;
  const mentioned = comments.flatMap(c => [...c.body.matchAll(/@\[(mbr_[a-z2-7]{26})\]/gu)].map(m => m[1]!));
  const who = await people([...rows.flatMap(r => [r.author, ...(r.welcome ? [r.welcome] : []), ...r.people]), ...comments.map(c => c.author), ...mentioned]);
  const name = (id: string) => nameOf(who.get(id), localeOf(actor.language));
  const groups = await groupNames();
  const t = catalogue(localeOf(actor.language));
  const when = (d: Date) => { const l = local(d, zone); return `${l.day} ${l.time}`; };

  const entries: { name: string; data: Uint8Array | string }[] = [];
  const left: string[] = [];
  let size = 0;
  const posts = [];
  for (const r of rows) {
    const base = `posts/${local(r.publish_at, zone).day}-${r.id}-${slug(r.title)}`;
    const own = comments.filter(c => String(c.post_id) === String(r.id));
    const attached = fileRows.filter(f => String(f.post_id) === String(r.id));
    const saved: { name: string; role: string; type: string; path: string | null }[] = [];
    for (const f of attached) {
      const path = `${base}/${String(f.id)}-${fileSafe(f.file_name)}`;
      let kept: string | null = null;
      if (size + Number(f.size) <= exportFiles) {
        try {
          const data = await files.get(f.object);
          if (data) {
            entries.push({ name: path, data: data.data });
            size += data.size;
            kept = path;
          }
        } catch (error) {
          if (!(error instanceof ChestError)) throw error;
        }
      }
      if (!kept) left.push(`${f.file_name} (${r.title})`);
      saved.push({ name: f.file_name, role: f.role, type: f.type, path: kept });
    }
    const thread = own.map(c => ({ id: String(c.id), replyTo: c.parent_id === null ? null : String(c.parent_id), author: name(c.author), at: c.created_at.toISOString(), text: withNames(c.body, name) }));
    const md = [
      `# ${r.title}`,
      "",
      `${t.kinds[r.kind as "info"]} · ${format(t.front.by, { name: name(r.author) })} · ${when(r.publish_at)}${r.important ? " · " + t.front.important : ""}${r.deleted_at ? " · " + t.transfer.deleted : ""}`,
      "",
      r.body,
      ...r.versions.flatMap(v => ["", "---", "", `# ${v.title}`, "", v.body]),
      ...(thread.length ? ["", "---", "", `## ${t.comments.title.other.replace("{count}", String(thread.length))}`, "", ...thread.map(c => `${c.replyTo ? "  - " : "- "}**${c.author}** (${c.at.slice(0, 16).replace("T", " ")}): ${c.text.replace(/\n/gu, " ")}`)] : []),
      "",
    ].join("\n");
    entries.push({ name: base + ".md", data: md });
    posts.push({
      id: String(r.id), kind: r.kind, title: r.title, text: r.body, language: r.locale, versions: r.versions, author: name(r.author), important: r.important,
      published: r.publish_at.toISOString(), edited: r.edited_at?.toISOString() ?? null,
      event: r.event_day ? { day: r.event_day, lastDay: r.event_last_day, start: r.event_start?.toISOString() ?? null, end: r.event_end?.toISOString() ?? null, place: r.place, seats: r.seats } : null,
      welcome: r.welcome ? name(r.welcome) : null,
      audience: { groups: r.groups.map(g => groups.get(g) ?? g), people: r.people.map(name) },
      confirmed: r.important ? r.confirmed : null,
      comments: thread, files: saved,
    });
  }
  entries.unshift({ name: "posts.json", data: JSON.stringify({ exported: new Date().toISOString(), posts }, null, 2) });
  if (left.length) entries.push({ name: "files-left-out.txt", data: [t.transfer.leftOut, "", ...left].join("\n") });
  return writeZip(entries);
}

// ── In: a Slack channel ─────────────────────────────────────────────────
export const importLimits = { size: 50 << 20, messages: 2000 } as const;

type SlackUser = { id: string; name: string };
type SlackMessage = { ts: string; user: string | null; text: string };
export type SlackChannel = { id: string; name: string; messages: number };

// readSlack reads what News needs of an export: its channels, the names of
// its people, and the top-level messages of each channel (thread replies,
// joins, bots and the like left out).
export function readSlack(bytes: Uint8Array): { channels: SlackChannel[]; users: Map<string, SlackUser>; messages: Map<string, SlackMessage[]> } {
  const entries = readZip(bytes, name => name.endsWith(".json"));
  const byName = new Map(entries.map(e => [e.name.replace(/^[^/]+\/(?=(channels|users)\.json$)/u, ""), e]));
  const json = (name: string): unknown => {
    const e = byName.get(name);
    if (!e) return null;
    try { return JSON.parse(new TextDecoder().decode(e.data)); } catch { throw new AppError("not_export"); }
  };
  const channelList = json("channels.json");
  if (!Array.isArray(channelList)) throw new AppError("not_export");
  const users = new Map<string, SlackUser>();
  const userList = json("users.json");
  for (const u of Array.isArray(userList) ? userList as Record<string, unknown>[] : []) {
    const profile = (u["profile"] ?? {}) as Record<string, unknown>;
    const real = [u["real_name"], profile["real_name"], profile["display_name"], u["name"]].find(v => typeof v === "string" && v.trim()) as string | undefined;
    if (typeof u["id"] === "string" && real) users.set(u["id"], { id: u["id"], name: real.trim() });
  }
  const channels: SlackChannel[] = [];
  const messages = new Map<string, SlackMessage[]>();
  for (const c of channelList as Record<string, unknown>[]) {
    if (typeof c?.["id"] !== "string" || typeof c["name"] !== "string") continue;
    const folder = c["name"] + "/";
    const list: SlackMessage[] = [];
    for (const e of entries) {
      const path = e.name.includes("/" + folder) ? e.name.slice(e.name.indexOf("/" + folder) + 1) : e.name;
      if (!path.startsWith(folder) || !/^\d{4}-\d{2}-\d{2}\.json$/u.test(path.slice(folder.length))) continue;
      let day: unknown;
      try { day = JSON.parse(new TextDecoder().decode(e.data)); } catch { throw new AppError("not_export"); }
      for (const m of Array.isArray(day) ? day as Record<string, unknown>[] : []) {
        if (m?.["type"] !== "message" || m["subtype"] !== undefined && m["subtype"] !== "thread_broadcast") continue;
        if (typeof m["ts"] !== "string" || !/^\d{9,11}(\.\d{1,6})?$/u.test(m["ts"]) || typeof m["text"] !== "string" || !m["text"].trim()) continue;
        if (typeof m["thread_ts"] === "string" && m["thread_ts"] !== m["ts"] && m["subtype"] !== "thread_broadcast") continue;
        list.push({ ts: m["ts"], user: typeof m["user"] === "string" ? m["user"] : null, text: m["text"] });
      }
    }
    list.sort((a, b) => Number(a.ts) - Number(b.ts));
    channels.push({ id: c["id"], name: c["name"], messages: list.length });
    messages.set(c["id"], list);
  }
  if (channels.length === 0) throw new AppError("not_export");
  return { channels: channels.sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name)), users, messages };
}

// fromSlack writes a Slack message ("mrkdwn") with News's marks: *bold*,
// _italic_, ~struck~ (kept as words), <https://…|links>, <@U…> mentions,
// <#C…|channels>, <!here>.
export function fromSlack(text: string, users: Map<string, SlackUser>): string {
  const md = (s: string) => s.replace(/[\\*_[\]]/gu, "\\$&");
  let out = "";
  let at = 0;
  for (const m of text.matchAll(/<([^<>]{1,2000})>/gu)) {
    out += plainMarks(text.slice(at, m.index));
    const inner = m[1]!;
    const [target = "", label] = inner.split("|");
    if (target.startsWith("@")) out += "@" + md(users.get(target.slice(1))?.name ?? label ?? target.slice(1));
    else if (target.startsWith("#")) out += "#" + md(label ?? target.slice(1));
    else if (target.startsWith("!")) out += "@" + md(label ?? target.slice(1).split("^")[0]!);
    else if (/^(https?:\/\/|mailto:)/iu.test(target)) out += label ? `[${md(unescape(label))}](${target.replace(/[\s()]/gu, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())})` : target;
    else out += md(inner);
    at = m.index + m[0].length;
  }
  out += plainMarks(text.slice(at));
  return out.replace(/\r\n?/gu, "\n").trim();

  function unescape(s: string) {
    return s.replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
  }
  // Words with Slack's marks: *bold* becomes **bold**; _italic_ stays;
  // ~struck~ loses its tildes; the rest is escaped.
  function plainMarks(s: string) {
    const parts = unescape(s).split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/gu);
    return parts.map(p => (/^\*[^*\n]+\*$/u.test(p) ? `**${md(p.slice(1, -1).trim())}**` : /^_[^_\n]+_$/u.test(p) ? `_${md(p.slice(1, -1).trim())}_` : /^~[^~\n]+~$/u.test(p) ? md(p.slice(1, -1)) : md(p))).join("");
  }
}

// headline: the message's first line, as a headline (140 characters, cut
// at a word); the text: the rest, or the whole when the first line was cut.
export function headline(text: string): { title: string; body: string } {
  const lines = text.split("\n");
  const first = lines[0]!.replace(/\\(.)/gu, "$1").replace(/\*\*|(?<!\w)_|_(?!\w)/gu, "").replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1").trim();
  const chars = [...first];
  if (chars.length <= 140 && first) return { title: first, body: lines.slice(1).join("\n").trim() };
  const cut = chars.slice(0, 139).join("");
  const space = cut.lastIndexOf(" ");
  return { title: (space > 80 ? cut.slice(0, space) : cut) + "…", body: text };
}

// importSlack adds a channel's messages as posts; answers the batch (to
// take it back), how many posts, how many were already there, and the
// Slack names not found among the Chest's members.
export async function importSlack(sql: Sql, actor: Member | null, bytes: Uint8Array, channelId: unknown): Promise<{ batch: string; added: number; skipped: number; unmatched: string[] }> {
  if (!actor || !can(actor, "publish")) throw new AppError("forbidden");
  const { channels, users, messages } = readSlack(bytes);
  const channel = channels.find(c => c.id === channelId);
  if (!channel) throw new AppError("not_found");
  const list = messages.get(channel.id)!;
  if (list.length > importLimits.messages) throw new AppError("too_many", { max: importLimits.messages });
  // Slack names to members, by their full name (case and accents aside).
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
  const matched = new Map<string, string>();
  for (const u of new Set(list.map(m => m.user).filter((u): u is string => !!u))) {
    const slack = users.get(u);
    if (!slack) continue;
    try {
      const found = await members.list({ q: slack.name.split(/\s+/u)[0]!, limit: 50 });
      const same = found.members.filter(m => m.role !== null && fold(m.name) === fold(slack.name));
      if (same.length === 1) matched.set(u, same[0]!.id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      throw new AppError("unavailable");
    }
  }
  const t = catalogue(localeOf(actor.language));
  const batch = randomBytes(8).toString("hex");
  const unmatched = new Set<string>();
  let added = 0;
  let skipped = 0;
  await sql.begin(async tx => {
    for (const m of list) {
      const text = fromSlack(m.text, users);
      const { title, body } = headline(text);
      const author = m.user ? matched.get(m.user) : undefined;
      const slackName = m.user ? users.get(m.user)?.name ?? m.user : "Slack";
      if (!author) unmatched.add(slackName);
      const said = author ? body : [format(t.transfer.postedBy, { name: slackName.replace(/[\\*_[\]]/gu, "\\$&") }), body].filter(Boolean).join("\n\n");
      const at = new Date(Math.round(Number(m.ts) * 1000));
      const [row] = await tx<{ id: string }[]>`
        insert into posts (kind, title, body, locale, author, publish_at, created_at, announced_at, origin, import_batch)
        values ('info', ${[...title].slice(0, 140).join("")}, ${[...said].slice(0, 20000).join("")}, ${localeOf(actor.language)}, ${author ?? actor.id}, ${at}, ${at}, now(), ${`slack:${channel.id}:${m.ts}`}, ${batch})
        on conflict (origin) do nothing returning id`;
      if (row) added++;
      else skipped++;
    }
  });
  return { batch, added, skipped, unmatched: [...unmatched].sort() };
}

// undoImport takes an import back: its posts go (as a deleted post does,
// kept 30 days).
export async function undoImport(sql: Sql, actor: Member | null, batch: unknown): Promise<number> {
  if (!actor || !can(actor, "publish")) throw new AppError("forbidden");
  if (typeof batch !== "string" || !/^[a-z0-9]{1,32}$/u.test(batch)) throw new AppError("not_found");
  const gone = await sql`update posts set deleted_at = now(), origin = null where import_batch = ${batch} and deleted_at is null returning id`;
  return gone.length;
}

// Writes seed/sample.sql from seed/spaces.json and seed/pages/*.md: a real-
// looking company handbook for local runs and screenshots (never run by the
// Chest). Run: node seed/build.ts
//
// A page file starts with a few "key: value" lines between "---": id, space,
// parent (a page id), title, author (a cast name), created and updated (days
// ago), lock and lockMinutes (someone editing it), template (true: offered
// for new pages of its space). "<key>.v1.md" is an older version (author,
// days). In the text, [[key]] links to another page by its file name, shown
// with its current title. seed/conversation.json adds comments, watchers
// and review reminders (days: how long ago; a review checked long ago is
// due).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, plainText, type Doc, type DocNode } from "../lib/doc.ts";
import { fromMarkdown } from "../lib/markdown.ts";

const here = import.meta.dirname;
const member = (key: string) => "mbr_" + key + "a".repeat(26 - key.length);
const group = (key: string) => "grp_" + key + "a".repeat(26 - key.length);
const q = (text: string) => "'" + text.replace(/'/gu, "''") + "'";

type Meta = Record<string, string>;
function read(file: string): { meta: Meta; body: string } {
  const text = readFileSync(join(here, "pages", file), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n/u.exec(text)!;
  const meta = Object.fromEntries(m[1]!.split("\n").map(l => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  return { meta, body: text.slice(m[0].length) };
}

const spaces = JSON.parse(readFileSync(join(here, "spaces.json"), "utf8")) as { key: string; id: number; name: string; description: string; color: string; by: string; groups?: string[]; editors?: string[] }[];
const files = readdirSync(join(here, "pages")).filter(f => /^[a-z-]+\.md$/u.test(f)).sort();
const pages = files.map(f => ({ key: f.replace(/\.md$/u, ""), ...read(f) }));
const ids = new Map(pages.map(p => [p.key, p.meta["id"]!]));
const titles = new Map(pages.map(p => [p.meta["id"]!, p.meta["title"]!]));

// [[key]] becomes a link to that page, showing its current title.
function toDoc(body: string): Doc {
  const doc = fromMarkdown(body);
  const walk = (nodes: DocNode[]): DocNode[] => nodes.flatMap(n => {
    if (n.type === "text" && /\[\[[a-z-]+\]\]/u.test(n.text ?? "")) {
      return (n.text ?? "").split(/(\[\[[a-z-]+\]\])/u).filter(Boolean).map(part => {
        const key = /^\[\[([a-z-]+)\]\]$/u.exec(part)?.[1];
        if (key && !ids.has(key)) throw new Error(`unknown page [[${key}]]`);
        return key ? { type: "pageRef", attrs: { id: ids.get(key)! } } : { ...n, text: part };
      });
    }
    return [n.content ? { ...n, content: walk(n.content) } : n];
  });
  return normalize({ type: "doc", content: walk(doc.content) });
}

const out: string[] = [
  "-- Sample data for local runs and screenshots (never run by the Chest):",
  "-- Lumen & Co, a lighting design studio of 34 people in Lyon. Written by",
  "-- seed/build.ts from seed/pages/*.md — edit those and run `node seed/build.ts`.",
  "-- The member ids are those of the studio's dev harness (lab/chest-dev/cast.mjs).",
  "",
];
for (const s of spaces) {
  out.push(`insert into spaces (id, name, description, color, position, visibility, created_by, created_at) overriding system value values (${s.id}, ${q(s.name)}, ${q(s.description)}, ${q(s.color)}, ${q(String.fromCharCode(104 + s.id))}, ${q(s.groups ? "groups" : "everyone")}, ${q(member(s.by))}, now() - interval '200 days');`);
  for (const g of s.groups ?? []) out.push(`insert into space_groups (space_id, group_id) values (${s.id}, ${q(group(g))});`);
  // Edited only by some groups (the others read it).
  if (s.editors) {
    out.push(`update spaces set editing = 'some' where id = ${s.id};`);
    for (const g of s.editors) out.push(`insert into space_editors (space_id, who) values (${s.id}, ${q(group(g))});`);
  }
}
out.push("");
// Parents first, so that the tree holds; positions in file order per parent.
const order = [...pages].sort((a, b) => Number(Boolean(a.meta["parent"])) - Number(Boolean(b.meta["parent"])) || Number(a.meta["id"]) - Number(b.meta["id"]));
const position = new Map<string, number>();
const linkRows: string[] = [];
for (const p of order) {
  const m = p.meta;
  const space = spaces.find(s => s.key === m["space"])!;
  const slot = `${space.id}:${m["parent"] ?? ""}`;
  const n = (position.get(slot) ?? 0) + 1;
  position.set(slot, n);
  const versions = readdirSync(join(here, "pages")).filter(f => f.startsWith(p.key + ".v")).sort().map(f => read(f));
  const all = [...versions.map(v => ({ author: v.meta["author"]!, days: Number(v.meta["days"]), doc: toDoc(v.body), kind: "edited" })), { author: m["author"]!, days: Number(m["updated"]), doc: toDoc(p.body), kind: "edited" }];
  all[0]!.kind = "created";
  const current = all.at(-1)!;
  const body = plainText(current.doc, i => titles.get(i));
  out.push(`insert into pages (id, space_id, parent_id, position, title, doc, body, version, created_by, created_at, updated_by, updated_at) overriding system value values (${m["id"]}, ${space.id}, ${m["parent"] ?? "null"}, ${q(String.fromCharCode(96 + n))}, ${q(m["title"]!)}, ${q(JSON.stringify(current.doc))}::jsonb, ${q(body)}, ${all.length}, ${q(member(all[0]!.author))}, now() - interval '${m["created"]} days', ${q(member(current.author))}, now() - interval '${current.days} days' - interval '${(Number(m["id"]) * 37) % 600} minutes');`);
  all.forEach((v, i) => {
    out.push(`insert into page_versions (page_id, number, title, doc, body, author, created_at, kind) values (${m["id"]}, ${i + 1}, ${q(m["title"]!)}, ${q(JSON.stringify(v.doc))}::jsonb, ${q(plainText(v.doc, x => titles.get(x)))}, ${q(member(v.author))}, now() - interval '${v.days} days' - interval '${(Number(m["id"]) * 37) % 600} minutes', ${q(v.kind)});`);
  });
  const links = new Set<string>();
  JSON.stringify(current.doc).replace(/"type":"pageRef","attrs":\{"id":"(\d+)"\}/gu, (_all, id: string) => { links.add(id); return ""; });
  for (const to of links) linkRows.push(`insert into page_links (from_page, to_page) values (${m["id"]}, ${to});`);
  if (m["template"] === "true") out.push(`update pages set template = true where id = ${m["id"]};`);
  // Someone's editor stays open for the sample's whole life (seen_at ahead).
  if (m["lock"]) out.push(`insert into page_locks (page_id, member_id, since, active_at, seen_at) values (${m["id"]}, ${q(member(m["lock"]))}, now() - interval '${Number(m["lockMinutes"] ?? 5) + 20} minutes', now() - interval '${m["lockMinutes"] ?? 5} minutes', now() + interval '30 days');`);
  out.push("");
}
out.push(...linkRows, "");

type Conversation = {
  comments: { page: number; by: string; days: number; text: string; edited?: boolean }[];
  watchers: { page: number; by: string }[];
  reviews: { page: number; months: number; owner: string; days: number }[];
  reads: { page: number; by: string; days: number; confirmed: { by: string; days: number }[] }[];
  pins: { page: number; days: number }[];
};
const talk = JSON.parse(readFileSync(join(here, "conversation.json"), "utf8")) as Conversation;
for (const c of talk.comments) {
  out.push(`insert into page_comments (page_id, author, body, created_at, edited_at) values (${c.page}, ${q(member(c.by))}, ${q(c.text)}, now() - interval '${c.days} days' + interval '${(c.text.length * 13) % 400} minutes', ${c.edited ? `now() - interval '${c.days} days' + interval '${(c.text.length * 13) % 400 + 30} minutes'` : "null"});`);
}
for (const w of talk.watchers) out.push(`insert into page_watchers (page_id, member_id) values (${w.page}, ${q(member(w.by))});`);
for (const r of talk.reviews) out.push(`update pages set review_months = ${r.months}, review_owner = ${q(member(r.owner))}, reviewed_at = now() - interval '${r.days} days' where id = ${r.page};`);
// Pages whose readers were asked to confirm they read them, and who did.
for (const r of talk.reads) {
  out.push(`update pages set read_asked_at = now() - interval '${r.days} days', read_asked_by = ${q(member(r.by))}, read_version = version where id = ${r.page};`);
  for (const c of r.confirmed) out.push(`insert into page_reads (page_id, member_id, version, read_at) select id, ${q(member(c.by))}, version, now() - interval '${c.days} days' from pages where id = ${r.page};`);
}
for (const p of talk.pins) out.push(`update pages set pinned_at = now() - interval '${p.days} days' where id = ${p.page};`);
out.push("");
out.push("select setval(pg_get_serial_sequence('spaces', 'id'), (select max(id) from spaces));");
out.push("select setval(pg_get_serial_sequence('pages', 'id'), (select max(id) from pages));");
writeFileSync(join(here, "sample.sql"), out.join("\n") + "\n");
console.log(`seed/sample.sql: ${spaces.length} spaces, ${pages.length} pages, ${talk.comments.length} comments`);

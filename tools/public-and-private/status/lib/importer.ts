import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { chestLanguage } from "./languages.ts";
import { clean, isImpact, limits, type Impact } from "./model.ts";

// Import from Atlassian Statuspage: the history is a status page's
// credibility, and a company moving here should not start at "no incident
// in 90 days". Statuspage gives its incidents and components as JSON — its
// public API (https://<page>/api/v2/incidents.json, components.json,
// summary.json, scheduled-maintenances.json; shape documented on each
// page's /api) and its manage API; the editor downloads one of these files
// and gives it here (no network needed). What is read:
//   - components (with their groups, from components.json or summary.json),
//     matched to ours by name, created when missing;
//   - resolved incidents (status resolved or postmortem) with every update,
//     the services each touched and how badly (affected_components, else
//     the incident's impact), and the post-mortem (postmortem_body);
//   - completed maintenance, with its window.
// Open incidents and maintenance still ahead are not imported (post them
// here, where customers will now look). Each keeps its Statuspage id:
// importing the same file again adds nothing. Nobody is notified.

export type ImportResult = { incidents: number; maintenances: number; components: number; already: number; open: number; skipped: number };

const maxBytes = 8 * 1024 * 1024;
const maxItems = 2000;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const time = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Statuspage's words for a component's state, and an incident's impact.
const fromStatus: Record<string, Impact | "operational"> = { operational: "operational", degraded_performance: "degraded", partial_outage: "partial", major_outage: "major", under_maintenance: "operational" };
const fromImpact: Record<string, Impact> = { critical: "major", major: "partial", minor: "degraded", none: "degraded", maintenance: "degraded" };
const incidentSteps = new Set(["investigating", "identified", "monitoring", "resolved"]);

// A text as the page keeps it: cleaned and bounded (a longer one is cut,
// never refused — an import must not stop on one long update).
function bounded(value: unknown, max: number, multiline: boolean, fallback: string): string {
  const raw = [...text(value)].slice(0, max).join("");
  try {
    return clean(raw, max, { multiline, optional: fallback === "" });
  } catch {
    return clean(fallback, max, { multiline, optional: true });
  }
}

// read finds the lists in what was given: one of Statuspage's files, or
// several pasted as a JSON array of them.
export function readExport(input: string): { components: Json[]; incidents: Json[]; maintenances: Json[] } {
  if (typeof input !== "string" || input.length === 0) throw new AppError("empty");
  if (Buffer.byteLength(input) > maxBytes) throw new AppError("too_long", { max: maxBytes });
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    throw new AppError("invalid_file");
  }
  const parts = Array.isArray(data) && data.every(isObject) && data.some(d => "incidents" in d || "components" in d || "scheduled_maintenances" in d) ? data : [data];
  const out = { components: [] as Json[], incidents: [] as Json[], maintenances: [] as Json[] };
  for (const part of parts) {
    if (Array.isArray(part)) {
      // A bare list of incidents (the manage API answers a list).
      out.incidents.push(...part.filter(isObject));
      continue;
    }
    if (!isObject(part)) continue;
    if (Array.isArray(part["components"])) out.components.push(...part["components"].filter(isObject));
    if (Array.isArray(part["incidents"])) out.incidents.push(...part["incidents"].filter(isObject));
    if (Array.isArray(part["scheduled_maintenances"])) out.maintenances.push(...part["scheduled_maintenances"].filter(isObject));
  }
  if (out.components.length + out.incidents.length + out.maintenances.length === 0) throw new AppError("invalid_file");
  if (out.components.length > maxItems || out.incidents.length > maxItems || out.maintenances.length > maxItems) throw new AppError("too_many", { max: maxItems });
  return out;
}

export async function importStatuspage(sql: Sql, actor: Member | null, input: string, now = new Date()): Promise<ImportResult> {
  if (!actor || !can(actor, "incidents") || !can(actor, "components")) throw new AppError("forbidden");
  const who = actor;
  const found = readExport(input);
  return sql.begin(async tx => {
    const result: ImportResult = { incidents: 0, maintenances: 0, components: 0, already: 0, open: 0, skipped: 0 };
    const byName = new Map<string, string>();
    for (const c of await tx<{ id: string; name: string; kind: string }[]>`select id, name, kind from components`) byName.set(`${c.kind}:${c.name.toLowerCase()}`, String(c.id));
    const groupNames = new Map<string, string>();
    for (const c of found.components) if (c["group"] === true && typeof c["id"] === "string") groupNames.set(c["id"], text(c["name"]));

    // A component by its Statuspage name (and group), created when missing.
    const componentFor = async (c: Json): Promise<string | null> => {
      const name = [...text(c["name"]).trim()].slice(0, limits.componentName).join("");
      if (!name || c["group"] === true) return null;
      const known = byName.get(`component:${name.toLowerCase()}`);
      if (known) return known;
      const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from components`) as unknown as [{ count: number }];
      if (count >= limits.components) return null;
      let parent: string | null = null;
      const groupName = typeof c["group_id"] === "string" ? groupNames.get(c["group_id"]) : undefined;
      if (groupName) {
        const g = [...groupName.trim()].slice(0, limits.componentName).join("");
        parent = byName.get(`group:${g.toLowerCase()}`) ?? null;
        if (!parent && g && count + 1 < limits.components) {
          const [row] = await tx<{ id: string }[]>`insert into components (kind, name, position) values ('group', ${g}, (select coalesce(max(position), -1) + 1 from components where parent_id is null)) returning id`;
          parent = String(row!.id);
          byName.set(`group:${g.toLowerCase()}`, parent);
          result.components++;
        }
      }
      const description = bounded(c["description"], limits.componentDescription, false, "").slice(0, limits.componentDescription);
      const created = time(c["created_at"]);
      const [row] = await tx<{ id: string }[]>`
        insert into components (kind, parent_id, name, description, position, created_at)
        values ('component', ${parent}, ${name}, ${description}, (select coalesce(max(position), -1) + 1 from components where parent_id is not distinct from ${parent}), ${created && created < now ? created : now})
        returning id`;
      const id = String(row!.id);
      byName.set(`component:${name.toLowerCase()}`, id);
      result.components++;
      return id;
    };

    for (const c of found.components) await componentFor(c);

    const insertUpdate = async (incidentId: string, status: string, body: string, at: Date, states: Map<string, Impact>) => {
      const [row] = await tx<{ id: string }[]>`insert into updates (incident_id, status, body, posted_at, author) values (${incidentId}, ${status}, ${body}, ${at}, ${who.id}) returning id`;
      for (const [c, s] of states) await tx`insert into update_states (update_id, component_id, state) values (${row!.id}, ${c}, ${s})`;
    };

    const already = async (sourceId: string) => (await tx`select 1 from incidents where source_id = ${sourceId}`).length > 0;
    const title = (i: Json) => bounded(i["name"], limits.title, false, "Incident");
    const updatesOf = (i: Json) => (Array.isArray(i["incident_updates"]) ? i["incident_updates"].filter(isObject) : [])
      .map(u => ({ u, at: time(u["display_at"]) ?? time(u["created_at"]) }))
      .filter((x): x is { u: Json; at: Date } => x.at !== null && x.at <= now)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    for (const i of found.incidents) {
      const sourceId = typeof i["id"] === "string" || typeof i["id"] === "number" ? `statuspage:${String(i["id"])}`.slice(0, 80) : null;
      const status = text(i["status"]);
      if (!sourceId) { result.skipped++; continue; }
      if (status !== "resolved" && status !== "postmortem") { result.open++; continue; }
      if (await already(sourceId)) { result.already++; continue; }
      const ups = updatesOf(i).filter(x => incidentSteps.has(text(x.u["status"])));
      const started = time(i["started_at"]) ?? ups[0]?.at ?? time(i["created_at"]);
      const resolved = time(i["resolved_at"]) ?? ups.filter(x => x.u["status"] === "resolved").at(-1)?.at ?? null;
      if (!started || !resolved || resolved <= started || resolved > now) { result.skipped++; continue; }
      // The services it touched, how badly at first (the incident's impact).
      const impact = fromImpact[text(i["impact"])] ?? "degraded";
      const running = new Map<string, Impact>();
      for (const c of Array.isArray(i["components"]) ? i["components"].filter(isObject) : []) {
        const id = await componentFor(c);
        if (id) running.set(id, impact);
      }
      const [row] = await tx<{ id: string }[]>`
        insert into incidents (kind, title, language, status, started_at, resolved_at, backfilled, created_by, source_id)
        values ('incident', ${title(i)}, ${chestLanguage()}, 'resolved', ${started}, ${resolved}, true, ${who.id}, ${sourceId}) returning id`;
      const incidentId = String(row!.id);
      const steps = ups.length ? ups : [{ u: { status: "investigating", body: "" } as Json, at: started }, { u: { status: "resolved", body: "" } as Json, at: resolved }];
      if (text(steps.at(-1)!.u["status"]) !== "resolved") steps.push({ u: { status: "resolved", body: "" }, at: resolved });
      for (const { u, at } of steps) {
        const step = text(u["status"]);
        for (const a of Array.isArray(u["affected_components"]) ? u["affected_components"].filter(isObject) : []) {
          const id = byName.get(`component:${text(a["name"]).trim().toLowerCase()}`) ?? await componentFor({ name: a["name"] });
          const to = fromStatus[text(a["new_status"])];
          if (!id || !to) continue;
          if (to === "operational") running.delete(id);
          else if (isImpact(to)) running.set(id, to);
        }
        const when = at < started ? started : at > resolved ? resolved : at;
        await insertUpdate(incidentId, step, bounded(u["body"], limits.body, true, title(i)), when, step === "resolved" ? new Map() : new Map(running));
      }
      const postmortem = text(i["postmortem_body"]).trim();
      if (postmortem) {
        const at = time(i["postmortem_published_at"]) ?? resolved;
        await insertUpdate(incidentId, "postmortem", bounded(postmortem, limits.body, true, title(i)), at > now ? now : at < resolved ? resolved : at, new Map());
      }
      result.incidents++;
    }

    for (const m of found.maintenances) {
      const sourceId = typeof m["id"] === "string" || typeof m["id"] === "number" ? `statuspage:${String(m["id"])}`.slice(0, 80) : null;
      if (!sourceId) { result.skipped++; continue; }
      if (text(m["status"]) !== "completed") { result.open++; continue; }
      if (await already(sourceId)) { result.already++; continue; }
      const from = time(m["scheduled_for"]), to = time(m["scheduled_until"]);
      if (!from || !to || to <= from || to > now) { result.skipped++; continue; }
      const components: string[] = [];
      for (const c of Array.isArray(m["components"]) ? m["components"].filter(isObject) : []) {
        const id = await componentFor(c);
        if (id) components.push(id);
      }
      if (components.length === 0) { result.skipped++; continue; }
      const [row] = await tx<{ id: string }[]>`
        insert into incidents (kind, title, language, status, started_at, ends_at, resolved_at, start_posted, end_posted, backfilled, created_by, source_id)
        values ('maintenance', ${title(m)}, ${chestLanguage()}, 'completed', ${from}, ${to}, ${to}, true, true, true, ${who.id}, ${sourceId}) returning id`;
      const incidentId = String(row!.id);
      for (const c of new Set(components)) await tx`insert into maintenance_components (incident_id, component_id) values (${incidentId}, ${c})`;
      const map: Record<string, string> = { scheduled: "scheduled", in_progress: "in_progress", verifying: "update", completed: "completed" };
      const ups = updatesOf(m).filter(x => map[text(x.u["status"])]);
      const steps = ups.length ? ups : [{ u: { status: "scheduled", body: "" } as Json, at: from }];
      for (const { u, at } of steps) await insertUpdate(incidentId, map[text(u["status"])] ?? "update", bounded(u["body"], limits.body, true, title(m)), at, new Map());
      result.maintenances++;
    }
    return result;
  });
}

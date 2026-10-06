import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { equipment as equipmentKeys, id, limits, type Equipment } from "./model.ts";
import { matcher, type Matchable } from "./match.ts";
import { cancelDeskBookings, type CancelledDesk } from "./places.ts";

// Moving in: the meeting rooms a company already keeps in Google Workspace
// (Admin console › Buildings and resources › Resource management ›
// Download, a CSV), and who has which desk (any spreadsheet: a desk, a
// person). Both only add what is missing — importing the same file again
// changes nothing — and say, line by line, what they left out.
//
// Columns are found by their header, in English or French, whatever their
// order: the Admin console's own ("Resource Name", "Capacity", "Floor
// Name", "Resource Category", "Features" or "#Whiteboard" columns…), the
// Directory API's names (resourceName, capacity, floorName,
// resourceCategory, featureInstances), and plain ones ("Room", "Seats").

export type Skipped = { line: number; reason: "no_name" | "exists" | "not_a_room" | "bad_capacity" | "no_desk" | "no_person" | "unknown_person" | "taken" | "no_area" | "too_many" };
export type RoomsImported = { added: number; floors: number; skipped: Skipped[] };
export type DesksImported = { given: number; added: number; skipped: Skipped[]; cancelled: CancelledDesk[] };

const maxRows = 2000;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9#]+/gu, " ").trim();

function column(header: string[], names: string[]): number {
  const wanted = names.map(fold);
  return header.findIndex(h => wanted.includes(fold(h)));
}

// What a room offers, from the words of a features cell or a "#Feature"
// column: Google's are free text ("TV", "Whiteboard", "Google Meet
// hardware", "Wheelchair accessible").
const equipmentWords: [Equipment, RegExp][] = [
  ["video", /\b(meet|video|visio|zoom|teams|camera|conference|webex|hangout)/u],
  ["screen", /\b(tv|screen|display|monitor|ecran|projector|projecteur|television)/u],
  ["whiteboard", /\b(whiteboard|white board|tableau|paperboard|flipchart|board)/u],
  ["phone", /\b(phone|telephone|speakerphone|polycom)/u],
  ["accessible", /\b(wheelchair|accessible|accessibility|pmr|step free|stepfree)/u],
];
export function equipmentOf(text: string): Equipment[] {
  const words = fold(text);
  const found = equipmentWords.filter(([, re]) => re.test(words)).map(([e]) => e);
  return equipmentKeys.filter(e => found.includes(e));
}

function rowsOf(text: unknown): { header: string[]; rows: string[][] } {
  if (typeof text !== "string" || text.length === 0) throw new AppError("empty");
  if (text.length > 2 << 20) throw new AppError("file_too_large");
  const all = parseCsv(text);
  const [header, ...rows] = all;
  if (!header || rows.length === 0) throw new AppError("empty");
  if (rows.length > maxRows) throw new AppError("too_many", { max: maxRows });
  return { header, rows };
}

export async function importRooms(sql: Sql, actor: Member | null, officeId: unknown, text: unknown): Promise<RoomsImported> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  const oid = id(officeId);
  const { header, rows } = rowsOf(text);
  const c = {
    name: column(header, ["Resource Name", "Calendar Resource Name", "resourceName", "Name", "Room", "Room name", "Nom", "Salle", "Nom de la ressource"]),
    capacity: column(header, ["Capacity", "capacity", "Seats", "Places", "Capacité"]),
    floor: column(header, ["Floor Name", "floorName", "Floor", "Étage", "Etage", "Nom de l'étage"]),
    category: column(header, ["Resource Category", "resourceCategory", "Category", "Catégorie"]),
    features: column(header, ["Features", "featureInstances", "Equipment", "Équipement", "Caractéristiques"]),
    note: column(header, ["User Visible Description", "userVisibleDescription", "Description", "Note"]),
  };
  const flags = header.map((h, i) => (h.trim().startsWith("#") ? i : -1)).filter(i => i >= 0);
  if (c.name < 0) throw new AppError("invalid");
  return sql.begin(async tx => {
    const [office] = await tx`select 1 from offices where id = ${oid} for update`;
    if (!office) throw new AppError("not_found");
    const floors = new Map((await tx<{ id: string; name: string }[]>`select id, name from floors where office_id = ${oid} order by position, id`).map(f => [fold(f.name), String(f.id)]));
    const existing = new Set((await tx<{ name: string }[]>`
      select r.name from rooms r join floors f on f.id = r.floor_id where f.office_id = ${oid} and r.archived_at is null`).map(r => fold(r.name)));
    let count = existing.size;
    const result: RoomsImported = { added: 0, floors: 0, skipped: [] };
    for (const [i, row] of rows.entries()) {
      const line = i + 2;
      const name = (row[c.name] ?? "").replace(/\s+/gu, " ").trim().slice(0, limits.roomName);
      if (!name) { result.skipped.push({ line, reason: "no_name" }); continue; }
      const category = c.category >= 0 ? fold(row[c.category] ?? "") : "";
      if (category && !/(conference|room|salle|meeting|reunion|unknown)/u.test(category)) { result.skipped.push({ line, reason: "not_a_room" }); continue; }
      if (existing.has(fold(name))) { result.skipped.push({ line, reason: "exists" }); continue; }
      const capacityText = c.capacity >= 0 ? (row[c.capacity] ?? "").trim() : "";
      const capacity = capacityText === "" ? 1 : Number(capacityText);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > limits.capacity) { result.skipped.push({ line, reason: "bad_capacity" }); continue; }
      if (count >= limits.roomsPerOffice) { result.skipped.push({ line, reason: "too_many" }); continue; }
      const floorName = ((c.floor >= 0 ? row[c.floor] : "") || "").replace(/\s+/gu, " ").trim().slice(0, limits.floorName) || "—";
      let floor = floors.get(fold(floorName));
      if (!floor) {
        const [f] = await tx<{ id: string }[]>`insert into floors (office_id, name, position) values (${oid}, ${floorName}, (select coalesce(max(position) + 1, 0) from floors where office_id = ${oid})) returning id`;
        floor = String(f!.id);
        floors.set(fold(floorName), floor);
        result.floors++;
      }
      const words = [c.features >= 0 ? row[c.features] ?? "" : "", ...flags.filter(k => /^(true|yes|oui|1|x)$/iu.test((row[k] ?? "").trim())).map(k => header[k]!.slice(1))].join(" ");
      const note = (c.note >= 0 ? row[c.note] ?? "" : "").replace(/\s+/gu, " ").trim().slice(0, limits.roomNote);
      await tx`
        insert into rooms (floor_id, name, capacity, equipment, note, position)
        values (${floor}, ${name}, ${capacity}, ${equipmentOf(words)}, ${note}, (select coalesce(max(position) + 1, 0) from rooms where floor_id = ${floor}))`;
      existing.add(fold(name));
      count++;
      result.added++;
    }
    return result;
  });
}

// Who has which desk: a desk (its name, "D-12") and a person (their name as
// the Chest knows it, "Martin, Camille" too; an address when the Chest
// gives addresses: lib/match.ts). A desk
// that does not exist yet is added to the area named in an "Area" column.
// Giving a desk cancels others' coming bookings of it (returned: the caller
// tells them), as giving it by hand does.
export async function importDesks(sql: Sql, actor: Member | null, officeId: unknown, text: unknown, people: readonly Matchable[]): Promise<DesksImported> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  const oid = id(officeId);
  const { header, rows } = rowsOf(text);
  const c = {
    desk: column(header, ["Desk", "Desk name", "Desk Name", "Space", "Space name", "Seat", "Bureau", "Poste", "Nom du bureau", "Nom du poste"]),
    person: column(header, ["Person", "Name", "User", "User name", "Assigned to", "Assignee", "Owner", "Employee", "Personne", "Nom", "Attribué à", "Collaborateur"]),
    email: column(header, ["Email", "E-mail", "User email", "Email address", "Mail", "Adresse e-mail", "Courriel"]),
    area: column(header, ["Area", "Zone", "Neighborhood", "Neighbourhood", "Espace"]),
  };
  if (c.desk < 0 || (c.person < 0 && c.email < 0)) throw new AppError("invalid");
  const who = matcher(people);
  return sql.begin(async tx => {
    const [office] = await tx`select 1 from offices where id = ${oid} for update`;
    if (!office) throw new AppError("not_found");
    const desks = new Map((await tx<{ id: string; name: string }[]>`
      select d.id, d.name from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
      where f.office_id = ${oid} and d.archived_at is null`).map(d => [fold(d.name), String(d.id)]));
    const areas = new Map((await tx<{ id: string; name: string }[]>`
      select a.id, a.name from areas a join floors f on f.id = a.floor_id where f.office_id = ${oid}`).map(a => [fold(a.name), String(a.id)]));
    const result: DesksImported = { given: 0, added: 0, skipped: [], cancelled: [] };
    const given = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const line = i + 2;
      const deskName = (row[c.desk] ?? "").replace(/\s+/gu, " ").trim().slice(0, limits.deskName);
      if (!deskName) { result.skipped.push({ line, reason: "no_desk" }); continue; }
      const email = c.email >= 0 ? (row[c.email] ?? "").trim().toLowerCase() : "";
      const name = c.person >= 0 ? (row[c.person] ?? "").trim() : "";
      if (!email && !name) { result.skipped.push({ line, reason: "no_person" }); continue; }
      const person = who({ name: name || null, address: email || null });
      if (!person) { result.skipped.push({ line, reason: "unknown_person" }); continue; }
      if (given.has(person)) { result.skipped.push({ line, reason: "taken" }); continue; }
      let desk = desks.get(fold(deskName));
      if (!desk) {
        const area = c.area >= 0 ? areas.get(fold(row[c.area] ?? "")) : undefined;
        if (!area) { result.skipped.push({ line, reason: "no_area" }); continue; }
        const [d] = await tx<{ id: string }[]>`
          insert into desks (area_id, name, position) values (${area}, ${deskName}, (select coalesce(max(position) + 1, 0) from desks where area_id = ${area})) returning id`;
        desk = String(d!.id);
        desks.set(fold(deskName), desk);
        result.added++;
      }
      const [held] = await tx<{ assigned_to: string | null }[]>`select assigned_to from desks where id = ${desk}`;
      if (held?.assigned_to && held.assigned_to !== person) { result.skipped.push({ line, reason: "taken" }); continue; }
      // One desk each: a desk given before goes back.
      await tx`update desks set assigned_to = null where assigned_to = ${person} and id <> ${desk}`;
      await tx`update desks set assigned_to = ${person} where id = ${desk}`;
      result.cancelled.push(...await cancelDeskBookings(tx, actor!.id, tx`desk_id = ${desk} and member_id <> ${person} and upper(during) > now()`));
      given.add(person);
      result.given++;
    }
    return result;
  });
}

import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Fragment, Query, Sql } from "./db.ts";
import { clean, equipment as equipmentKeys, features as featureKeys, id, int, keysOf, limits, memberId, nextNames, placeName, type Equipment, type Feature } from "./model.ts";
import { dayKeys, enqueue } from "./calendar.ts";
import { cancelRoomBookings, type RoomBooking } from "./room-bookings.ts";

// The places of the company: offices, their floors, the areas of a floor
// where desks are, meeting rooms and desks. Everyone with a role reads them;
// an admin changes them. A room or desk removed while it has bookings is
// archived (its history stays, for the export); its coming bookings are
// cancelled and their people told (by the caller, from what is returned).

export type DeskView = { id: string; name: string; features: Feature[]; assignedTo: string | null };
// groupId: a Chest group the area or room is kept for (null: everyone).
export type AreaView = { id: string; name: string; groupId: string | null; desks: DeskView[] };
export type RoomView = { id: string; name: string; capacity: number; equipment: Equipment[]; note: string; photo: boolean; groupId: string | null };
export type FloorView = { id: string; name: string; rooms: RoomView[]; areas: AreaView[] };
// example: made by "Start with an example" (lib/example.ts).
export type OfficeView = { id: string; name: string; address: string; example: boolean; floors: FloorView[] };

function reader(actor: Member | null): void {
  if (!can(actor, "book")) throw new AppError("forbidden");
}
function admin(actor: Member | null): void {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
}

// Every office with what it holds (archived rooms and desks left out), in
// the admin's order. presets: the reader's words for the names the tool
// gave (model.ts placeName); without them, the names as stored.
export async function offices(sql: Query, actor: Member | null, presets?: Readonly<Record<string, string>>): Promise<OfficeView[]> {
  reader(actor);
  const [os, fs, as, rs, ds] = await Promise.all([
    sql<{ id: string; name: string; address: string; example: boolean }[]>`select id, name, address, example from offices order by position, id`,
    sql<{ id: string; office_id: string; name: string; preset: string | null }[]>`select id, office_id, name, preset from floors order by position, id`,
    sql<{ id: string; floor_id: string; name: string; preset: string | null; group_id: string | null }[]>`select id, floor_id, name, preset, group_id from areas order by position, id`,
    sql<{ id: string; floor_id: string; name: string; capacity: number; equipment: string[]; note: string; photo: string | null; group_id: string | null }[]>`
      select id, floor_id, name, capacity, equipment, note, photo, group_id from rooms where archived_at is null order by position, id`,
    sql<{ id: string; area_id: string; name: string; features: string[]; assigned_to: string | null }[]>`
      select id, area_id, name, features, assigned_to from desks where archived_at is null order by position, id`,
  ]);
  const desksOf = new Map<string, DeskView[]>();
  for (const d of ds) desksOf.set(String(d.area_id), [...(desksOf.get(String(d.area_id)) ?? []), { id: String(d.id), name: d.name, features: d.features.filter((f): f is Feature => (featureKeys as readonly string[]).includes(f)), assignedTo: d.assigned_to }]);
  const areasOf = new Map<string, AreaView[]>();
  for (const a of as) areasOf.set(String(a.floor_id), [...(areasOf.get(String(a.floor_id)) ?? []), { id: String(a.id), name: placeName(a.name, a.preset, presets), groupId: a.group_id, desks: desksOf.get(String(a.id)) ?? [] }]);
  const roomsOf = new Map<string, RoomView[]>();
  for (const r of rs) roomsOf.set(String(r.floor_id), [...(roomsOf.get(String(r.floor_id)) ?? []), { id: String(r.id), name: r.name, capacity: r.capacity, equipment: r.equipment.filter((e): e is Equipment => (equipmentKeys as readonly string[]).includes(e)), note: r.note, photo: r.photo !== null, groupId: r.group_id }]);
  const floorsOf = new Map<string, FloorView[]>();
  for (const f of fs) floorsOf.set(String(f.office_id), [...(floorsOf.get(String(f.office_id)) ?? []), { id: String(f.id), name: placeName(f.name, f.preset, presets), rooms: roomsOf.get(String(f.id)) ?? [], areas: areasOf.get(String(f.id)) ?? [] }]);
  return os.map(o => ({ id: String(o.id), name: o.name, address: o.address, example: o.example === true, floors: floorsOf.get(String(o.id)) ?? [] }));
}

// The office a page shows: the one asked for, else the member's own, else
// the first. Null when there is no office yet.
export async function chooseOffice(sql: Query, actor: Member, all: readonly OfficeView[], asked?: string | null): Promise<OfficeView | null> {
  if (asked) {
    const found = all.find(o => o.id === asked);
    if (found) return found;
  }
  const [pref] = await sql<{ office_id: string | null }[]>`select office_id from member_prefs where member_id = ${actor.id}`;
  return all.find(o => o.id === String(pref?.office_id)) ?? all[0] ?? null;
}

// A member picks the office they work from (a convenience, not a right).
export async function setMyOffice(sql: Sql, actor: Member | null, officeId: unknown): Promise<void> {
  reader(actor);
  const oid = id(officeId);
  const [found] = await sql`select 1 from offices where id = ${oid}`;
  if (!found) throw new AppError("not_found");
  await sql`insert into member_prefs (member_id, office_id) values (${actor!.id}, ${oid}) on conflict (member_id) do update set office_id = excluded.office_id`;
}

// ---------- Offices ----------

export async function addOffice(sql: Sql, actor: Member | null, input: { name?: unknown; address?: unknown }): Promise<{ id: string }> {
  admin(actor);
  const name = clean(input.name, limits.officeName);
  const address = clean(input.address, limits.address, { optional: true });
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`select count(*)::int as n from offices`;
  if (n >= limits.officesMax) throw new AppError("too_many", { max: limits.officesMax });
  const [row] = await sql<{ id: string }[]>`insert into offices (name, address, position) values (${name}, ${address}, ${n}) returning id`;
  return { id: String(row!.id) };
}

export async function updateOffice(sql: Sql, actor: Member | null, officeId: unknown, input: { name?: unknown; address?: unknown }): Promise<void> {
  admin(actor);
  const oid = id(officeId);
  const name = clean(input.name, limits.officeName);
  const address = clean(input.address, limits.address, { optional: true });
  const done = await sql`update offices set name = ${name}, address = ${address} where id = ${oid}`;
  if (done.count === 0) throw new AppError("not_found");
}

// An office, a floor or an area goes only once it holds no room or desk
// in use: removing places one by one says what is lost.
export async function removeOffice(sql: Sql, actor: Member | null, officeId: unknown): Promise<void> {
  admin(actor);
  const oid = id(officeId);
  const [held] = await sql<{ n: number }[]>`
    select (select count(*) from rooms r join floors f on f.id = r.floor_id where f.office_id = ${oid} and r.archived_at is null)
         + (select count(*) from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id where f.office_id = ${oid} and d.archived_at is null) as n`;
  if (Number(held?.n ?? 0) > 0) throw new AppError("not_empty");
  const done = await sql`delete from offices where id = ${oid}`;
  if (done.count === 0) throw new AppError("not_found");
}

// ---------- Floors and areas ----------

export async function addFloor(sql: Sql, actor: Member | null, officeId: unknown, name: unknown): Promise<{ id: string }> {
  admin(actor);
  const oid = id(officeId);
  const text = clean(name, limits.floorName);
  return sql.begin(async tx => {
    const [office] = await tx`select 1 from offices where id = ${oid} for update`;
    if (!office) throw new AppError("not_found");
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from floors where office_id = ${oid}`;
    if (n >= limits.floorsPerOffice) throw new AppError("too_many", { max: limits.floorsPerOffice });
    const [row] = await tx<{ id: string }[]>`insert into floors (office_id, name, position) values (${oid}, ${text}, ${n}) returning id`;
    return { id: String(row!.id) };
  });
}

export async function renameFloor(sql: Sql, actor: Member | null, floorId: unknown, name: unknown): Promise<void> {
  admin(actor);
  const done = await sql`update floors set name = ${clean(name, limits.floorName)}, preset = null where id = ${id(floorId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function removeFloor(sql: Sql, actor: Member | null, floorId: unknown): Promise<void> {
  admin(actor);
  const fid = id(floorId);
  const [held] = await sql<{ n: number }[]>`
    select (select count(*) from rooms where floor_id = ${fid} and archived_at is null)
         + (select count(*) from desks d join areas a on a.id = d.area_id where a.floor_id = ${fid} and d.archived_at is null) as n`;
  if (Number(held?.n ?? 0) > 0) throw new AppError("not_empty");
  const done = await sql`delete from floors where id = ${fid}`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function addArea(sql: Sql, actor: Member | null, floorId: unknown, name: unknown): Promise<{ id: string }> {
  admin(actor);
  const fid = id(floorId);
  const text = clean(name, limits.areaName);
  const [floor] = await sql`select 1 from floors where id = ${fid}`;
  if (!floor) throw new AppError("not_found");
  const [row] = await sql<{ id: string }[]>`insert into areas (floor_id, name, position) values (${fid}, ${text}, (select coalesce(max(position) + 1, 0) from areas where floor_id = ${fid})) returning id`;
  return { id: String(row!.id) };
}

export async function renameArea(sql: Sql, actor: Member | null, areaId: unknown, name: unknown): Promise<void> {
  admin(actor);
  const done = await sql`update areas set name = ${clean(name, limits.areaName)} , preset = null where id = ${id(areaId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

// Keeps an area's desks for a group (or opens them to everyone again).
// Bookings already made stay: a rule for what comes, not a purge.
export async function setAreaGroup(sql: Sql, actor: Member | null, areaId: unknown, groupId: unknown): Promise<void> {
  admin(actor);
  const done = await sql`update areas set group_id = ${groupOf(groupId)} where id = ${id(areaId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

export async function removeArea(sql: Sql, actor: Member | null, areaId: unknown): Promise<void> {
  admin(actor);
  const aid = id(areaId);
  const [held] = await sql<{ n: number }[]>`select count(*)::int as n from desks where area_id = ${aid} and archived_at is null`;
  if (Number(held?.n ?? 0) > 0) throw new AppError("not_empty");
  const done = await sql`delete from areas where id = ${aid}`;
  if (done.count === 0) throw new AppError("not_found");
}

// ---------- Rooms ----------

type RoomInput = { name?: unknown; capacity?: unknown; equipment?: unknown; note?: unknown; groupId?: unknown };
function roomFields(input: RoomInput) {
  return {
    name: clean(input.name, limits.roomName),
    capacity: int(input.capacity, 1, limits.capacity),
    equipment: keysOf(input.equipment, equipmentKeys),
    note: clean(input.note, limits.roomNote, { optional: true }),
    groupId: groupOf(input.groupId),
  };
}

// A group a place is kept for: a Chest group id, or none.
const groupPattern = /^grp_[a-z2-7]{26}$/u;
function groupOf(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !groupPattern.test(value)) throw new AppError("invalid");
  return value;
}

async function officeOfFloor(sql: Query, floorId: string): Promise<string> {
  const [row] = await sql<{ office_id: string }[]>`select office_id from floors where id = ${floorId}`;
  if (!row) throw new AppError("not_found");
  return String(row.office_id);
}

export async function addRoom(sql: Sql, actor: Member | null, floorId: unknown, input: RoomInput): Promise<{ id: string }> {
  admin(actor);
  const fid = id(floorId);
  const f = roomFields(input);
  return sql.begin(async tx => {
    const office = await officeOfFloor(tx, fid);
    await tx`select 1 from offices where id = ${office} for update`;
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from rooms r join floors f on f.id = r.floor_id where f.office_id = ${office} and r.archived_at is null`;
    if (n >= limits.roomsPerOffice) throw new AppError("too_many", { max: limits.roomsPerOffice });
    const [row] = await tx<{ id: string }[]>`
      insert into rooms (floor_id, name, capacity, equipment, note, group_id, position)
      values (${fid}, ${f.name}, ${f.capacity}, ${f.equipment}, ${f.note}, ${f.groupId}, (select coalesce(max(position) + 1, 0) from rooms where floor_id = ${fid}))
      returning id`;
    return { id: String(row!.id) };
  });
}

export async function updateRoom(sql: Sql, actor: Member | null, roomId: unknown, input: RoomInput & { floorId?: unknown }): Promise<void> {
  admin(actor);
  const rid = id(roomId);
  const f = roomFields(input);
  const [room] = await sql<{ floor_id: string }[]>`select floor_id from rooms where id = ${rid} and archived_at is null`;
  if (!room) throw new AppError("not_found");
  let floor = String(room.floor_id);
  if (input.floorId !== undefined && String(input.floorId) !== floor) {
    const target = id(input.floorId);
    // A room moves between the floors of its office only.
    if (await officeOfFloor(sql, target) !== await officeOfFloor(sql, floor)) throw new AppError("invalid");
    floor = target;
  }
  await sql`update rooms set name = ${f.name}, capacity = ${f.capacity}, equipment = ${f.equipment}, note = ${f.note}, group_id = ${f.groupId}, floor_id = ${floor} where id = ${rid}`;
}

export async function setRoomPhoto(sql: Sql, actor: Member | null, roomId: unknown, object: string | null): Promise<{ previous: string | null }> {
  admin(actor);
  const rid = id(roomId);
  const [room] = await sql<{ photo: string | null }[]>`select photo from rooms where id = ${rid} and archived_at is null`;
  if (!room) throw new AppError("not_found");
  await sql`update rooms set photo = ${object} where id = ${rid}`;
  return { previous: room.photo };
}

// The stored photo of a room, for whoever may see the room.
export async function roomPhoto(sql: Sql, actor: Member | null, roomId: unknown): Promise<string> {
  reader(actor);
  const [room] = await sql<{ photo: string | null }[]>`select photo from rooms where id = ${id(roomId)} and archived_at is null`;
  if (!room?.photo) throw new AppError("not_found");
  return room.photo;
}

// Removes a room: its coming bookings are cancelled (returned, to tell
// their people); archived when it has a history, deleted otherwise.
export async function removeRoom(sql: Sql, actor: Member | null, roomId: unknown, zone: string): Promise<{ cancelled: RoomBooking[]; photo: string | null }> {
  admin(actor);
  const rid = id(roomId);
  return sql.begin(async tx => {
    const [room] = await tx<{ photo: string | null }[]>`select photo from rooms where id = ${rid} and archived_at is null for update`;
    if (!room) throw new AppError("not_found");
    const cancelled = await cancelRoomBookings(tx, actor!.id, zone, tx`room_id = ${rid} and upper(during) > now()`);
    const [past] = await tx`select 1 from room_bookings where room_id = ${rid} and cancelled_at is null limit 1`;
    if (past) await tx`update rooms set archived_at = now(), photo = null where id = ${rid}`;
    else await tx`delete from rooms where id = ${rid}`;
    return { cancelled, photo: room.photo };
  });
}

// ---------- Desks ----------

type DeskInput = { name?: unknown; features?: unknown; assignedTo?: unknown };

export type CancelledDesk = { id: string; memberId: string; day: string; part: string; deskName: string };

async function areaOffice(sql: Query, areaId: string): Promise<string> {
  const [row] = await sql<{ office_id: string }[]>`select f.office_id from areas a join floors f on f.id = a.floor_id where a.id = ${areaId}`;
  if (!row) throw new AppError("not_found");
  return String(row.office_id);
}

// Adds count desks to an area, named after the office's last one ("D-07").
export async function addDesks(sql: Sql, actor: Member | null, areaId: unknown, count: unknown, features?: unknown): Promise<{ ids: string[] }> {
  admin(actor);
  const aid = id(areaId);
  const n = int(count, 1, limits.desksAtOnce);
  const fs = keysOf(features, featureKeys);
  return sql.begin(async tx => {
    const office = await areaOffice(tx, aid);
    await tx`select 1 from offices where id = ${office} for update`;
    const names = (await tx<{ name: string }[]>`
      select d.name from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id where f.office_id = ${office} and d.archived_at is null order by d.id`).map(r => r.name);
    if (names.length + n > limits.desksPerOffice) throw new AppError("too_many", { max: limits.desksPerOffice });
    const ids: string[] = [];
    // After the area's last desk, whatever numbers the others carry.
    const [{ p } = { p: 0 }] = await tx<{ p: number }[]>`select coalesce(max(position) + 1, 0)::int as p from desks where area_id = ${aid}`;
    for (const [i, name] of nextNames(names, n).entries()) {
      const [row] = await tx<{ id: string }[]>`insert into desks (area_id, name, features, position) values (${aid}, ${name.slice(0, limits.deskName)}, ${fs}, ${p + i}) returning id`;
      ids.push(String(row!.id));
    }
    return { ids };
  });
}

// Changes a desk; giving it to someone for good cancels the coming bookings
// of anyone else on it (returned, to tell them).
export async function updateDesk(sql: Sql, actor: Member | null, deskId: unknown, input: DeskInput & { areaId?: unknown }): Promise<{ cancelled: CancelledDesk[] }> {
  admin(actor);
  const did = id(deskId);
  const name = clean(input.name, limits.deskName);
  const fs = keysOf(input.features, featureKeys);
  const assigned = input.assignedTo === null || input.assignedTo === "" || input.assignedTo === undefined ? null : memberId(input.assignedTo);
  return sql.begin(async tx => {
    const [desk] = await tx<{ area_id: string }[]>`select area_id from desks where id = ${did} and archived_at is null for update`;
    if (!desk) throw new AppError("not_found");
    let area = String(desk.area_id);
    if (input.areaId !== undefined && String(input.areaId) !== area) {
      const target = id(input.areaId);
      if (await areaOffice(tx, target) !== await areaOffice(tx, area)) throw new AppError("invalid");
      area = target;
    }
    if (assigned) {
      // One desk each: giving a second one takes the first back.
      await tx`update desks set assigned_to = null where assigned_to = ${assigned} and id <> ${did}`;
    }
    const moved = area !== String(desk.area_id);
    await tx`update desks set name = ${name}, features = ${fs}, assigned_to = ${assigned}, area_id = ${area},
      position = ${moved ? tx`(select coalesce(max(position) + 1, 0) from desks where area_id = ${area})` : tx`position`} where id = ${did}`;
    const cancelled = assigned
      ? await cancelDeskBookings(tx, actor!.id, tx`desk_id = ${did} and member_id <> ${assigned} and upper(during) > now()`)
      : [];
    return { cancelled };
  });
}

export async function removeDesk(sql: Sql, actor: Member | null, deskId: unknown): Promise<{ cancelled: CancelledDesk[] }> {
  admin(actor);
  const did = id(deskId);
  return sql.begin(async tx => {
    const [desk] = await tx`select 1 from desks where id = ${did} and archived_at is null for update`;
    if (!desk) throw new AppError("not_found");
    const cancelled = await cancelDeskBookings(tx, actor!.id, tx`desk_id = ${did} and upper(during) > now()`);
    const [past] = await tx`select 1 from desk_bookings where desk_id = ${did} and cancelled_at is null limit 1`;
    if (past) await tx`update desks set archived_at = now(), assigned_to = null where id = ${did}`;
    else await tx`delete from desks where id = ${did}`;
    return { cancelled };
  });
}

// Cancels the live desk bookings a condition names; says which.
export async function cancelDeskBookings(tx: Query, by: string, where: Fragment): Promise<CancelledDesk[]> {
  const rows = await tx<{ id: string; member_id: string; day: string; part: string; name: string }[]>`
    update desk_bookings b set cancelled_at = now(), cancelled_by = ${by}
    from desks d where d.id = b.desk_id and b.cancelled_at is null and ${where}
    returning b.id, b.member_id, to_char(b.day, 'YYYY-MM-DD') as day, b.part, d.name`;
  const cancelled = rows.map(r => ({ id: String(r.id), memberId: r.member_id, day: r.day, part: r.part, deskName: r.name }));
  await enqueue(tx, dayKeys(cancelled));
  return cancelled;
}

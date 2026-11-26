import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Sql } from "./db.ts";
import { limits, type Equipment, type Feature, type Preset } from "../shared/model.ts";

// "Start with an example": an office in one click, for a company that
// wants to see Rooms working before it describes its own — two floors,
// three meeting rooms, twelve desks. It says it is an example (Places),
// its floors and areas are keys (each reader's language, shared/model.ts
// placeName), and it goes whole in one step while nobody booked anything
// in it (Undo, or "Delete the example" on Places).

type Words = {
  // The office's name, in the admin's language ("Example office").
  office: string;
  // The presets' words in the Chest's language: the names stored beside
  // the keys, for places no reader's language reaches.
  presets: Readonly<Record<Preset, string>>;
};

const floors: { preset: Preset; rooms: { name: string; capacity: number; equipment: Equipment[] }[]; area: { preset: Preset; desks: Feature[][] } }[] = [
  {
    preset: "ground",
    rooms: [
      { name: "Bora", capacity: 4, equipment: ["screen", "video"] },
      { name: "Calypso", capacity: 2, equipment: ["video", "phone"] },
    ],
    area: { preset: "quiet_zone", desks: [["screen", "quiet"], ["screen", "quiet", "window"], ["quiet"], ["screen", "dock", "quiet"]] },
  },
  {
    preset: "first",
    rooms: [{ name: "Atlas", capacity: 8, equipment: ["screen", "video", "whiteboard"] }],
    area: { preset: "open_space", desks: [["screen", "dock", "window"], ["screen", "dock", "window"], ["screen", "dock"], ["screen", "dock"], ["screen", "standing"], ["screen"], ["window"], []] },
  },
];

export async function addExample(sql: Sql, actor: Member | null, words: Words): Promise<{ id: string }> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  return sql.begin(async tx => {
    await tx`lock table offices in share row exclusive mode`;
    const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from offices`;
    if (n >= limits.officesMax) throw new AppError("too_many", { max: limits.officesMax });
    const [office] = await tx<{ id: string }[]>`insert into offices (name, address, position, example) values (${words.office.slice(0, limits.officeName)}, '', ${n}, true) returning id`;
    const oid = String(office!.id);
    let desk = 0, room = 0;
    // D-01 to D-08 in the open space upstairs, D-09 to D-12 downstairs.
    const firstNumber: Partial<Record<Preset, number>> = { first: 1, ground: 9 };
    for (const [position, f] of floors.entries()) {
      const [floor] = await tx<{ id: string }[]>`insert into floors (office_id, name, preset, position) values (${oid}, ${words.presets[f.preset]}, ${f.preset}, ${position}) returning id`;
      const fid = String(floor!.id);
      for (const r of f.rooms) await tx`insert into rooms (floor_id, name, capacity, equipment, position) values (${fid}, ${r.name}, ${r.capacity}, ${r.equipment}, ${room++})`;
      const [area] = await tx<{ id: string }[]>`insert into areas (floor_id, name, preset, position) values (${fid}, ${words.presets[f.area.preset]}, ${f.area.preset}, 0) returning id`;
      for (const [i, features] of f.area.desks.entries()) {
        const name = `D-${String((firstNumber[f.preset] ?? 1) + i).padStart(2, "0")}`;
        await tx`insert into desks (area_id, name, features, position) values (${String(area!.id)}, ${name}, ${features}, ${desk++})`;
      }
    }
    return { id: oid };
  });
}

// removeExample deletes an example office with everything in it — only an
// example, and only while no desk or room of it was ever booked (a booking,
// even cancelled, is someone's history: then its places go one by one).
export async function removeExample(sql: Sql, actor: Member | null, officeId: unknown): Promise<void> {
  if (!can(actor, "places.manage")) throw new AppError("forbidden");
  if (typeof officeId !== "string" || !/^[1-9][0-9]{0,17}$/u.test(officeId)) throw new AppError("not_found");
  await sql.begin(async tx => {
    const [office] = await tx<{ example: boolean }[]>`select example from offices where id = ${officeId} for update`;
    if (!office || !office.example) throw new AppError("not_found");
    const [used] = await tx<{ n: number }[]>`
      select (select count(*) from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id where f.office_id = ${officeId})
           + (select count(*) from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id where f.office_id = ${officeId}) as n`;
    if (Number(used?.n ?? 0) > 0) throw new AppError("example_used");
    await tx`update desks set assigned_to = null where area_id in (select a.id from areas a join floors f on f.id = a.floor_id where f.office_id = ${officeId})`;
    await tx`delete from offices where id = ${officeId}`;
  });
}

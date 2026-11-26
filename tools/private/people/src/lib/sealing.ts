import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as sealed from "@argentic/chest-sdk/sealed";
import type { Query } from "./db.ts";

// The most private part of an employee record — the home address and the
// emergency contact — sealed by the Chest (SDK 0.5+, the capability
// "sealed"): the database, the Data tab, the agents, the logs and the
// backups hold `chest:sealed:1:…`, shown as "Sealed"; the owner and the
// admins never read them in the Chest. Every open is journaled by the
// Chest. What lists, filters and the staff register need (names, dates,
// the contract) stays in clear.
//
// Two copies, each bound to its record (context):
// - HR's: each field sealed for the role "hr" — the Chest itself refuses
//   anyone else, whatever the tool's code does (`record:<id>`);
// - the person's: the four fields as one JSON value, sealed for no role
//   (`record:<id>:own`), opened only when the reader is the member the
//   record is about (recordAccess): they read their own record (GDPR
//   right of access), which a value sealed for "hr" alone would refuse
//   them. (A seal "for these roles or this member" would make it one copy:
//   written in the SDK report.)
//
// Opening needs the member's request (its Chest-Opener ticket): never in a
// schedule, an event, a log, a mail or an AI prompt. A value written before
// sealing (clear text) is read as it is and sealed by the next morning run
// (sealLegacy).
export const sealedFields = ["address", "emergencyName", "emergencyRelation", "emergencyPhone"] as const;
export type SealedField = (typeof sealedFields)[number];
export type Private = Record<SealedField, string>;
export const sealedColumns: Record<SealedField, string> = { address: "address", emergencyName: "emergency_name", emergencyRelation: "emergency_relation", emergencyPhone: "emergency_phone" };
export const hrRoles = ["hr"];

export const emptyPrivate = (): Private => ({ address: "", emergencyName: "", emergencyRelation: "", emergencyPhone: "" });
const hrContext = (recordId: string) => `record:${recordId}`;
const ownContext = (recordId: string) => `record:${recordId}:own`;
export const isSealedText = (value: unknown): boolean => sealed.isSealed(value);

// What is stored: HR's sealed copy of each field ("" stays "": nothing to
// hide) and the person's copy (null when every field is empty).
export type Stored = { hr: Private; own: string | null };

export async function sealPrivate(recordId: string, values: Private): Promise<Stored> {
  const filled = sealedFields.filter(f => values[f] !== "");
  if (filled.length === 0) return { hr: emptyPrivate(), own: null };
  const made = await sealed.sealMany([
    ...filled.map(f => ({ value: values[f], context: hrContext(recordId), roles: hrRoles })),
    { value: JSON.stringify(values), context: ownContext(recordId) },
  ]);
  const hr = emptyPrivate();
  filled.forEach((f, i) => { hr[f] = made[i]!; });
  return { hr, own: made[filled.length]! };
}

// What a reader sees of one record's private part:
// - "open": the values (HR, or the person their own);
// - "hidden": the reader may not open them (shown as "Only HR can open
//   this");
// - "locked": the Chest cannot open them now (restored and waiting for its
//   owner's recovery code, or the key lost): the rest of the record works.
export type Opened = { values: Private; state: "open" | "hidden" | "locked" };

export async function openPrivate(request: Request, reader: Member, row: { id: string; memberId: string | null; stored: Stored }): Promise<Opened> {
  const { hr, own } = row.stored;
  const legacy = sealedFields.every(f => !isSealedText(hr[f]));
  if (legacy) return { values: { ...hr }, state: "open" };
  try {
    if (reader.role === "hr") {
      const items = sealedFields.filter(f => isSealedText(hr[f]));
      const opened = await sealed.openMany(request, items.map(f => ({ sealed: hr[f], context: hrContext(row.id) })));
      if (opened.some(v => v === null)) return { values: emptyPrivate(), state: "hidden" };
      const values = { ...hr };
      items.forEach((f, i) => { values[f] = opened[i]!; });
      return { values, state: "open" };
    }
    if (row.memberId !== null && row.memberId === reader.id && own !== null) {
      const [text] = await sealed.openMany(request, [{ sealed: own, context: ownContext(row.id) }]);
      if (text === null || text === undefined) return { values: emptyPrivate(), state: "hidden" };
      return { values: { ...emptyPrivate(), ...pick(JSON.parse(text)) }, state: "open" };
    }
    return { values: emptyPrivate(), state: "hidden" };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { values: emptyPrivate(), state: "locked" };
  }
}

const pick = (value: unknown): Partial<Private> => {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  return Object.fromEntries(sealedFields.filter(f => typeof v[f] === "string").map(f => [f, v[f] as string]));
};

// A value asked in a change request, waiting for HR: sealed the same way
// (HR's copy for the role "hr", the person's for them), never kept in
// clear; once answered, only the fields' names stay.
export type SealedAsk = { fields: string[]; hr: string; own: string };
const askContext = (recordId: string, who: "hr" | "own") => `request:${recordId}:${who}`;

export async function sealAsk(recordId: string, changes: Partial<Private>): Promise<SealedAsk> {
  const text = JSON.stringify(changes);
  const [hr, own] = await sealed.sealMany([{ value: text, context: askContext(recordId, "hr"), roles: hrRoles }, { value: text, context: askContext(recordId, "own") }]);
  return { fields: Object.keys(changes), hr: hr!, own: own! };
}

export const isSealedAsk = (value: unknown): value is SealedAsk =>
  !!value && typeof value === "object" && !Array.isArray(value) && typeof (value as SealedAsk).hr === "string" && Array.isArray((value as SealedAsk).fields);

// The asked values for this reader: HR opens HR's copy, the person theirs;
// null when they cannot be opened (then only the fields' names show).
export async function openAsk(request: Request, reader: Member, recordId: string, memberId: string, ask: SealedAsk): Promise<Partial<Private> | null> {
  try {
    const mine = reader.role !== "hr" && reader.id === memberId;
    if (reader.role !== "hr" && !mine) return null;
    const [text] = await sealed.openMany(request, [mine ? { sealed: ask.own, context: askContext(recordId, "own") } : { sealed: ask.hr, context: askContext(recordId, "hr") }]);
    return text === null || text === undefined ? null : pick(JSON.parse(text));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
}

// sealLegacy seals what was written in clear before this version (the
// morning run: sealing needs no member). Says how many records it sealed.
export async function sealLegacy(sql: Query): Promise<number> {
  const rows = await sql<{ id: string; address: string; emergency_name: string; emergency_relation: string; emergency_phone: string }[]>`
    select id::text as id, address, emergency_name, emergency_relation, emergency_phone from records
    where erased_at is null and (
      (address <> '' and address not like 'chest:sealed:%') or (emergency_name <> '' and emergency_name not like 'chest:sealed:%')
      or (emergency_relation <> '' and emergency_relation not like 'chest:sealed:%') or (emergency_phone <> '' and emergency_phone not like 'chest:sealed:%'))
    limit 200`;
  let done = 0;
  for (const r of rows) {
    const values: Private = { address: r.address, emergencyName: r.emergency_name, emergencyRelation: r.emergency_relation, emergencyPhone: r.emergency_phone };
    // A row half sealed (cannot happen through the tool) is left to HR.
    if (sealedFields.some(f => isSealedText(values[f]))) continue;
    let stored: Stored;
    try {
      stored = await sealPrivate(r.id, values);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      return done;
    }
    const changed = await sql`
      update records set address = ${stored.hr.address}, emergency_name = ${stored.hr.emergencyName}, emergency_relation = ${stored.hr.emergencyRelation},
        emergency_phone = ${stored.hr.emergencyPhone}, own_sealed = ${stored.own}
      where id = ${r.id} and address = ${r.address} and emergency_name = ${r.emergency_name} and emergency_relation = ${r.emergency_relation} and emergency_phone = ${r.emergency_phone}`;
    done += changed.count;
  }
  const asks = await sql<{ id: string; record_id: string; changes: Partial<Private> }[]>`
    select id::text as id, record_id::text as record_id, changes from record_requests
    where status = 'waiting' and jsonb_typeof(changes) = 'object' and not (changes ? 'hr') limit 200`;
  for (const q of asks) {
    try {
      const ask = await sealAsk(q.record_id, pick(q.changes));
      await sql`update record_requests set changes = ${sql.json(ask)} where id = ${q.id} and status = 'waiting' and not (changes ? 'hr')`;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      break;
    }
  }
  return done;
}

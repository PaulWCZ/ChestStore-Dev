import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can, recordAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { note } from "./journal.ts";
import {
  addDays, clean, day, documentTypes, fromElsewhere, hours, id, isContract, isDocumentKind, keepRecordYears,
  limits, memberId, phone, sexes, type Contract, type DocumentKind, type Sex,
} from "./model.ts";
import { everyone, present } from "./people.ts";

// Employee records: what HR keeps about each person employed — identity as
// the staff register needs it, the contract, the emergency contact, the
// documents. HR edits them; the person reads their own; nobody else knows
// they exist (a manager sees nothing of their reports'). Every opening and
// every change is written in the journal (lib/journal.ts), with the names
// of the fields, never their values.
//
// Someone without the Chest (a warehouse worker, an intern) gets a record
// too: the register lists everyone. After they left, a record stays five
// years (R1221-26), then goes with its documents.

export type Fields = {
  legalName: string; sex: Sex | null; birthDate: string | null; nationality: string; job: string; qualification: string;
  contract: Contract; workingTime: "full" | "part"; hours: number | null;
  startDate: string | null; trialEnd: string | null; contractEnd: string | null; endDate: string | null;
  workPermit: string; agency: string; tutorId: string | null; workplace: string;
  emergencyName: string; emergencyRelation: string; emergencyPhone: string; address: string;
};
export type Field = keyof Fields;
export const fieldNames: Field[] = [
  "legalName", "sex", "birthDate", "nationality", "job", "qualification", "contract", "workingTime", "hours", "startDate", "trialEnd", "contractEnd", "endDate",
  "workPermit", "agency", "tutorId", "workplace", "emergencyName", "emergencyRelation", "emergencyPhone", "address",
];

export type Document = { id: string; kind: DocumentKind; name: string; type: string; size: number; addedBy: string; addedAt: string };
export type HrRecord = Fields & { id: string; memberId: string | null; erased: boolean; updatedAt: string; documents: Document[] };
export type Summary = Pick<HrRecord, "id" | "memberId" | "legalName" | "job" | "contract" | "workingTime" | "startDate" | "trialEnd" | "contractEnd" | "endDate" | "erased"> & { missing: Field[] };

type Row = {
  id: string; member_id: string | null; legal_name: string; sex: Sex | null; birth_date: string | null; nationality: string; job: string; qualification: string;
  contract: Contract; working_time: "full" | "part"; hours: string | null; start_date: string | null; trial_end: string | null; contract_end: string | null; end_date: string | null;
  work_permit: string; agency: string; tutor_id: string | null; workplace: string; emergency_name: string; emergency_relation: string; emergency_phone: string; address: string;
  erased_at: Date | null; updated_at: Date;
};
const d = (column: string) => `to_char(${column}, 'YYYY-MM-DD') as ${column}`;
const columns = [
  "id", "member_id", "legal_name", "sex", d("birth_date"), "nationality", "job", "qualification", "contract", "working_time", "hours::text as hours",
  d("start_date"), d("trial_end"), d("contract_end"), d("end_date"), "work_permit", "agency", "tutor_id", "workplace",
  "emergency_name", "emergency_relation", "emergency_phone", "address", "erased_at", "updated_at",
].join(", ");

const toFields = (r: Row): Fields => ({
  legalName: r.legal_name, sex: r.sex, birthDate: r.birth_date, nationality: r.nationality, job: r.job, qualification: r.qualification,
  contract: r.contract, workingTime: r.working_time, hours: r.hours === null ? null : Number(r.hours),
  startDate: r.start_date, trialEnd: r.trial_end, contractEnd: r.contract_end, endDate: r.end_date,
  workPermit: r.work_permit, agency: r.agency, tutorId: r.tutor_id, workplace: r.workplace,
  emergencyName: r.emergency_name, emergencyRelation: r.emergency_relation, emergencyPhone: r.emergency_phone, address: r.address,
});

// What the staff register needs and the record does not say yet. A work
// permit cannot be checked (only foreign workers have one).
export function missing(f: Fields): Field[] {
  const gaps: Field[] = [];
  if (f.contract === "internship") {
    if (!f.startDate) gaps.push("startDate");
    if (!f.contractEnd) gaps.push("contractEnd");
    if (!f.tutorId) gaps.push("tutorId");
    if (!f.workplace) gaps.push("workplace");
    return gaps;
  }
  if (!f.sex) gaps.push("sex");
  if (!f.birthDate) gaps.push("birthDate");
  if (!f.nationality) gaps.push("nationality");
  if (!f.job) gaps.push("job");
  if (!f.qualification) gaps.push("qualification");
  if (!f.startDate) gaps.push("startDate");
  if (fromElsewhere(f.contract) && !f.agency) gaps.push("agency");
  return gaps;
}

function hr(actor: Member | null): Member {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  return actor;
}

async function load(sql: Query, key: string): Promise<(Row & { documents: Document[] }) | null> {
  const [row] = await sql.unsafe<Row[]>(`select ${columns} from records where id = $1`, [key]);
  if (!row) return null;
  const docs = await sql<{ id: string; kind: DocumentKind; name: string; type: string; size: string; added_by: string; added_at: Date }[]>`
    select id, kind, name, type, size, added_by, added_at from record_documents where record_id = ${key} order by added_at desc, id desc`;
  return { ...row, documents: docs.map(x => ({ id: String(x.id), kind: x.kind, name: x.name, type: x.type, size: Number(x.size), addedBy: x.added_by, addedAt: x.added_at.toISOString() })) };
}

const toRecord = (r: Row & { documents: Document[] }): HrRecord => ({
  ...toFields(r), id: String(r.id), memberId: r.member_id, erased: r.erased_at !== null, updatedAt: r.updated_at.toISOString(), documents: r.documents,
});

// One record, for HR or its person; opening it by anyone else than its
// person is written in the journal.
export async function record(sql: Query, actor: Member | null, recordId: unknown): Promise<{ record: HrRecord; access: "edit" | "read" }> {
  const found = await load(sql, id(recordId));
  const access = found ? recordAccess(actor, { memberId: found.member_id }) : null;
  if (!found || !access) throw new AppError("not_found");
  if (found.member_id !== actor!.id) await note(sql, actor!, "viewed", { recordId: String(found.id) });
  return { record: toRecord(found), access };
}

// The record of a member, as a link: for HR, or for the member themselves.
export async function recordIdOf(sql: Query, actor: Member | null, member: string): Promise<string | null> {
  if (!actor || recordAccess(actor, { memberId: member }) === null) return null;
  const [row] = await sql<{ id: string }[]>`select id from records where member_id = ${member}`;
  return row ? String(row.id) : null;
}

// The members who have a record (HR's first-run steps).
export async function membersWithRecord(sql: Query, actor: Member | null): Promise<Set<string>> {
  hr(actor);
  return new Set((await sql<{ member_id: string }[]>`select member_id from records where member_id is not null`).map(r => r.member_id));
}

// HR's list: everyone with a record, current first, then those who left.
export async function listRecords(sql: Query, actor: Member | null): Promise<Summary[]> {
  hr(actor);
  const rows = await sql.unsafe<Row[]>(`select ${columns} from records order by end_date is not null, end_date desc, lower(legal_name), id limit 5000`);
  return rows.map(r => {
    const f = toFields(r);
    return { id: String(r.id), memberId: r.member_id, legalName: f.legalName, job: f.job, contract: f.contract, workingTime: f.workingTime, startDate: f.startDate, trialEnd: f.trialEnd, contractEnd: f.contractEnd, endDate: f.endDate, erased: r.erased_at !== null, missing: missing(f) };
  });
}

// A new record: for a member (its legal name, job and start date taken
// from the Chest and the profile, for HR to check), or for someone without
// the Chest (a name). Says the record's id.
export async function createRecord(sql: Sql, actor: Member | null, input: { memberId?: unknown; legalName?: unknown }): Promise<{ id: string }> {
  const who = hr(actor);
  if (input?.memberId !== undefined && input.memberId !== null && input.memberId !== "") {
    const member = memberId(input.memberId);
    const listed = await everyone();
    const person = listed.people.find(p => p.id === member);
    if (!person) throw new AppError("not_member");
    const [done] = await createFor(sql, who, [{ id: member, name: person.name }]);
    return { id: done!.id };
  }
  const name = clean(input?.legalName, limits.name);
  const [row] = await sql<{ id: string }[]>`insert into records (legal_name, created_by) values (${name}, ${who.id}) returning id`;
  await note(sql, who, "created", { recordId: String(row!.id) });
  return { id: String(row!.id) };
}

// Records for everyone in the directory who has none yet (one click on an
// empty list): legal names, jobs and start dates from what People knows.
export async function createForEveryone(sql: Sql, actor: Member | null): Promise<number> {
  const who = hr(actor);
  const listed = await everyone();
  if (!listed.ok) throw new AppError("unavailable");
  return (await createFor(sql, who, listed.people.map(p => ({ id: p.id, name: p.name })))).filter(r => r.created).length;
}

async function createFor(sql: Sql, actor: Member, people: { id: string; name: string }[]): Promise<{ id: string; created: boolean }[]> {
  if (people.length === 0) return [];
  return sql.begin(async tx => {
    const made: { id: string; created: boolean }[] = [];
    for (const p of people) {
      const [existing] = await tx<{ id: string }[]>`select id from records where member_id = ${p.id}`;
      if (existing) {
        made.push({ id: String(existing.id), created: false });
        continue;
      }
      const [profile] = await tx<{ title: string; start_date: string | null }[]>`select title, to_char(start_date, 'YYYY-MM-DD') as start_date from profiles where member_id = ${p.id}`;
      const [row] = await tx<{ id: string }[]>`
        insert into records (member_id, legal_name, job, start_date, created_by)
        values (${p.id}, ${[...p.name].slice(0, limits.name).join("") || "?"}, ${profile?.title ?? ""}, ${profile?.start_date ?? null}, ${actor.id})
        on conflict (member_id) do nothing returning id`;
      if (!row) continue;
      made.push({ id: String(row.id), created: true });
      await note(tx, actor, "created", { recordId: String(row.id) });
    }
    return made;
  });
}

// Reading what HR typed, field by field; only the fields given change.
function read(given: { [key: string]: unknown }): Partial<Fields> {
  const f: Partial<Fields> = {};
  const text = (key: string, max: number, multiline = false) => clean(given[key], max, { optional: true, multiline });
  const date = (key: string, from = 1950) => day(given[key], { optional: true, from });
  for (const key of Object.keys(given)) {
    switch (key) {
      case "legalName": f.legalName = clean(given[key], limits.name); break;
      case "sex": {
        const v = given[key];
        if (v === null || v === "") f.sex = null;
        else if (typeof v === "string" && (sexes as readonly string[]).includes(v)) f.sex = v as Sex;
        else throw new AppError("invalid");
        break;
      }
      case "birthDate": f.birthDate = date(key, 1900); break;
      case "nationality": f.nationality = text(key, limits.nationality); break;
      case "job": f.job = text(key, limits.title); break;
      case "qualification": f.qualification = text(key, limits.qualification); break;
      case "contract":
        if (!isContract(given[key])) throw new AppError("invalid");
        f.contract = given[key] as Contract;
        break;
      case "workingTime":
        if (given[key] !== "full" && given[key] !== "part") throw new AppError("invalid");
        f.workingTime = given[key] as "full" | "part";
        break;
      case "hours": f.hours = hours(given[key]); break;
      case "startDate": f.startDate = date(key, 1900); break;
      case "trialEnd": f.trialEnd = date(key, 1900); break;
      case "contractEnd": f.contractEnd = date(key, 1900); break;
      case "endDate": f.endDate = date(key, 1900); break;
      case "workPermit": f.workPermit = text(key, limits.workPermit); break;
      case "agency": f.agency = text(key, limits.agency, true); break;
      case "tutorId": f.tutorId = given[key] === null || given[key] === "" ? null : memberId(given[key]); break;
      case "workplace": f.workplace = text(key, limits.workplace); break;
      case "emergencyName": f.emergencyName = text(key, limits.name); break;
      case "emergencyRelation": f.emergencyRelation = text(key, limits.relation); break;
      case "emergencyPhone": f.emergencyPhone = phone(given[key]); break;
      case "address": f.address = text(key, limits.address, true); break;
      default: throw new AppError("invalid");
    }
  }
  return f;
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

export async function updateRecord(sql: Sql, actor: Member | null, recordId: unknown, input: unknown): Promise<{ changed: Field[] }> {
  const who = hr(actor);
  const key = id(recordId);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AppError("invalid");
  const given = read(input as { [key: string]: unknown });
  return sql.begin(async tx => {
    const current = await load(tx, key);
    if (!current) throw new AppError("not_found");
    const before = toFields(current);
    const next: Fields = { ...before, ...given };
    if (given.tutorId && given.tutorId !== before.tutorId && !(await present([given.tutorId])).has(given.tutorId)) throw new AppError("not_member");
    for (const end of [next.trialEnd, next.contractEnd, next.endDate]) if (end && next.startDate && end < next.startDate) throw new AppError("dates");
    const changed = fieldNames.filter(f => !same(before[f], next[f]));
    if (changed.length === 0) return { changed };
    await tx`
      update records set legal_name = ${next.legalName}, sex = ${next.sex}, birth_date = ${next.birthDate}, nationality = ${next.nationality}, job = ${next.job},
        qualification = ${next.qualification}, contract = ${next.contract}, working_time = ${next.workingTime}, hours = ${next.hours},
        start_date = ${next.startDate}, trial_end = ${next.trialEnd}, contract_end = ${next.contractEnd}, end_date = ${next.endDate},
        work_permit = ${next.workPermit}, agency = ${next.agency}, tutor_id = ${next.tutorId}, workplace = ${next.workplace},
        emergency_name = ${next.emergencyName}, emergency_relation = ${next.emergencyRelation}, emergency_phone = ${next.emergencyPhone}, address = ${next.address},
        updated_at = now()
      where id = ${key}`;
    await note(tx, who, "changed", { recordId: key, fields: changed });
    return { changed };
  });
}

// Linking a record to the member it is about (someone who got the Chest),
// or unlinking it (null).
export async function linkRecord(sql: Sql, actor: Member | null, recordId: unknown, member: unknown): Promise<void> {
  const who = hr(actor);
  const key = id(recordId);
  const target = member === null || member === "" ? null : memberId(member);
  if (target && !(await present([target])).has(target)) throw new AppError("not_member");
  await sql.begin(async tx => {
    if (target) {
      const [taken] = await tx`select 1 from records where member_id = ${target} and id <> ${key}`;
      if (taken) throw new AppError("invalid");
    }
    const done = await tx`update records set member_id = ${target}, updated_at = now() where id = ${key} and erased_at is null`;
    if (done.count === 0) throw new AppError("not_found");
    await note(tx, who, "linked", { recordId: key, fields: ["memberId"] });
  });
}

// A record made by mistake goes; the record of someone who worked here
// stays until five years after they left (the register must show them).
export async function deleteRecord(sql: Sql, actor: Member | null, recordId: unknown, now: string): Promise<void> {
  hr(actor);
  const key = id(recordId);
  const [row] = await sql<{ start_date: string | null }[]>`select to_char(start_date, 'YYYY-MM-DD') as start_date from records where id = ${key}`;
  if (!row) throw new AppError("not_found");
  if (row.start_date !== null && row.start_date <= now) throw new AppError("started");
  await removeRecords(sql, [key]);
}

async function removeRecords(sql: Query, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const objects = await sql<{ object: string }[]>`select object from record_documents where record_id in ${sql(ids)}`;
  await sql`delete from records where id in ${sql(ids)}`;
  for (const o of objects) await dropFile(o.object);
}

async function dropFile(object: string): Promise<void> {
  try {
    await files.delete(object);
  } catch (error) {
    // Kept in the Chest's storage when it cannot be reached: an orphan the
    // next purge does not see — said in the README, never an error here.
    if (!(error instanceof ChestError)) throw error;
  }
}

// Documents: the browser sends the file straight to the Chest (uploadUrl),
// then says it is there; People records it once the Chest confirms it.
const objectPattern = (recordId: string) => new RegExp(`^records/${recordId}/[0-9a-f]{20}\\.[a-z]{2,5}$`, "u");

export async function documentUpload(sql: Query, actor: Member | null, recordId: unknown, input: { type?: unknown; size?: unknown }): Promise<{ url: string }> {
  hr(actor);
  const key = id(recordId);
  const [row] = await sql<{ n: number }[]>`select (select count(*)::int from record_documents where record_id = r.id) as n from records r where r.id = ${key}`;
  if (!row) throw new AppError("not_found");
  if (row.n >= limits.documentsPerRecord) throw new AppError("too_many", { max: limits.documentsPerRecord });
  if (typeof input?.type !== "string" || !(documentTypes as readonly string[]).includes(input.type)) throw new AppError("type_refused");
  if (typeof input.size !== "number" || input.size <= 0) throw new AppError("invalid");
  if (input.size > limits.documentBytes) throw new AppError("too_large", { max: Math.round(limits.documentBytes / (1 << 20)) });
  const up = await files.uploadUrl(`records/${key}/`, { maxSize: limits.documentBytes, types: [...documentTypes], expiresIn: 600 });
  return { url: up.url };
}

export async function addDocument(sql: Sql, actor: Member | null, recordId: unknown, input: { object?: unknown; name?: unknown; kind?: unknown }): Promise<Document> {
  const who = hr(actor);
  const key = id(recordId);
  if (typeof input?.object !== "string" || !objectPattern(key).test(input.object)) throw new AppError("invalid");
  const kind: DocumentKind = isDocumentKind(input.kind) ? input.kind : "other";
  const name = clean(input.name, limits.documentName);
  const info = await files.stat(input.object);
  if (!info) throw new AppError("not_found");
  return sql.begin(async tx => {
    const [owner] = await tx`select 1 from records where id = ${key} for update`;
    if (!owner) throw new AppError("not_found");
    const [row] = await tx<{ id: string; added_at: Date }[]>`
      insert into record_documents (record_id, kind, name, object, type, size, added_by)
      values (${key}, ${kind}, ${name}, ${input.object as string}, ${info.type}, ${info.size}, ${who.id})
      on conflict (object) do nothing returning id, added_at`;
    if (!row) throw new AppError("invalid");
    await note(tx, who, "document_added", { recordId: key, fields: [kind] });
    return { id: String(row.id), kind, name, type: info.type, size: info.size, addedBy: who.id, addedAt: row.added_at.toISOString() };
  });
}

export async function removeDocument(sql: Sql, actor: Member | null, recordId: unknown, documentId: unknown): Promise<void> {
  const who = hr(actor);
  const key = id(recordId);
  const [row] = await sql<{ object: string; kind: string }[]>`delete from record_documents where id = ${id(documentId)} and record_id = ${key} returning object, kind`;
  if (!row) throw new AppError("not_found");
  await note(sql, who, "document_removed", { recordId: key, fields: [row.kind] });
  await dropFile(row.object);
}

// A fresh link to a document, for HR or the record's person (written in
// the journal when someone else opens it).
export async function openDocument(sql: Query, actor: Member | null, recordId: unknown, documentId: unknown): Promise<string> {
  const key = id(recordId);
  const [row] = await sql<{ object: string; kind: string; member_id: string | null }[]>`
    select d.object, d.kind, r.member_id from record_documents d join records r on r.id = d.record_id where d.id = ${id(documentId)} and d.record_id = ${key}`;
  if (!row || !recordAccess(actor, { memberId: row.member_id })) throw new AppError("not_found");
  if (row.member_id !== actor!.id) await note(sql, actor!, "document_opened", { recordId: key, fields: [row.kind] });
  return (await files.url(row.object)).url;
}

// What HR should see coming: trial periods ending in the next 14 days,
// contracts with an end in the next 30, of people still here.
export type Upcoming = { id: string; memberId: string | null; legalName: string; what: "trial" | "contract"; day: string };

export async function upcoming(sql: Query, now: string): Promise<Upcoming[]> {
  const rows = await sql<{ id: string; member_id: string | null; legal_name: string; trial_end: string | null; contract_end: string | null }[]>`
    select id, member_id, legal_name, to_char(trial_end, 'YYYY-MM-DD') as trial_end, to_char(contract_end, 'YYYY-MM-DD') as contract_end from records
    where end_date is null and erased_at is null
      and ((trial_end between ${now}::date and ${addDays(now, 14)}::date) or (contract_end between ${now}::date and ${addDays(now, 30)}::date))
    order by least(trial_end, contract_end), id limit 200`;
  const found: Upcoming[] = [];
  for (const r of rows) {
    if (r.trial_end && r.trial_end >= now && r.trial_end <= addDays(now, 14)) found.push({ id: String(r.id), memberId: r.member_id, legalName: r.legal_name, what: "trial", day: r.trial_end });
    if (r.contract_end && r.contract_end >= now && r.contract_end <= addDays(now, 30)) found.push({ id: String(r.id), memberId: r.member_id, legalName: r.legal_name, what: "contract", day: r.contract_end });
  }
  return found.sort((a, b) => a.day.localeCompare(b.day));
}

// Five years after the day someone left, their record goes (R1221-26).
export async function purgeRecords(sql: Query, now: string): Promise<number> {
  const gone = await sql<{ id: string }[]>`select id from records where end_date is not null and end_date < ${now}::date - make_interval(years => ${keepRecordYears})`;
  await removeRecords(sql, gone.map(g => String(g.id)));
  return gone.length;
}

// An erasure: a record of someone who never started goes; the record of
// someone who worked here keeps only what the register must show (the law
// requires it for five years after they left: GDPR art. 17(3)(b)) and the
// contracts and certificates, detached from the member; the emergency
// contact, the address and the other documents go.
export async function eraseRecords(sql: Query, member: string, now: string): Promise<void> {
  const rows = await sql<{ id: string; start_date: string | null }[]>`select id, to_char(start_date, 'YYYY-MM-DD') as start_date from records where member_id = ${member}`;
  for (const r of rows) {
    const key = String(r.id);
    if (r.start_date === null || r.start_date > now) {
      await removeRecords(sql, [key]);
      continue;
    }
    const personal = await sql<{ object: string }[]>`delete from record_documents where record_id = ${key} and kind in ('identity', 'other') returning object`;
    await sql`
      update records set member_id = null, erased_at = now(), emergency_name = '', emergency_relation = '', emergency_phone = '', address = '',
        end_date = coalesce(end_date, ${now}::date), updated_at = now()
      where id = ${key}`;
    for (const o of personal) await dropFile(o.object);
  }
  await sql`update records set tutor_id = null where tutor_id = ${member}`;
  await sql`update records set created_by = 'erased' where created_by = ${member}`;
  await sql`update record_documents set added_by = 'erased' where added_by = ${member}`;
}

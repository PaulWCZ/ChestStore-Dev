import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { toCsv } from "./csv.ts";
import type { Query } from "./db.ts";
import { note } from "./journal.ts";
import type { Contract, Sex } from "./model.ts";
import { missing, type Field } from "./records.ts";

// The staff register (registre unique du personnel), as French law asks
// every establishment with employees to keep it (Code du travail L1221-13,
// D1221-23, R1221-26 — sources and dates in THIRD_PARTY.md):
//
// - employees in the order they were hired: name and first names,
//   nationality, date of birth, sex, job, qualification, dates of entry and
//   exit, the type and number of a foreign worker's permit, and the
//   mentions "fixed-term contract", "temporary worker" (with the agency's
//   name and address), "seconded" (with the employer's), "part-time",
//   "apprentice", "work-study contract";
// - in a part of its own, interns in the order they arrived: name, dates,
//   tutor, where they are present;
// - kept five years after each person left.
//
// People writes it from the employee records: the numbering follows the
// order of entry, never changes when a record is corrected, and each read
// or download is written in the journal.
export type Line = {
  number: number; recordId: string; name: string; nationality: string; birthDate: string | null; sex: Sex | null; job: string; qualification: string;
  startDate: string; endDate: string | null; workPermit: string; contract: Contract; partTime: boolean; agency: string;
  tutorId: string | null; workplace: string; contractEnd: string | null; missing: Field[];
};
export type Register = { employees: Line[]; interns: Line[] };

type Row = {
  id: string; legal_name: string; nationality: string; birth_date: string | null; sex: Sex | null; job: string; qualification: string; start_date: string;
  end_date: string | null; work_permit: string; contract: Contract; working_time: "full" | "part"; hours: string | null; agency: string; tutor_id: string | null;
  workplace: string; contract_end: string | null; trial_end: string | null;
};

export async function register(sql: Query, actor: Member | null, as: "register_viewed" | "register_exported"): Promise<Register> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select id, legal_name, nationality, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, job, qualification, to_char(start_date, 'YYYY-MM-DD') as start_date,
      to_char(end_date, 'YYYY-MM-DD') as end_date, work_permit, contract, working_time, hours::text as hours, agency, tutor_id, workplace,
      to_char(contract_end, 'YYYY-MM-DD') as contract_end, to_char(trial_end, 'YYYY-MM-DD') as trial_end
    from records where start_date is not null order by start_date, id`;
  await note(sql, actor, as);
  const employees: Line[] = [];
  const interns: Line[] = [];
  for (const r of rows) {
    const list = r.contract === "internship" ? interns : employees;
    list.push({
      number: list.length + 1, recordId: String(r.id), name: r.legal_name, nationality: r.nationality, birthDate: r.birth_date, sex: r.sex, job: r.job,
      qualification: r.qualification, startDate: r.start_date, endDate: r.end_date, workPermit: r.work_permit, contract: r.contract, partTime: r.working_time === "part",
      agency: r.agency, tutorId: r.tutor_id, workplace: r.workplace, contractEnd: r.contract_end,
      missing: missing({
        legalName: r.legal_name, sex: r.sex, birthDate: r.birth_date, nationality: r.nationality, job: r.job, qualification: r.qualification, contract: r.contract,
        workingTime: r.working_time, hours: r.hours === null ? null : Number(r.hours), startDate: r.start_date, trialEnd: r.trial_end, contractEnd: r.contract_end,
        endDate: r.end_date, workPermit: r.work_permit, agency: r.agency, tutorId: r.tutor_id, workplace: r.workplace,
        emergencyName: "", emergencyRelation: "", emergencyPhone: "", address: "",
      }),
    });
  }
  return { employees, interns };
}

// What the register cannot list, so that it never leaves someone out
// silently (a labour inspector is handed the printed register):
// - withoutRecord: members of the directory with no HR record at all;
// - noStart: records without a first day (the register is ordered by it);
// - noExit: people in the register who left the Chest, no exit date written;
// - tutorLeft: interns still here whose tutor left (an intern needs one).
export type Gaps = {
  withoutRecord: { id: string; name: string }[];
  noStart: { recordId: string; name: string }[];
  noExit: { recordId: string; name: string }[];
  tutorLeft: { recordId: string; name: string }[];
};

export async function registerGaps(sql: Query, actor: Member | null, r: Register, directory: readonly { id: string; name: string }[], today: string): Promise<Gaps> {
  if (!actor || !can(actor, "records.manage")) throw new AppError("forbidden");
  const listed = new Set(directory.map(p => p.id));
  const rows = await sql<{ id: string; member_id: string | null; legal_name: string; start_date: string | null; end_date: string | null; erased: boolean }[]>`
    select id, member_id, legal_name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, erased_at is not null as erased from records`;
  const linked = new Set(rows.flatMap(x => (x.member_id ? [x.member_id] : [])));
  const byId = new Map(rows.map(x => [String(x.id), x]));
  return {
    withoutRecord: directory.filter(p => !linked.has(p.id)).map(p => ({ id: p.id, name: p.name })),
    noStart: rows.filter(x => !x.start_date && !x.end_date && !x.erased).map(x => ({ recordId: String(x.id), name: x.legal_name })),
    noExit: [...r.employees, ...r.interns].filter(l => !l.endDate && byId.get(l.recordId)?.member_id && !listed.has(byId.get(l.recordId)!.member_id!)).map(l => ({ recordId: l.recordId, name: l.name })),
    tutorLeft: r.interns.filter(l => l.tutorId && !listed.has(l.tutorId) && (l.endDate ?? l.contractEnd ?? "9999") >= today).map(l => ({ recordId: l.recordId, name: l.name })),
  };
}

// The mentions the law asks for, in the reader's words.
export type MentionWords = { fixed_term: string; temporary: string; seconded: string; apprenticeship: string; professionalisation: string; partTime: string };

export function mentions(line: Pick<Line, "contract" | "partTime" | "agency">, words: MentionWords): string {
  const found: string[] = [];
  if (line.contract === "fixed_term") found.push(words.fixed_term);
  if (line.contract === "apprenticeship") found.push(words.apprenticeship);
  if (line.contract === "professionalisation") found.push(words.professionalisation);
  if (line.contract === "temporary" || line.contract === "seconded") found.push(line.agency ? `${words[line.contract]} (${line.agency.replace(/\s*\n\s*/gu, ", ")})` : words[line.contract]);
  if (line.partTime) found.push(words.partTime);
  return found.join(" · ");
}

export type GapWords = { title: string; withoutRecord: string; noStart: string; noExit: string };
export type RegisterWords = {
  employees: string; interns: string; number: string; name: string; nationality: string; birthDate: string; sex: string; job: string; qualification: string;
  entry: string; exit: string; permit: string; mentions: string; start: string; end: string; tutor: string; workplace: string;
  sexes: Record<Sex, string>; mention: MentionWords;
};

// The register as a spreadsheet: the employees' part, an empty line, the
// interns' part; then, when some people could not be listed, who they are
// and why (never left out silently). Days as YYYY-MM-DD, read the same by
// every spreadsheet.
export function registerCsv(r: Register, words: RegisterWords, tutorName: (id: string | null) => string, gaps?: Gaps, gapWords?: GapWords): string {
  const rows: unknown[][] = [
    [words.employees],
    [words.number, words.name, words.nationality, words.birthDate, words.sex, words.job, words.qualification, words.entry, words.exit, words.permit, words.mentions],
    ...r.employees.map(l => [l.number, l.name, l.nationality, l.birthDate ?? "", l.sex ? words.sexes[l.sex] : "", l.job, l.qualification, l.startDate, l.endDate ?? "", l.workPermit, mentions(l, words.mention)]),
  ];
  if (r.interns.length > 0) {
    rows.push([], [words.interns], [words.number, words.name, words.start, words.end, words.tutor, words.workplace]);
    rows.push(...r.interns.map(l => [l.number, l.name, l.startDate, l.endDate ?? l.contractEnd ?? "", tutorName(l.tutorId), l.workplace]));
  }
  if (gaps && gapWords && gaps.withoutRecord.length + gaps.noStart.length + gaps.noExit.length > 0) {
    rows.push([], [gapWords.title]);
    rows.push(...gaps.withoutRecord.map(p => [p.name, gapWords.withoutRecord]), ...gaps.noStart.map(p => [p.name, gapWords.noStart]), ...gaps.noExit.map(p => [p.name, gapWords.noExit]));
  }
  return toCsv(rows);
}

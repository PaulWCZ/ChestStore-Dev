import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can, canRemoveFile } from "./access.ts";
import type { Attachment } from "./attachments.ts";
import type { Activity } from "./activities.ts";
import type { Custom, FieldDef, FieldObject } from "./custom.ts";
import type { Sql } from "./db.ts";
import { fieldsByObject, optionLabel } from "./fields.ts";
import { bookingLink, meetingTime, typeName } from "./from-booking.ts";
import { formatDate, formatDay, intl, plural, relative, type Catalogue, type Locale } from "./i18n/index.ts";
import { stageName, today, type Stage } from "./model.ts";
import { listStages } from "./stages.ts";
import { team } from "./team.ts";

// What most pages hand to their views: the stages in the reader's words,
// the team (owner pickers), the team's own fields, and what the forms need.
// Companies and contacts are not listed here: the forms search them as one
// types (app/chest/ui/pickers.tsx).
export async function stageWords(sql: Sql, t: Catalogue): Promise<{ stages: Stage[]; names: Record<string, string> }> {
  const stages = await listStages(sql);
  return { stages, names: Object.fromEntries(stages.map(s => [s.id, stageName(s, t.stages)])) };
}

export async function formChoices(sql: Sql, actor: Member, t: Catalogue) {
  const [people, { stages, names }, fields] = await Promise.all([team(), stageWords(sql, t), fieldsByObject(sql, t)]);
  return {
    team: people.map(p => ({ id: p.id, name: p.name, photo: p.photo })),
    stageChoices: stages.map(s => ({ id: s.id, name: names[s.id]! })),
    openStages: stages.filter(s => s.kind === "open").map(s => ({ id: s.id, name: names[s.id]! })),
    stages,
    stageNames: names,
    fields,
    canAssign: can(actor, "assign"),
    canCreateCompany: can(actor, "records.write"),
  };
}

// The props of "New deal" (DealDialog), from formChoices; `today` in the
// Chest's time zone, for its date field.
export function dealFormProps(choices: Awaited<ReturnType<typeof formChoices>>, me: string, t: Catalogue) {
  return { fields: choices.fields.deals, stages: choices.openStages, team: choices.team, me, canAssign: choices.canAssign, canCreateCompany: choices.canCreateCompany, today: today(), t };
}

// A timeline as its view shows it: each item's time in words, written here,
// and the link back to the answer in Forms of a "Filled in the form" line.
// A meeting booked in Booking (lib/from-booking.ts) also carries its type
// in the reader's language, its time, and the link back to it in Booking.
export type MeetingLine = { type: string; when: string; host: string | null; cancelled: boolean; moves: number };
export function withWhen(items: Activity[], locale: Locale, now = new Date()): (Activity & { when: string; whenFull: string; link: string | null; meeting: MeetingLine | null })[] {
  return items.map(a => ({ ...a, when: relative(a.at, locale, now), whenFull: formatDate(a.at, locale, { dateStyle: "full", timeStyle: "short" }), link: a.kind === "booking" ? bookingLink(a.data["path"]) : answerLink(a), meeting: meetingLine(a, locale) }));
}

function meetingLine(a: Activity, locale: Locale): MeetingLine | null {
  if (a.kind !== "booking" || typeof a.data["start"] !== "string") return null;
  const moves = Number(a.data["moves"] ?? 0);
  return { type: typeName(a.data["type"], locale), when: meetingTime(a.data["start"], locale), host: typeof a.data["host"] === "string" ? a.data["host"] : null, cancelled: a.data["status"] === "cancelled", moves: Number.isInteger(moves) && moves > 0 ? moves : 0 };
}

// answerLink is the address of the answer in Forms that a "form" line
// came from (lib/from-forms.ts keeps its path, never an address: Forms'
// address changes with a custom domain). Made now, from the addresses the
// Chest gives (Proposal (studio): chest.toolLink); null when Forms is not
// installed on this Chest or the path is not one it would open — the line
// then names the form without a link.
export function answerLink(a: Pick<Activity, "kind" | "data">): string | null {
  const path = a.data["path"];
  return a.kind === "form" && typeof path === "string" && path !== "" ? chest.toolLink("forms", path) : null;
}

// A record's own fields as its page shows them: the label and the value in
// the reader's conventions (a number grouped, a day written out).
export function shownFields(fields: Record<FieldObject, FieldDef[]>, object: FieldObject, custom: Custom, locale: Locale): { label: string; value: string }[] {
  return fields[object].filter(f => custom[f.id] !== undefined && custom[f.id] !== "").map(f => {
    const v = custom[f.id]!;
    const value = f.kind === "number" && typeof v === "number" ? new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 6 }).format(v)
      : f.kind === "date" && typeof v === "string" ? formatDay(v, locale, { day: "numeric", month: "long", year: "numeric" })
      : f.kind === "choice" ? optionLabel(f, String(v))
      : String(v);
    return { label: f.label, value };
  });
}

// When a next step is due, as its view shows it, written here (a browser's
// calendar data may name days differently): "Today 14:30", "Tue 6 Oct",
// "3 days late".
export function dueLabel(step: { due: string; time: string | null }, now: string, locale: Locale, t: Catalogue): string {
  const at = step.time ? " " + step.time : "";
  if (step.due === now) return t.step.today + at;
  if (step.due < now) {
    const days = Math.round((Date.parse(now + "T00:00:00Z") - Date.parse(step.due + "T00:00:00Z")) / 864e5);
    return plural(t.home.lateBy, days, locale);
  }
  return formatDay(step.due, locale, { weekday: "short", day: "numeric", month: "short" }) + at;
}

// A file's size in the reader's conventions ("240 kB", "1,2 Mo").
export function fileSize(bytes: number, locale: Locale): string {
  const [unit, value] = bytes >= 1 << 20 ? ["megabyte", bytes / (1 << 20)] as const : ["kilobyte", Math.max(1, bytes / 1024)] as const;
  return new Intl.NumberFormat(intl(locale), { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: unit === "megabyte" ? 1 : 0 }).format(value);
}

// A record's files as FilesBox shows them.
export function shownFiles(list: Attachment[], names: Record<string, { name: string }>, actor: Member, locale: Locale, t: Catalogue) {
  return list.map(f => ({
    id: f.id,
    name: f.name,
    size: fileSize(f.size, locale),
    by: f.addedBy === actor.id ? t.people.you : names[f.addedBy]?.name ?? t.people.erased,
    when: relative(f.addedAt, locale),
    removable: canRemoveFile(actor, f),
  }));
}

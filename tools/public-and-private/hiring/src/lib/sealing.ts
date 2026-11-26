import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as sealed from "@argentic/chest-sdk/sealed";
import { log } from "@argentic/chest-app";
import { AppError } from "../shared/app-error.ts";
import type { CandidateDetail } from "./candidates.ts";
import type { Query } from "./db.ts";

// What the team writes about a candidate in private — notes, and the
// strengths and concerns of feedback — is sealed by the Chest (SDK 0.7.0,
// capability "sealed"): the database holds `chest:sealed:1:…`, which the
// owner, the admins, the Data tab, the agents, the logs and the backups see
// as "Sealed"; only Hiring opens it again, on the request of a member who
// has Hiring (the Chest's ticket on that request), and every open is
// journaled. No role narrows it: recruiters and the interviewers of a job
// both read a candidate's notes today, and Hiring's own rules (the jobs an
// interviewer is on, feedback hidden until one's own is given) decide what
// is shown before anything is opened. Each value is bound to its candidate
// (`context`): copied into another row, it opens nowhere.
//
// Kept in clear, because lists, search and sorting need them: who wrote,
// when, the rating and the recommendation. Never logged, mailed or sent to
// an AI: what is opened goes to the member's page or their export only.

export const noteContext = (candidateId: string) => `note:${candidateId}`;
export const feedbackContext = (candidateId: string, field: "strengths" | "concerns") => `feedback:${candidateId}:${field}`;

// sealTexts seals what is written ("" stays "": nothing to hide). A Chest
// that cannot seal now refuses the write ("unavailable") — a note is never
// kept in clear instead.
export async function sealTexts(items: { value: string; context: string }[]): Promise<string[]> {
  const todo = items.map((item, i) => ({ item, i })).filter(x => x.item.value !== "");
  if (todo.length === 0) return items.map(item => item.value);
  try {
    const done = await sealed.sealMany(todo.map(x => ({ value: x.item.value, context: x.item.context })));
    const out = items.map(item => item.value);
    todo.forEach((x, k) => { out[x.i] = done[k]!; });
    return out;
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// An opener: the texts of sealed values, on a member's request — null for
// one this member may not open or the Chest cannot open now (locked after
// a restore, unreachable).
export type Opener = (items: { sealed: string; context: string }[]) => Promise<(string | null)[]>;

export function openerOf(request: Request): Opener {
  return async items => {
    if (items.length === 0) return [];
    try {
      return await sealed.openMany(request, items);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
      log.warn("sealed texts not opened", { code: error.code, count: items.length });
      return items.map(() => null);
    }
  };
}

// openTexts opens what is sealed (in one call, 500 at a time) and keeps
// what is not (written before Hiring sealed: sealPending seals it at
// night); unreadable is what the reader sees instead of a text that
// cannot be opened — or, null, the read is refused ("unavailable"): an
// export never hands out a placeholder in place of what the team wrote.
export async function openTexts(open: Opener, values: { text: string; context: string }[], unreadable: string | null): Promise<string[]> {
  const out = values.map(v => v.text);
  const todo = values.map((v, i) => ({ v, i })).filter(x => sealed.isSealed(x.v.text));
  for (let k = 0; k < todo.length; k += 500) {
    const part = todo.slice(k, k + 500);
    const opened = await open(part.map(x => ({ sealed: x.v.text, context: x.v.context })));
    part.forEach((x, j) => {
      const text = opened[j] ?? null;
      if (text === null && unreadable === null) throw new AppError("unavailable");
      out[x.i] = text ?? unreadable!;
    });
  }
  return out;
}

// openDetail: a candidate's page with its notes and feedback opened.
// mineLocked: the reader's own feedback could not be opened — their form
// must not offer the placeholder as their words (saving it would replace
// what they wrote).
export async function openDetail(open: Opener, d: CandidateDetail, unreadable: string | null): Promise<CandidateDetail & { mineLocked: boolean }> {
  const id = d.candidate.id;
  const feedback = [...(d.mine ? [d.mine] : []), ...d.others];
  const texts = await openTexts(open, [
    ...d.notes.map(n => ({ text: n.body, context: noteContext(id) })),
    ...feedback.flatMap(f => [{ text: f.strengths, context: feedbackContext(id, "strengths") }, { text: f.concerns, context: feedbackContext(id, "concerns") }]),
  ], unreadable);
  const notes = d.notes.map((n, i) => ({ ...n, body: texts[i]! }));
  const at = (k: number) => d.notes.length + k * 2;
  const opened = feedback.map((f, k) => ({ ...f, strengths: texts[at(k)]!, concerns: texts[at(k) + 1]! }));
  const mineLocked = d.mine !== null && unreadable !== null && [[d.mine.strengths, opened[0]!.strengths], [d.mine.concerns, opened[0]!.concerns]]
    .some(([stored, shown]) => sealed.isSealed(stored!) && shown === unreadable);
  return { ...d, notes, mine: d.mine ? opened[0]! : null, others: opened.slice(d.mine ? 1 : 0), mineLocked };
}

// sealPending seals, at night, the notes and feedback written before
// Hiring sealed them (sealing needs no member). Says how many values.
export async function sealPending(sql: Query, max = 500): Promise<number> {
  let done = 0;
  try {
    const notes = await sql<{ id: string; candidate_id: string; body: string }[]>`
      select id, candidate_id, body from notes where body not like 'chest:sealed:%' order by id limit ${max}`;
    if (notes.length > 0) {
      const values = await sealed.sealMany(notes.map(n => ({ value: n.body, context: noteContext(String(n.candidate_id)) })));
      for (const [i, n] of notes.entries()) await sql`update notes set body = ${values[i]!} where id = ${n.id} and body = ${n.body}`;
      done += notes.length;
    }
    const feedback = await sql<{ id: string; candidate_id: string; strengths: string; concerns: string }[]>`
      select id, candidate_id, strengths, concerns from feedback
      where (strengths <> '' and strengths not like 'chest:sealed:%') or (concerns <> '' and concerns not like 'chest:sealed:%') order by id limit ${max}`;
    for (const f of feedback) {
      const id = String(f.candidate_id);
      const seal = async (value: string, field: "strengths" | "concerns") => (value === "" || sealed.isSealed(value) ? value : await sealed.seal(value, { context: feedbackContext(id, field) }));
      await sql`update feedback set strengths = ${await seal(f.strengths, "strengths")}, concerns = ${await seal(f.concerns, "concerns")}
        where id = ${f.id} and strengths = ${f.strengths} and concerns = ${f.concerns}`;
      done++;
    }
  } catch (error) {
    if (!(error instanceof CapabilityNotGranted) && !(error instanceof ChestError)) throw error;
    log.warn("sealing what was written in clear: not now", { code: (error as ChestError).code });
  }
  return done;
}

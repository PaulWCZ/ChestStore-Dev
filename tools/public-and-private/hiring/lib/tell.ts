import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { recruiting } from "./access.ts";
import { unseenCounts } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { catalogue, format } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { people as lookUp } from "./people.ts";

// The bell and the tile, each in its reader's language. Keyed by the
// candidate, so a new item replaces the old one and goes once handled.

export async function recruiters(): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const role of recruiting) {
      let after: string | undefined;
      for (let page = 0; page < 4; page++) {
        const answer = await members.list({ role, limit: 500, ...(after ? { after } : {}) });
        found.push(...answer.members.map(m => m.id));
        if (!answer.next) break;
        after = answer.next;
      }
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return [...new Set(found)];
}

const path = (candidateId: string) => `/chest/candidates/${candidateId}`;

// A new application: every recruiter hears of it, until they open it.
export async function applied(c: { id: string; name: string }, job: { title: string }): Promise<void> {
  const people = await recruiters();
  await notify(people, t => ({ title: format(t.bell.applied, { name: cut(c.name, 40) }), body: job.title }), { path: path(c.id), key: `candidate:${c.id}:new` });
}

// Opened by a recruiter: their item goes.
export async function opened(actor: Member, candidateId: string): Promise<void> {
  await withdraw(`candidate:${candidateId}:new`, [actor.id]);
  await withdraw(`candidate:${candidateId}:reply`, [actor.id]);
}

// Asked for feedback: each one asked hears of it, until they give it.
export async function asked(actor: Member, ids: string[], c: { id: string; name: string }, job: { title: string }): Promise<void> {
  await notify(ids.filter(id => id !== actor.id), t => ({ title: format(t.bell.asked, { name: actor.firstName || actor.name, candidate: cut(c.name, 40) }), body: job.title }), { path: path(c.id), key: `candidate:${c.id}:asked` });
}

// Feedback given: the item asking for it goes; whoever asked hears of it.
export async function gave(actor: Member, askedBy: string[], c: { id: string; name: string }): Promise<void> {
  await withdraw(`candidate:${c.id}:asked`, [actor.id]);
  await notify(askedBy, t => ({ title: format(t.bell.gave, { name: actor.firstName || actor.name, candidate: cut(c.name, 40) }) }), { path: path(c.id), key: `candidate:${c.id}:gave:${actor.id.slice(4, 20)}` });
}

// No longer asked: their item goes.
export async function withdrawAsk(candidateId: string, memberId: string): Promise<void> {
  await withdraw(`candidate:${candidateId}:asked`, [memberId]);
}

// A candidate settled (rejected, erased): nothing about them waits.
export async function settled(candidateId: string): Promise<void> {
  for (const reason of ["new", "asked", "reply"]) await withdraw(`candidate:${candidateId}:${reason}`);
}

export async function refreshBadges(sql: Sql): Promise<void> {
  const people = await recruiters();
  if (people.length > 0) await badges(await unseenCounts(sql, people));
}

// A candidate answered: every recruiter hears of it, until one opens them.
export async function replied(c: { id: string; name: string }, job: { title: string }): Promise<void> {
  await notify(await recruiters(), t => ({ title: format(t.bell.replied, { name: cut(c.name, 40) }), body: job.title }), { path: path(c.id), key: `candidate:${c.id}:reply` });
}

// An email the tool could not file: the recruiters file it.
export async function unmatched(from: string): Promise<void> {
  await notify(await recruiters(), t => ({ title: format(t.bell.unmatched, { from: cut(from, 60) }) }), { path: "/chest/mail", key: "mail:unmatched" });
}

// An email to a candidate did not arrive (the address is wrong).
export async function bounced(c: { id: string; name: string }): Promise<void> {
  await notify(await recruiters(), t => ({ title: format(t.bell.bounced, { name: cut(c.name, 40) }) }), { path: path(c.id), key: `candidate:${c.id}:bounced` });
}

// The morning of an interview, each interviewer hears of their day's: an
// item in the bell for each, and one email with the whole day. The email
// is a reminder, not transactional: the Chest applies the person's email
// choice (SDK studio.15 — "none" gets no email, "one a day" finds it in the
// Chest's daily email), so the tool keeps no email switch of its own.
type Today = { id: string; candidateId: string; candidateName: string; jobTitle: string; start: string; people: string[] };
export async function interviewsToday(list: Today[], time: (start: string) => string, day = chest.today()): Promise<void> {
  for (const i of list) {
    await notify(i.people, t => ({ title: format(t.bell.interviewToday, { name: cut(i.candidateName, 40), time: time(i.start) }), body: i.jobTitle }), { path: path(i.candidateId), key: `interview:${i.id}:today` });
  }
  await emailInterviewers(list, time, day);
}

export async function emailInterviewers(list: Today[], time: (start: string) => string, day: string): Promise<{ sent: string[]; held: string[] }> {
  const byPerson = new Map<string, Today[]>();
  for (const i of [...list].sort((a, b) => a.start.localeCompare(b.start))) for (const p of new Set(i.people)) byPerson.set(p, [...(byPerson.get(p) ?? []), i]);
  const done = { sent: [] as string[], held: [] as string[] };
  if (byPerson.size === 0) return done;
  const who = await lookUp(byPerson.keys());
  const team = chest.teamUrl ?? "";
  for (const [id, theirs] of byPerson) {
    const person = who.get(id);
    if (person?.status !== "member") continue;
    const t = catalogue(person.locale).mail;
    const lines = theirs.map(i => format(t.morningLine, { time: time(i.start), name: i.candidateName, job: i.jobTitle, link: team + path(i.candidateId) }));
    try {
      const answer = await mail.send({
        to: { member: id },
        subject: t.morningSubject,
        text: format(t.morningBody, { firstName: person.name.split(/\s+/u)[0] || person.name, list: lines.join("\n") }),
        fromName: chest.organization.name,
        // One a day per person, whatever the retries: the key names both.
        key: `morning:${day}:${id}`,
      });
      (answer.status === "held" ? done.held : done.sent).push(id);
    } catch (error) {
      // No mail on this Chest, a quota, an address the Chest refuses: the
      // bell has told them already.
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return done;
}

// A candidate chose their interview time: the interviewers and whoever
// sent the link hear of it.
export async function chosen(people: string[], c: { id: string; name: string }, i: { id: string; start: string }, time: (start: string, locale: string) => string): Promise<void> {
  await notify(people, (t, locale) => ({ title: format(t.bell.chosen, { name: cut(c.name, 40), time: time(i.start, locale) }) }), { path: path(c.id), key: `interview:${i.id}:chosen` });
}

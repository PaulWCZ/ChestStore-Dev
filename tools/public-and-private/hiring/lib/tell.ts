import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { recruiting } from "./access.ts";
import { unseenCounts } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";

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
  for (const reason of ["new", "asked"]) await withdraw(`candidate:${candidateId}:${reason}`);
}

export async function refreshBadges(sql: Sql): Promise<void> {
  const people = await recruiters();
  if (people.length > 0) await badges(await unseenCounts(sql, people));
}

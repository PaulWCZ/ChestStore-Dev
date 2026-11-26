import type { Member } from "@argentic/chest-sdk/member";
import { anonymousThreshold } from "./access.ts";
import type { Sql } from "./db.ts";
import { chestGroups, groupMembers } from "./groups.ts";
import { results, type Counts, type QuestionResult } from "./results.ts";
import { view } from "./polls.ts";

// An anonymous survey read per team (Officevibe's heat map, without its
// leaks). Once the survey is closed and its results show (5 answers or
// more, for everyone), its counts are also shown per group of the Chest
// (Proposal (studio): "members.groups"), under three rules:
//
// 1. A group shows from 5 answers (teamFloor), like the whole survey.
// 2. Never when it could be worked out by subtraction: when a shown group
//    sits inside another shown group (or the whole company) and the
//    difference is 1 to 4 answers, the smaller group is hidden too ("the
//    whole minus Sales" would be the 2 people outside Sales). The same for
//    groups that do not overlap: if all but 1 to 4 answers are covered by
//    shown groups, the smallest of them is hidden. Who is in a group is
//    read from the Chest now (it may have changed since: the rule then
//    errs on the side of hiding only when the Chest says so).
// 3. Only numbers: averages, eNPS and the share of each answer. Free texts
//    are never split by group (a sentence names its author more surely
//    than a count).
//
// Counts per group are kept only for groups of 5 members or more
// (lib/answers.ts), named by nobody, rewritten with the poll's other
// anonymous rows. What this does not protect is in README ("Anonymous
// polls").
export const teamFloor = anonymousThreshold;

export type TeamCount = { id: string; n: number };

// visibleTeams: which groups may show. members: who is in each group now
// (null: unknown — then only the floor and the whole company apply, and
// every pair is treated as nested, the safe side).
export function visibleTeams(total: number, teams: readonly TeamCount[], members: Map<string, Set<string>> | null): Set<string> {
  const shown = new Map(teams.filter(t => t.n >= teamFloor && t.n <= total).map(t => [t.id, t.n]));
  const inside = (a: string, b: string): boolean => {
    if (!members) return true;
    const x = members.get(a);
    const y = members.get(b);
    if (!x || !y) return true;
    for (const m of x) if (!y.has(m)) return false;
    return true;
  };
  const apart = (a: string, b: string): boolean => {
    if (!members) return false;
    const x = members.get(a);
    const y = members.get(b);
    if (!x || !y) return false;
    for (const m of x) if (y.has(m)) return false;
    return true;
  };
  const risky = (rest: number) => rest > 0 && rest < teamFloor;
  const smallest = (ids: string[]) => ids.sort((a, b) => shown.get(a)! - shown.get(b)! || a.localeCompare(b))[0]!;
  for (let changed = true; changed;) {
    changed = false;
    const ids = [...shown.keys()];
    // Inside the whole company, or inside another shown group.
    for (const a of ids) {
      const n = shown.get(a)!;
      if (risky(total - n)) { shown.delete(a); changed = true; break; }
      const outer = ids.find(b => b !== a && shown.has(b) && shown.get(b)! >= n && inside(a, b) && risky(shown.get(b)! - n));
      if (outer) { shown.delete(a); changed = true; break; }
    }
    if (changed) continue;
    // Groups apart from each other, adding up to all but a few (the
    // largest set of them, up to 12 groups checked).
    const all = [...shown.keys()].sort((a, b) => shown.get(b)! - shown.get(a)!).slice(0, 12);
    for (let mask = 1; mask < 1 << all.length && !changed; mask++) {
      const set = all.filter((_, i) => mask & (1 << i));
      if (set.length < 2 || set.some((a, i) => set.slice(i + 1).some(b => !apart(a, b)))) continue;
      const sum = set.reduce((s, a) => s + shown.get(a)!, 0);
      if (risky(total - sum)) { shown.delete(smallest(set)); changed = true; }
    }
  }
  return new Set(shown.keys());
}

export type TeamResult = { id: string; name: string; answered: number; results: QuestionResult[] };

// teamResults: an anonymous survey's results per group, for whoever sees
// its results (lib/access.ts: closed, 5 answers or more). Null when it has
// none to show (not an anonymous survey, not shown yet, no groups).
export async function teamResults(sql: Sql, actor: Member | null, pollId: unknown, now = new Date()): Promise<{ teams: TeamResult[]; hidden: number } | null> {
  const v = await view(sql, actor, pollId, now);
  const poll = v.poll;
  if (!poll.anonymous || poll.kind !== "survey" || v.state !== "shown") return null;
  const rows = await sql<{ group_id: string; question_id: string; key: string; count: number }[]>`select group_id, question_id, key, count from group_tallies where poll_id = ${poll.id}`;
  const first = poll.questions.find(q => q.kind !== "text")?.id;
  const byGroup = new Map<string, Counts>();
  for (const r of rows) {
    const c = byGroup.get(r.group_id) ?? new Map(poll.questions.map(q => [q.id, new Map<string, number>()]));
    c.get(String(r.question_id))?.set(r.key, r.count);
    byGroup.set(r.group_id, c);
  }
  if (byGroup.size === 0 || !first) return null;
  // A group's answers: those who answered its first question (every
  // question is answered by each: lib/model.ts, readAnswer).
  const counted = [...byGroup].map(([id, c]) => ({ id, n: c.get(first)?.get("n") ?? 0 }));
  const names = new Map((await chestGroups() ?? []).map(g => [g.id, g.name]));
  const known = counted.filter(t => names.has(t.id));
  const members = await groupMembers(known.filter(t => t.n >= teamFloor).map(t => t.id));
  const visible = visibleTeams(v.answers, known, members);
  const teams = known.filter(t => visible.has(t.id)).map(t => ({
    id: t.id, name: names.get(t.id)!, answered: t.n,
    results: results(poll.questions.filter(q => q.kind !== "text"), byGroup.get(t.id)!, { texts: [] }),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { teams, hidden: known.length - teams.length };
}

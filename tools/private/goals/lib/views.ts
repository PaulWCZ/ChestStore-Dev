import type { Member } from "@argentic/chest-sdk/member";
import { mayCheckIn, mayEdit } from "./access.ts";
import { format, formatDate, plural, relative, type Catalogue, type Locale } from "./i18n/index.ts";
import { percent, type Confidence, type Kind, type Level } from "./model.ts";
import { nameOf, type Person } from "./people.ts";
import type { KeyResult, Objective } from "./read.ts";
import { plainNumber, valueText } from "./values.ts";

// The shapes the pages hand to their views: every word, name, date and
// value already written on the server (in the reader's language and the
// Chest's time zone), so client components format nothing that could
// differ from the server's rendering.

// A percentage in the reader's words ("42%", "42 %"), or a dash.
export function pctText(t: Catalogue, value: number | null): string {
  return value === null ? t.progress.dash : format(t.progress.percent, { value });
}

export type PersonView = { id: string; name: string; photo: string | null; gone: boolean };

export function personView(people: Map<string, Person>, memberId: string, locale: Locale, me?: string): PersonView {
  const p = people.get(memberId);
  const gone = memberId === "erased" || !p || p.status !== "member";
  return { id: memberId, name: nameOf(p, locale), photo: gone ? null : p?.photo ?? null, gone: gone && memberId !== me };
}

export type KeyResultView = {
  id: string;
  objectiveId: string;
  title: string;
  kind: Kind;
  owner: PersonView;
  current: string;        // "12 customers", "Done"
  start: string;
  target: string;
  // For the forms: the raw numbers as typed back ("12,5" in French).
  currentInput: string;
  startInput: string;
  targetInput: string;
  unit: string;
  currency: string | null;
  source: "manual" | "crm.won_amount" | "crm.won_count";
  weight: number;
  percent: number;
  percentText: string;
  done: boolean;
  confidence: Confidence | null;
  lastCheckIn: string | null; // "3 days ago"
  lastCheckInDate: string | null;
  stale: boolean;
  thisWeek: boolean;
  canCheckIn: boolean;
  canEdit: boolean;
};

export function keyResultView(k: KeyResult, objective: { owner: string }, ctx: { actor: Member; people: Map<string, Person>; locale: Locale; t: Catalogue; zone: string; now: Date; closed: boolean }): KeyResultView {
  const { locale, t } = ctx;
  const text = (v: number) => (k.kind === "milestone" ? (v >= 1 ? t.checkIn.markDone : t.checkIn.notYet) : valueText(k, v, locale));
  return {
    id: k.id,
    objectiveId: k.objectiveId,
    title: k.title,
    kind: k.kind,
    owner: personView(ctx.people, k.owner, locale, ctx.actor.id),
    current: text(k.current),
    start: text(k.start),
    target: text(k.target),
    currentInput: plainNumber(k.current, locale),
    startInput: plainNumber(k.start, locale),
    targetInput: plainNumber(k.target, locale),
    unit: k.unit,
    currency: k.currency,
    source: k.source ?? "manual",
    weight: k.weight,
    percent: percent(k.progress) ?? 0,
    percentText: pctText(t, percent(k.progress)),
    done: k.done,
    confidence: k.confidence,
    lastCheckIn: k.lastCheckIn ? relative(k.lastCheckIn, locale, ctx.now) : null,
    lastCheckInDate: k.lastCheckIn ? formatDate(k.lastCheckIn, locale, ctx.zone, { dateStyle: "full" }) : null,
    stale: k.stale,
    thisWeek: k.thisWeek,
    canCheckIn: !ctx.closed && mayCheckIn(ctx.actor, k),
    canEdit: !ctx.closed && mayEdit(ctx.actor, objective),
  };
}

export type ObjectiveView = {
  id: string;
  title: string;
  why: string;
  visibility: "everyone" | "team" | "people";
  level: Level;
  levelText: string;
  teamId: string | null;
  teamName: string | null;
  parentId: string | null;
  owner: PersonView;
  percent: number | null;
  percentText: string;
  confidence: Confidence | null;
  stale: boolean;
  keyResults: KeyResultView[];
  keyResultsText: string;
  score: number | null;
  learned: string;
  canEdit: boolean;
};

export function objectiveView(o: Objective, ctx: { actor: Member; people: Map<string, Person>; locale: Locale; t: Catalogue; zone: string; now: Date; closed: boolean; teams: Map<string, string> }): ObjectiveView {
  const { t } = ctx;
  const count = o.keyResults.length;
  return {
    id: o.id,
    title: o.title,
    why: o.why,
    visibility: o.visibility,
    level: o.level,
    levelText: t.levels[o.level],
    teamId: o.teamId,
    teamName: o.teamId ? ctx.teams.get(o.teamId) ?? null : null,
    parentId: o.parentId,
    owner: personView(ctx.people, o.owner, ctx.locale, ctx.actor.id),
    percent: percent(o.progress),
    percentText: pctText(t, percent(o.progress)),
    confidence: o.confidence,
    stale: o.stale,
    keyResults: o.keyResults.map(k => keyResultView(k, o, ctx)),
    keyResultsText: count === 0 ? t.progress.none : plural(t.objective.keyResultsCount, count, ctx.locale),
    score: o.score,
    learned: o.learned,
    canEdit: !ctx.closed && mayEdit(ctx.actor, o),
  };
}

// Everyone a view needs a name for.
export function idsOf(objectives: readonly Objective[]): string[] {
  return objectives.flatMap(o => [o.owner, ...o.keyResults.map(k => k.owner)]);
}

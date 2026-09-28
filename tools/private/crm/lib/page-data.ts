import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { companyChoices } from "./companies.ts";
import { contactChoices } from "./contacts.ts";
import type { Sql } from "./db.ts";
import type { Activity } from "./activities.ts";
import { formatDate, relative, type Catalogue, type Locale } from "./i18n/index.ts";
import { stageName, type Stage } from "./model.ts";
import { listStages } from "./stages.ts";
import { team } from "./team.ts";

// What most pages hand to their views: the stages in the reader's words,
// the team (owner pickers), the choices of the deal and contact forms.
export async function stageWords(sql: Sql, t: Catalogue): Promise<{ stages: Stage[]; names: Record<string, string> }> {
  const stages = await listStages(sql);
  return { stages, names: Object.fromEntries(stages.map(s => [s.id, stageName(s, t.stages)])) };
}

export async function formChoices(sql: Sql, actor: Member, t: Catalogue) {
  const [companies, contacts, people, { stages, names }] = await Promise.all([companyChoices(sql, actor), contactChoices(sql, actor), team(), stageWords(sql, t)]);
  return {
    companies,
    contacts,
    team: people.map(p => ({ id: p.id, name: p.name, photo: p.photo })),
    stageChoices: stages.map(s => ({ id: s.id, name: names[s.id]! })),
    stages,
    stageNames: names,
    canAssign: can(actor, "assign"),
  };
}

// A timeline as its view shows it: each item's time in words, written here.
export function withWhen(items: Activity[], locale: Locale, now = new Date()): (Activity & { when: string; whenFull: string })[] {
  return items.map(a => ({ ...a, when: relative(a.at, locale, now), whenFull: formatDate(a.at, locale, { dateStyle: "full", timeStyle: "short" }) }));
}

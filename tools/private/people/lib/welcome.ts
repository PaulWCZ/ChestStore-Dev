import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale, type Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import * as members from "@argentic/chest-sdk/members";
import type { Query } from "./db.ts";
import { catalogue } from "./i18n/index.ts";
import { format, formatDay } from "./i18n/format.ts";
import { daysBetween, welcomeLateDays } from "./model.ts";
import { today } from "./zone.ts";

// The welcome email (Proposal (studio): "mail", chest.proposals.json).
// When HR starts a welcome checklist, the newcomer gets a short email in
// their language: welcome, their first day, their manager, where their
// first steps are — signed by the HR person who started it, who is the
// reply address. It goes to a member by their id (the Chest knows the
// address; People never sends to one it typed), or to an arrival not in
// the Chest yet at the work address HR gave (Hiring's personal address is
// never kept: an arrival told by Hiring without a work address gets
// nothing). An arrival's language is the Chest's own (the newcomer has
// none yet).
//
// Not transactional: the person's own choice in the Chest (every email,
// one a day, none) is applied by mail.send. Not sent for a first day more
// than two weeks past (HR catching up on a checklist is not a welcome).
// The key names the checklist and the recipient (SDK studio.16: after a
// restore, a checklist id may name someone else's): a retry never sends
// it twice, and never keeps one person's welcome from another. A Chest
// without mail, or a refusal (the day's quota, an address that bounced):
// nothing fails, the checklist stands.

export { welcomeLateDays };

type Newcomer = { to: string | { member: string }; name: string; locale: Locale; linked: boolean };

// Whom this checklist would welcome, or null: a welcome checklist, for a
// member who has the tool or an expected arrival with a work address, whose
// first day is not long past.
export async function newcomer(sql: Query, journeyId: string): Promise<(Newcomer & { anchor: string; managerId: string | null }) | null> {
  const [j] = await sql<{ kind: string; person_id: string | null; anchor: string; arrival_name: string | null; work_email: string | null; arrival_manager: string | null; status: string | null; profile_manager: string | null }[]>`
    select j.kind, j.person_id, to_char(j.anchor, 'YYYY-MM-DD') as anchor, a.name as arrival_name, a.work_email, a.manager_id as arrival_manager, a.status,
      (select p.manager_id from profiles p where p.member_id = j.person_id) as profile_manager
    from journeys j left join arrivals a on a.id = j.arrival_id where j.id = ${journeyId}`;
  if (!j || j.kind !== "onboarding") return null;
  if (daysBetween(j.anchor, today()) > welcomeLateDays) return null;
  if (j.person_id) {
    let found: Member | undefined;
    try {
      found = (await members.lookup([j.person_id])).members[0];
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
    if (!found) return null;
    return { to: { member: found.id }, name: found.firstName || found.name, locale: localeOf(found.language), linked: true, anchor: j.anchor, managerId: j.profile_manager };
  }
  if (j.status !== "expected" || !j.work_email || !mail.isAddress(j.work_email)) return null;
  return { to: j.work_email, name: (j.arrival_name ?? "").split(/\s+/u)[0] || (j.arrival_name ?? ""), locale: localeOf(chest.language), linked: false, anchor: j.anchor, managerId: j.arrival_manager };
}

// The email, in the newcomer's language.
export function welcomeLetter(input: { locale: Locale; name: string; company: string; anchor: string; manager: string | null; sender: string; link: string | null; linked: boolean }): { subject: string; text: string } {
  const t = catalogue(input.locale).welcome;
  const dayWords = formatDay(input.anchor, input.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const subject = input.company ? format(t.subject, { company: input.company, name: input.name }) : format(t.subjectNoCompany, { name: input.name });
  const lines = [
    format(t.hello, { name: input.name }),
    "",
    input.company ? format(t.firstDay, { company: input.company, day: dayWords }) : format(t.firstDayNoCompany, { day: dayWords }),
    ...(input.manager ? [format(t.manager, { manager: input.manager })] : []),
    "",
    ...(input.linked && input.link ? [t.steps, input.link] : [t.stepsLater]),
    "",
    t.bye,
    input.sender,
  ];
  return { subject: subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: lines.join("\n") };
}

// welcome sends it for a checklist just started; says whether it left
// (queued, or waiting for the person's daily email) — false when nobody
// is to be welcomed, the person chose no email, or the Chest has no mail.
export async function welcome(sql: Query, actor: Member, journeyId: string): Promise<boolean> {
  const who = await newcomer(sql, journeyId);
  if (!who) return false;
  let manager: string | null = null;
  if (who.managerId) {
    try {
      manager = (await members.lookup([who.managerId])).members[0]?.name ?? null;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  const base = chest.teamUrl;
  const letter = welcomeLetter({
    locale: who.locale, name: who.name, company: chest.organization.name, anchor: who.anchor, manager, sender: actor.name,
    link: base ? new URL("/chest/todo", base).toString() : null, linked: who.linked,
  });
  try {
    const sent = await mail.send({
      to: who.to, subject: letter.subject, text: letter.text, fromName: actor.name,
      ...(actor.email && mail.isAddress(actor.email) ? { replyTo: actor.email } : {}),
      key: `people:welcome:${journeyId}:${typeof who.to === "string" ? who.to : who.to.member}`,
    });
    return sent.status === "queued" || sent.digest.length > 0;
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}

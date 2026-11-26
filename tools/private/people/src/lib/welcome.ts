import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import { localeOf, type Locale, type Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import * as members from "@argentic/chest-sdk/members";
import type { Query } from "./db.ts";
import { catalogue } from "../i18n/index.ts";
import { format, formatDay } from "../shared/format.ts";
import { daysBetween, welcomeLateDays } from "../shared/model.ts";
import { notify } from "./notify.ts";
import { today } from "./zone.ts";

// The welcome, when HR starts a welcome checklist: welcome, the first day,
// the manager, where the first steps are — signed by the HR person who
// started it. Two ways, by who the newcomer is (the owner's decision of
// 6 October 2026: mail to members is never a tool's job):
//
// - a member of the Chest: a **notification** (English with its French;
//   the Chest shows them theirs, and mails it if that is their choice);
//   it opens their first steps (/chest/todo);
// - an expected arrival, not in the Chest yet, at the work address HR gave:
//   not a member, so an **email** through the Chest's mail connector
//   (Proposal (studio): "mail", chest.proposals.json — sent through the
//   company's own mail provider; not built yet). In the Chest's language
//   (the newcomer has none yet); Reply-To the HR person who started it,
//   else the company's reply address. Hiring's personal address is never
//   kept: an arrival told by Hiring without a work address gets nothing.
//   The address is first matched with the Chest's members
//   (members.matchEmails): when it is already a member's (they joined the
//   Chest before HR linked the arrival), they get the notification, never
//   an email, and HR is told to link the arrival. When the Chest cannot
//   say, nothing is sent: a member is never mailed by mistake.
//
// Not for a first day more than two weeks past (HR catching up on a
// checklist is not a welcome). The key names the checklist and the
// recipient (after a restore, a checklist id may name someone else's): a
// retry never sends it twice. A Chest without the connector, or a refusal
// (the day's quota, an address suppressed): nothing fails, the checklist
// stands, and the toast says no email left. An email that leaves keeps its
// message id on the checklist; what the Chest later says of it
// (mail.status: bounced, complained, failed — the only signal, there is no
// inbound mail) is asked when HR opens the checklist and every morning for
// two weeks, and a bounce is shown on the checklist.

export { welcomeLateDays };

// matched: an arrival whose work address is already a member's (not
// linked yet). unchecked: the Chest could not say whether it is.
type Newcomer = { name: string; anchor: string; managerId: string | null } & ({ kind: "member"; id: string; matched: boolean } | { kind: "arrival"; address: string; locale: Locale } | { kind: "unchecked" });

// The members these work addresses are already (members.matchEmails: only
// members who have People; the answer is ids, never addresses), or null
// when the Chest does not answer.
export async function membersByAddress(addresses: Iterable<string>): Promise<Record<string, string> | null> {
  const asked = [...new Set([...addresses].filter(a => mail.isAddress(a)))];
  if (asked.length === 0) return {};
  try {
    return await members.matchEmails(asked);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
}

// Whom this checklist would welcome, or null: a welcome checklist, for a
// member who has the tool or an expected arrival with a work address, whose
// first day is not long past.
export async function newcomer(sql: Query, journeyId: string): Promise<Newcomer | null> {
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
    return { kind: "member", id: found.id, matched: false, name: found.firstName || found.name, anchor: j.anchor, managerId: j.profile_manager };
  }
  if (j.status !== "expected" || !j.work_email || !mail.isAddress(j.work_email)) return null;
  const matched = await membersByAddress([j.work_email]);
  if (matched === null) return { kind: "unchecked", name: "", anchor: j.anchor, managerId: null };
  const memberId = matched[j.work_email];
  if (memberId) {
    let found: Member | undefined;
    try {
      found = (await members.lookup([memberId])).members[0];
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
    const name = found ? found.firstName || found.name : (j.arrival_name ?? "").split(/\s+/u)[0] || (j.arrival_name ?? "");
    return { kind: "member", id: memberId, matched: true, name, anchor: j.anchor, managerId: j.arrival_manager };
  }
  return { kind: "arrival", address: j.work_email, name: (j.arrival_name ?? "").split(/\s+/u)[0] || (j.arrival_name ?? ""), locale: localeOf(chest.language), anchor: j.anchor, managerId: j.arrival_manager };
}

type LetterInput = { locale: Locale; name: string; company: string; anchor: string; manager: string | null; sender: string };

const dayOf = (input: Pick<LetterInput, "anchor" | "locale">) => formatDay(input.anchor, input.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// The email to an arrival not in the Chest yet, in the Chest's language.
export function welcomeLetter(input: LetterInput): { subject: string; text: string } {
  const t = catalogue(input.locale).welcome;
  const subject = input.company ? format(t.subject, { company: input.company, name: input.name }) : format(t.subjectNoCompany, { name: input.name });
  const lines = [
    format(t.hello, { name: input.name }),
    "",
    input.company ? format(t.firstDay, { company: input.company, day: dayOf(input) }) : format(t.firstDayNoCompany, { day: dayOf(input) }),
    ...(input.manager ? [format(t.manager, { manager: input.manager })] : []),
    "",
    t.stepsLater,
    "",
    t.bye,
    input.sender,
  ];
  return { subject: subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: lines.join("\n") };
}

// The notification to a member, in one language (notify writes each).
export function welcomeNotice(input: LetterInput): { title: string; body: string } {
  const t = catalogue(input.locale).welcome;
  const title = input.company ? format(t.subject, { company: input.company, name: input.name }) : format(t.subjectNoCompany, { name: input.name });
  const body = [
    input.company ? format(t.firstDay, { company: input.company, day: dayOf(input) }) : format(t.firstDayNoCompany, { day: dayOf(input) }),
    ...(input.manager ? [format(t.manager, { manager: input.manager })] : []),
    t.stepsHere,
    format(t.signed, { name: input.sender }),
  ].join(" ");
  return { title, body };
}

// How the newcomer was welcomed: in their notifications (matched: an
// arrival already a member by their work address, to link), by email (to
// which address), or not (unchecked: the Chest could not say whether the
// address is a member's, so nothing left).
export type Welcomed = { by: "notice"; matched: boolean } | { by: "email"; to: string } | { by: "unchecked" } | null;

// welcome sends it for a checklist just started, and says how it went.
export async function welcome(sql: Query, actor: Member, journeyId: string): Promise<Welcomed> {
  const who = await newcomer(sql, journeyId);
  if (!who) return null;
  if (who.kind === "unchecked") return { by: "unchecked" };
  let manager: string | null = null;
  if (who.managerId) {
    try {
      manager = (await members.lookup([who.managerId])).members[0]?.name ?? null;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  const company = chest.organization.name;
  if (who.kind === "member") {
    const told = await notify([who.id], (_t, locale) => welcomeNotice({ locale, name: who.name, company, anchor: who.anchor, manager, sender: actor.name }),
      { path: "/chest/todo", key: `welcome:${journeyId}` });
    return told.includes(who.id) ? { by: "notice", matched: who.matched } : null;
  }
  const letter = welcomeLetter({ locale: who.locale, name: who.name, company, anchor: who.anchor, manager, sender: actor.name });
  try {
    const sent = await mail.send({
      to: who.address, subject: letter.subject, text: letter.text, fromName: actor.name,
      ...(actor.email && mail.isAddress(actor.email) ? { replyTo: actor.email } : {}),
      key: `people:welcome:${journeyId}:${who.address}`,
    });
    await sql`update journeys set welcome_mail = ${sent.id}, welcome_mail_status = 'queued' where id = ${journeyId}`;
    return { by: "email", to: who.address };
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

// What the Chest last said of a welcome email: a delivery that failed is
// final; queued, sent (and nothing yet) are asked again. Two weeks after
// the checklist started, it is not asked any more.
const failed = new Set(["bounced", "complained", "failed"]);
export type WelcomeMail = { status: string; address: string | null } | null;

async function ask(sql: Query, row: { id: string; welcome_mail: string }): Promise<string | null> {
  let answer: mail.Status | null;
  try {
    answer = await mail.status(row.welcome_mail);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
  if (!answer) return null;
  await sql`update journeys set welcome_mail_status = ${answer.status} where id = ${row.id}`;
  return answer.status;
}

// welcomeMail says, for one checklist, whether its welcome email failed
// (asking the Chest when it may still change), and to which address (the
// arrival's, while it is not linked).
export async function welcomeMail(sql: Query, journeyId: string): Promise<WelcomeMail> {
  const [row] = await sql<{ id: string; welcome_mail: string | null; welcome_mail_status: string | null; fresh: boolean; work_email: string | null }[]>`
    select j.id::text, j.welcome_mail, j.welcome_mail_status, j.created_at > now() - interval '14 days' as fresh, a.work_email
    from journeys j left join arrivals a on a.id = j.arrival_id where j.id = ${journeyId}`;
  if (!row?.welcome_mail) return null;
  let status = row.welcome_mail_status;
  if (row.fresh && (status === null || status === "queued" || status === "sent")) status = (await ask(sql, { id: row.id, welcome_mail: row.welcome_mail })) ?? status;
  return status && failed.has(status) ? { status, address: row.work_email || null } : null;
}

// The morning: every welcome email of the last two weeks whose fate is not
// known yet is asked again (200 at most a morning).
export async function checkWelcomeMails(sql: Query): Promise<void> {
  const rows = await sql<{ id: string; welcome_mail: string }[]>`
    select id::text, welcome_mail from journeys
    where welcome_mail is not null and (welcome_mail_status is null or welcome_mail_status in ('queued', 'sent')) and created_at > now() - interval '14 days'
    order by id limit 200`;
  for (const row of rows) await ask(sql, row);
}

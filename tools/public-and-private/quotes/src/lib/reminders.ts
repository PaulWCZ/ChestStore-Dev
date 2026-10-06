import { log } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { issuers } from "./access.ts";
import { company } from "./company.ts";
import type { Sql } from "./db.ts";
import { getDocument, receivables } from "./documents.ts";
import { format } from "../i18n/index.ts";
import { daysBetween } from "../shared/model.ts";
import { formatMoney } from "../shared/money.ts";
import { notify, withdraw } from "./notify.ts";
import { holders } from "./people.ts";
import { remindByEmail } from "./mailing.ts";
import { sendAutomaticReminder } from "./sending.ts";

// Reminding the late payers without anyone having to remember: once an
// administrator turned it on (Settings, off by default), each morning (the
// "followup" schedule, or the first visit of the day) every invoice past
// its due date by one of the company's steps (7, 15 and 30 days by
// default) is reminded once per step —
// - by email to the client, with the invoice attached, in the client's
//   language, when the company chose so and the Chest can send email;
// - otherwise the person in charge (who finalised the invoice, or else
//   billing) is told in the bell, with the invoice one click away.
// A step is done once (reminder_steps); a step missed while the tool was
// asleep is not sent late when the next one is due: only the latest is.
// The bell item goes when the invoice is paid.

// The tool itself reading its invoices, with billing's reading rights: never
// a person, never stored.
const system = { id: "tool:reminders", role: "billing", name: "", firstName: "", photo: null, groups: [], admin: false, builder: false, locale: "en" } as unknown as Member;

// Who hears of a late invoice: the billing member who finalised it, while
// they are still in billing; otherwise everyone in billing.
async function inCharge(finaliser: string | null): Promise<string[]> {
  const billing = [...new Set((await Promise.all(issuers.map(role => holders({ role })))).flat().map(h => h.id))];
  return finaliser && billing.includes(finaliser) ? [finaliser] : billing;
}

export type RemindersRun = { emailed: number; told: number };

export async function remindLatePayers(sql: Sql, today: string): Promise<RemindersRun> {
  const c = await company(sql);
  const run: RemindersRun = { emailed: 0, told: 0 };
  if (!c.reminders.on) return run;
  const steps = c.reminders.days;
  const late = (await receivables(sql, system, today)).filter(r => r.state === "overdue" && r.dueDate);
  // Asked once per morning, only when there is something to remind.
  let byEmail: boolean | null = null;
  for (const row of late) {
    const days = daysBetween(row.dueDate!, today);
    let step = -1;
    for (const [i, d] of steps.entries()) if (days >= d) step = i;
    if (step < 0) continue;
    // Claimed first: a second run (or a second instance) finds it done.
    const claimed = await sql`insert into reminder_steps (document_id, step, channel) values (${row.id}, ${step}, 'none') on conflict do nothing returning step`;
    if (claimed.length === 0) continue;
    await sql`insert into reminder_steps (document_id, step, channel) select ${row.id}, s, 'none' from generate_series(0, ${step - 1}) s on conflict do nothing`;
    let channel: "email" | "bell" = "bell";
    if (c.reminders.email && (byEmail ??= await remindByEmail(sql))) {
      try {
        const full = await getDocument(sql, system, row.id, today);
        if ((await sendAutomaticReminder(sql, full, step, today)) === "email") channel = "email";
      } catch (error) {
        // The step is tried again next time.
        await sql`delete from reminder_steps where document_id = ${row.id} and step = ${step}`;
        log.error("automatic reminder failed", error, { invoice: row.id });
        continue;
      }
    }
    await sql`update reminder_steps set channel = ${channel} where document_id = ${row.id} and step = ${step}`;
    const to = await inCharge(row.finalisedBy);
    await notify(to, (t, locale) => ({
      title: format(t.notifications.lateTitle, { number: row.number ?? "", days, client: row.clientName }),
      body: format(channel === "email" ? t.notifications.lateEmailed : t.notifications.lateBody, { amount: formatMoney(row.due, row.currency, locale) }),
    }), { path: `/chest/documents/${row.id}`, key: `late:${row.id}` });
    if (channel === "email") run.emailed++;
    else run.told++;
  }
  return run;
}

// An invoice paid (or credited) in full: its late notice goes.
export async function settledLate(documentId: string): Promise<void> {
  await withdraw(`late:${documentId}`);
}

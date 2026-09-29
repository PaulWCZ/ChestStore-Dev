import type { Sql } from "./db.ts";
import { remindLatePayers } from "./reminders.ts";
import { makeDueDrafts } from "./repeats.ts";
import { refreshBadges } from "./tell.ts";

// The morning's follow-up: the late payers reminded (on the company's
// rules), the recurring drafts made, billing's count set again. Run by the
// "followup" schedule (Proposal (studio)); on a Chest without schedules,
// by the first visit of the day (followUpOnce) — so nothing waits for a
// clock the Chest does not have. Once a day either way.
export async function followUp(sql: Sql, today: string): Promise<{ drafts: number; emailed: number; told: number }> {
  await sql`update company set followed_up_on = ${today} where id = 1`;
  const drafts = await makeDueDrafts(sql, today);
  const { emailed, told } = await remindLatePayers(sql, today);
  await refreshBadges(sql, today);
  return { drafts, emailed, told };
}

export async function followUpOnce(sql: Sql, today: string): Promise<void> {
  const claimed = await sql`update company set followed_up_on = ${today} where id = 1 and (followed_up_on is null or followed_up_on < ${today}) returning id`;
  if (claimed.length === 0) return;
  try {
    await makeDueDrafts(sql, today);
    await remindLatePayers(sql, today);
    await refreshBadges(sql, today);
  } catch (error) {
    // A page never fails for it: the schedule, or tomorrow, runs it again.
    console.error("follow-up failed", error instanceof Error ? error.name : "error");
  }
}

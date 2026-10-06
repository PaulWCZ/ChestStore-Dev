import { Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Query } from "./db.ts";
import { company, rememberMail } from "./company.ts";

// Whether the Chest would send email now (mail.available(), studio.16),
// asked before a page offers to send one: the send dialog opens on "send
// it yourself" when it would not, and Settings says why the automatic
// reminders only tell the bell. A snapshot: a send can still fail, and
// sending says so. When the Chest does not answer, what the last send
// taught (company.mail_works) — null when nothing is known.
export type MailState = { works: boolean | null; reason: "not_granted" | "not_connected" | "suspended" | "quota" | null };

export async function mailState(sql: Query): Promise<MailState> {
  try {
    const answer = await mail.available();
    // Remembered too: the morning's reminders read it when the Chest is
    // not answering.
    if (answer.ok || answer.reason === "not_granted" || answer.reason === "not_connected") await rememberMail(sql, answer.ok);
    return { works: answer.ok, reason: answer.ok ? null : answer.reason };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return { works: (await company(sql)).mailWorks, reason: null };
  }
}

// Whether the morning's automatic reminders try email: not when the Chest
// has no mail or its owner has not connected it (the bell alone then). A
// suspended Chest or a spent day's quota is tried, and the step comes back
// the next morning when the send fails.
export async function remindByEmail(sql: Query): Promise<boolean> {
  try {
    const answer = await mail.available();
    return answer.ok || (answer.reason !== "not_granted" && answer.reason !== "not_connected");
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return (await company(sql)).mailWorks !== false;
  }
}

import * as chest from "@argentic/chest-sdk/chest";
import { db } from "./db.ts";
import { mailState } from "./settings.ts";
import { publicWords } from "./session.ts";

// What every public page needs: the visitor's language, the Chest's time
// zone and company, and whether the email form is offered (hidden once the
// Chest said it cannot send email).
export async function publicContext() {
  const { t, locale } = await publicWords();
  const sql = db();
  const now = new Date();
  return { t, locale, sql, now, zone: chest.timeZone(), company: chest.company(), offerMail: (await mailState(sql, now)) !== "none" };
}

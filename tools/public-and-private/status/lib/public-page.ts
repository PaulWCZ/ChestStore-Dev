import * as chest from "@argentic/chest-sdk/chest";
import { db } from "./db.ts";
import { hooksState } from "./hooks.ts";
import { mailState } from "./settings.ts";
import { publicWords } from "./session.ts";

// What every public page needs: the visitor's language, the Chest's time
// zone and company, whether the email form is offered (hidden once the
// Chest said it cannot send email), and whether "Get updates" is offered at
// all (email, or a chat through the Chest's webhooks).
export async function publicContext() {
  const { t, locale } = await publicWords();
  const sql = db();
  const now = new Date();
  const offerMail = (await mailState(sql, now)) !== "none";
  const offerUpdates = offerMail || (await hooksState(sql, now)) !== "none";
  return { t, locale, sql, now, zone: chest.timeZone(), company: chest.company(), offerMail, offerUpdates };
}

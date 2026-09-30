import * as chest from "@argentic/chest-sdk/chest";
import { db } from "./db.ts";
import { hooksDelivery } from "./hooks.ts";
import { mailDelivery } from "./settings.ts";
import { publicWords } from "./session.ts";

// What every public page needs: the visitor's language, the Chest's time
// zone and company, whether the email form is offered, and whether a chat
// is offered — each asked of the Chest (mail.available(),
// webhooks.available(), studio.16): the form only when the Chest would
// send the confirmation now (or cannot say; then what the last send
// taught), a chat only when it would deliver. "Get updates" is offered
// when either is.
//
// A status page is read most when something is down: the answer is kept
// 30 seconds in this process, so a crowd costs the Chest one question.
const keepMs = 30_000;
let kept: { at: number; offerMail: boolean; offerChat: boolean } | null = null;

export async function offers(now = new Date()): Promise<{ offerMail: boolean; offerChat: boolean }> {
  if (kept && now.getTime() - kept.at >= 0 && now.getTime() - kept.at < keepMs) return kept;
  const sql = db();
  const [mailing, hooks] = await Promise.all([mailDelivery(sql, now), hooksDelivery(sql, now)]);
  kept = { at: now.getTime(), offerMail: mailing.state === "ok" || mailing.state === "unknown", offerChat: hooks.state === "ok" || hooks.state === "unknown" };
  return kept;
}

export async function publicContext() {
  const { t, locale } = await publicWords();
  const sql = db();
  const now = new Date();
  const { offerMail, offerChat } = await offers(now);
  return { t, locale, sql, now, zone: chest.timeZone(), company: chest.company(), offerMail, offerChat, offerUpdates: offerMail || offerChat };
}

import { chest } from "@argentic/chest-sdk/chest";
import type { Look } from "@argentic/chest-ui/runtime";
import { catalogue, localeOf, type Catalogue, type Locale } from "../i18n/index.ts";
import { db, type Sql } from "./db.ts";
import { hooksDelivery } from "./hooks.ts";
import { pageSettings, type PageSettings } from "./page-settings.ts";
import { mailDelivery } from "./settings.ts";
import { lookOf } from "./theme.ts";

// What every public page needs: the visitor's language, the Chest's time
// zone and company, the page's settings and look, whether the email form
// is offered, and whether a chat is offered — each asked of the Chest
// (mail.available(), webhooks.available(), studio.16): the form only when
// the Chest would send the confirmation now (or cannot say; then what the
// last send taught), a chat only when it would deliver. "Get updates" is
// offered when either is.
//
// A status page is read most when something is down: the answer is kept
// 30 seconds in this process, so a crowd costs the Chest one question (a
// cache only: lost when the tool sleeps, asked again on waking).
const keepMs = 30_000;
let kept: { at: number; api: string | undefined; offerMail: boolean; offerChat: boolean } | null = null;

export async function offers(now = new Date()): Promise<{ offerMail: boolean; offerChat: boolean }> {
  const api = process.env["CHEST_API"];
  if (kept && kept.api === api && now.getTime() - kept.at >= 0 && now.getTime() - kept.at < keepMs) return kept;
  const sql = db();
  const [mailing, hooks] = await Promise.all([mailDelivery(sql, now), hooksDelivery(sql, now)]);
  kept = { at: now.getTime(), api, offerMail: mailing.state === "ok" || mailing.state === "unknown", offerChat: hooks.state === "ok" || hooks.state === "unknown" };
  return kept;
}

export type PublicContext = { t: Catalogue; locale: Locale; sql: Sql; now: Date; zone: string; company: string; offerMail: boolean; offerChat: boolean; offerUpdates: boolean; settings: PageSettings; look: Look };

export async function publicContext(language: string): Promise<PublicContext> {
  const locale = localeOf(language);
  const sql = db();
  const now = new Date();
  const [{ offerMail, offerChat }, settings, look] = await Promise.all([offers(now), pageSettings(sql), lookOf("public")]);
  return { t: catalogue(locale), locale, sql, now, zone: chest.timeZone, company: chest.organization.name, offerMail, offerChat, offerUpdates: offerMail || offerChat, settings, look };
}

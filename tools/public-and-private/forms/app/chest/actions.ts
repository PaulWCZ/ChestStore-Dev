"use server";

import * as members from "@argentic/chest-sdk/members";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "../../lib/access.ts";
import { AppError } from "../../lib/app-error.ts";
import * as answers from "../../lib/answers.ts";
import { db } from "../../lib/db.ts";
import { attempt, type Result } from "../../lib/errors.ts";
import * as forms from "../../lib/forms.ts";
import { catalogue, format, isLocale } from "../../lib/i18n/index.ts";
import { readPayload, take, type Taken } from "../../lib/respond.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";
import { isTemplate, template } from "../../lib/templates.ts";
import * as uploads from "../../lib/uploads.ts";
import { zonedInstant } from "../../lib/zone.ts";
import * as chest from "@argentic/chest-sdk/chest";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again, and the
// service checks their rights. They answer codes, never sentences.

const done = () => revalidatePath("/chest", "layout");

export async function createForm(key: string): Promise<Result> {
  const actor = await currentMember();
  const result = await attempt(async () => {
    if (!isTemplate(key)) throw new AppError("invalid");
    const locale = actor && isLocale(actor.locale) ? actor.locale : "en";
    const t = template(key, catalogue(locale));
    return forms.create(db(), actor, t);
  });
  if (!result.ok) return result;
  done();
  redirect(`/chest/forms/${result.value.id}`);
}

export async function saveDraft(id: string, text: string, revision: number): Promise<Result<{ revision: number }>> {
  return attempt(async () => forms.saveDraft(db(), await currentMember(), id, text, revision));
}

export async function publishForm(id: string): Promise<Result<{ version: number; slug: string }>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    const before = await forms.open(db(), actor, id, "editor");
    const { form, version } = await forms.publish(db(), actor, id);
    // A team form that opens (for the first time, or again) may tell the team.
    if (form.audience === "team" && form.tellTeam && before.form.status !== "published") await tell.opened(form.id, form.slug, form.draft.title, actor!.id);
    return { version, slug: form.slug };
  });
  done();
  return result;
}

export async function discardDraft(id: string): Promise<Result> {
  const result = await attempt(async () => { await forms.discard(db(), await currentMember(), id); return null; });
  done();
  return result;
}

export async function closeForm(id: string): Promise<Result> {
  const result = await attempt(async () => {
    const form = await forms.close(db(), await currentMember(), id);
    await tell.closed(form.id);
    return null;
  });
  done();
  return result;
}

export async function reopenForm(id: string): Promise<Result> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    const form = await forms.reopen(db(), actor, id);
    if (form.audience === "team" && form.tellTeam) await tell.opened(form.id, form.slug, form.draft.title, actor!.id);
    return null;
  });
  done();
  return result;
}

export async function duplicateForm(id: string): Promise<Result> {
  const actor = await currentMember();
  const t = catalogue(actor && isLocale(actor.locale) ? actor.locale : "en");
  const result = await attempt(async () => forms.duplicate(db(), actor, id, title => format(t.builder.copyOf, { title: title || t.builder.untitled })));
  if (!result.ok) return result;
  done();
  redirect(`/chest/forms/${result.value.id}`);
}

export async function deleteForm(id: string): Promise<Result> {
  const result = await attempt(async () => {
    await forms.remove(db(), await currentMember(), id);
    await tell.closed(id);
    await tell.refreshBadges(db());
    return null;
  });
  done();
  return result;
}

export async function restoreForm(id: string): Promise<Result> {
  const result = await attempt(async () => { await forms.restore(db(), await currentMember(), id); await tell.refreshBadges(db()); return null; });
  done();
  return result;
}

// saveSettings: the settings page's values; the closing day and hour are
// read on the Chest's clock.
export async function saveSettings(id: string, json: string): Promise<Result> {
  const result = await attempt(async () => {
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new AppError("invalid");
    }
    let closesAt: Date | null = null;
    if (typeof value["closesDay"] === "string" && value["closesDay"] !== "") {
      const hour = Number(value["closesHour"] ?? 0);
      try {
        closesAt = zonedInstant(value["closesDay"], hour, chest.timeZone());
      } catch {
        throw new AppError("invalid");
      }
    }
    const actor = await currentMember();
    const before = await forms.open(db(), actor, id, "editor");
    const form = await forms.saveSettings(db(), actor, id, value, closesAt);
    if (before.form.audience === "team" && form.audience !== "team") await tell.closed(form.id);
    await tell.refreshBadges(db());
    return null;
  });
  done();
  return result;
}

// share: a member of the Chest who has the tool, at a level, or taken off.
export async function shareForm(id: string, memberId: string, level: "editor" | "viewer" | null): Promise<Result> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (level !== null && !(await members.get(memberId))) throw new AppError("not_found");
    await forms.share(db(), actor, id, memberId, level);
    if (level === null) await tell.refreshBadges(db(), [memberId]);
    return null;
  });
  done();
  return result;
}

export async function deleteAnswer(id: string, answerId: string): Promise<Result> {
  const result = await attempt(async () => { await answers.removeAnswer(db(), await currentMember(), id, answerId); return null; });
  done();
  return result;
}

export async function restoreAnswer(id: string, answerId: string): Promise<Result> {
  const result = await attempt(async () => { await answers.restoreAnswer(db(), await currentMember(), id, answerId); return null; });
  done();
  return result;
}

// A member answers a team form. Identity only from the Chest's assertion.
export async function answerTeam(payload: string): Promise<Taken> {
  try {
    const actor = await currentMember();
    if (!actor || !can(actor, "forms.answer")) throw new AppError("not_found");
    const p = readPayload(payload);
    const found = await forms.bySlug(db(), p.slug);
    if (!found || found.form.audience !== "team") throw new AppError("not_found");
    // No revalidation here: the page would re-render as "already answered"
    // under the respondent's thank-you. Every page is rendered per request.
    return await take(db(), found.form, p, actor, isLocale(actor.locale) ? actor.locale : "en");
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code };
    console.error("answer not saved", error instanceof Error ? error.name + ": " + error.message : "error");
    return { ok: false, error: "unavailable" };
  }
}

// A manager erases a person's answers (GDPR request), files included.
export async function eraseAnswers(ids: string[]): Promise<Result<{ erased: number }>> {
  const result = await attempt(async () => {
    const { erased, objects } = await answers.erase(db(), await currentMember(), ids);
    await uploads.remove(objects);
    return { erased };
  });
  done();
  return result;
}

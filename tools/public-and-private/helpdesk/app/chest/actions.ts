"use server";

import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { answering } from "../../lib/access.ts";
import * as attachments from "../../lib/attachments.ts";
import { db } from "../../lib/db.ts";
import { AppError, attempt, type ErrorCode, type Result } from "../../lib/errors.ts";
import * as mailer from "../../lib/mailer.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";
import * as tickets from "../../lib/tickets.ts";

// The team's actions. Each is an endpoint anyone can call: each reads the
// member from the Chest's assertion again; the services check the rights.

async function act<T>(step: (actor: NonNullable<Awaited<ReturnType<typeof currentMember>>>) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

// The files a member added to a message: uploads of theirs, checked again
// and kept (lib/attachments.ts), deleted if the message is refused.
const memberFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("team", list), drop: attachments.remove });

export async function reply(number: number, body: string, close: boolean, files: { ref: string; name: string }[] = []): Promise<Result<{ delivery: "email" | "page" }>> {
  return act(async actor => {
    const sql = db();
    const done = await tickets.reply(sql, actor, number, body, { close }, memberFiles(files));
    const s = await tickets.settings(sql);
    const sent = await mailer.answer(done.ticket, body.trim(), actor, s.companyName, done.threading, done.messageId, done.files);
    await tickets.delivered(sql, done.messageId, sent.delivery, sent.delivery === "email" ? sent.mail : undefined);
    await tell.answered(done.ticket);
    await tell.refreshBadges(sql);
    return { delivery: sent.delivery };
  });
}

export async function note(number: number, body: string, files: { ref: string; name: string }[] = []): Promise<Result<null>> {
  return act(async actor => { await tickets.note(db(), actor, number, body, memberFiles(files)); return null; });
}

// fileUpload lets someone who answers send one file to the Chest, to add
// to their reply or note.
export async function fileUpload(type: string, size: number): Promise<{ ok: true; url: string } | { ok: false; error: ErrorCode; max?: number }> {
  const result = await attempt(async () => {
    return attachments.memberGrant(await currentMember(), type, size);
  });
  return result.ok ? { ok: true, url: result.value.url } : { ok: false, error: result.error, ...(typeof result.values?.["max"] === "number" ? { max: result.values["max"] } : {}) };
}

export async function setPriority(number: number, priority: string): Promise<Result<null>> {
  return act(async actor => { await tickets.setPriority(db(), actor, number, priority); return null; });
}

export async function addTag(number: number, name: string): Promise<Result<tickets.Tag>> {
  return act(actor => tickets.addTag(db(), actor, number, name));
}

export async function removeTag(number: number, tagId: string): Promise<Result<null>> {
  return act(async actor => { await tickets.removeTag(db(), actor, number, tagId); return null; });
}

export async function renameTag(tagId: string, name: string): Promise<Result<tickets.Tag>> {
  return act(actor => tickets.renameTag(db(), actor, tagId, name));
}

export async function deleteTag(tagId: string): Promise<Result<{ name: string; tickets: string[] }>> {
  return act(actor => tickets.deleteTag(db(), actor, tagId));
}

export async function restoreTag(input: { name: string; tickets: string[] }): Promise<Result<tickets.Tag>> {
  return act(actor => tickets.restoreTag(db(), actor, input));
}

// Someone who answers tickets: the Chest says their role.
async function answers(memberId: string): Promise<boolean> {
  try {
    const m = await members.get(memberId);
    return m !== null && (answering as readonly string[]).includes(m.role ?? "");
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

export async function assign(number: number, assignee: string | null): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await tickets.assign(sql, actor, number, assignee, answers);
    await tell.assigned(actor, done.ticket, assignee);
    await tell.refreshBadges(sql);
    return null;
  });
}

export async function setStatus(number: number, status: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const t = await tickets.setStatus(sql, actor, number, status);
    if (t.status === "closed" || t.status === "spam") await tell.answered(t);
    await tell.refreshBadges(sql);
    return null;
  });
}

export async function createTicket(input: { name: string; email: string; subject: string; message: string; language: string }): Promise<Result<{ number: number; link: string }>> {
  return act(async actor => {
    const sql = db();
    const t = await tickets.fromTeam(sql, actor, input);
    const origin = publicOrigin(await headers());
    await tickets.rememberPublicOrigin(sql, origin);
    const link = `${origin ?? ""}/t/${t.secret}`;
    const s = await tickets.settings(sql);
    await mailer.confirm({ number: t.number, subject: input.subject.trim(), customerEmail: input.email.trim(), customerName: input.name.trim(), language: input.language === "fr" ? "fr" : "en" }, link, s.companyName);
    await tell.refreshBadges(sql);
    return { number: t.number, link };
  });
}

export async function saveReply(input: { id?: string; title: string; body: string }): Promise<Result<tickets.SavedReply>> {
  return act(actor => tickets.saveReply(db(), actor, input));
}

export async function removeReply(id: string): Promise<Result<null>> {
  return act(async actor => { await tickets.removeReply(db(), actor, id); return null; });
}

export async function saveSettings(input: { companyName?: string; formOpen?: boolean; intro?: string; retentionMonths?: number; lateHours?: number }): Promise<Result<null>> {
  return act(async actor => { await tickets.saveSettings(db(), actor, input); return null; });
}

export async function eraseCustomer(email: string): Promise<Result<{ tickets: number }>> {
  return act(async actor => {
    const sql = db();
    const gone = await tickets.eraseCustomer(sql, actor, email);
    for (const object of gone.objects) await files.delete(object).catch(() => false);
    await tell.refreshBadges(sql);
    return { tickets: gone.tickets };
  });
}

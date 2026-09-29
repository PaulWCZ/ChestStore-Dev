"use server";

import { revalidatePath } from "next/cache";
import { addCategory, removeCategory, restoreCategory, updateCategory } from "../../lib/categories.ts";
import { db } from "../../lib/db.ts";
import { attempt, type Result } from "../../lib/errors.ts";
import { addField, removeField, renameField, restoreField } from "../../lib/fields.ts";
import { applyImport, previewImport, type Plan } from "../../lib/importer.ts";
import * as inventory from "../../lib/inventory.ts";
import * as items from "../../lib/items.ts";
import { confirm, remind, setCharter } from "../../lib/receipts.ts";
import { remindReceipt } from "../../lib/tell.ts";
import * as requests from "../../lib/requests.ts";
import { currentMember } from "../../lib/session.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again, and the
// service checks their rights. They answer codes, never sentences.
async function act<T>(step: (actor: Awaited<ReturnType<typeof currentMember>>) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => step(await currentMember()));
  revalidatePath("/chest", "layout");
  return result;
}

// One item or several identical ones: their ids and tags, in order.
export async function createItem(input: items.ItemInput): Promise<Result<{ id: string; tag: string }[]>> {
  return act(async actor => (await items.createItems(db(), actor, input)).map(i => ({ id: i.id, tag: i.tag })));
}

export async function updateItem(id: string, input: items.ItemInput): Promise<Result> {
  return act(async actor => { await items.updateItem(db(), actor, id, input); return null; });
}

export async function deleteItem(id: string): Promise<Result> {
  return act(async actor => { await items.deleteItem(db(), actor, id); return null; });
}

export async function restoreItem(id: string): Promise<Result> {
  return act(async actor => { await items.restoreItem(db(), actor, id); return null; });
}

export async function giveItem(id: string, input: { to: { member: string } | { place: string }; note?: string; day?: string }): Promise<Result> {
  return act(async actor => { await items.give(db(), actor, id, input); return null; });
}

export async function takeBackItem(id: string, input: { note?: string; status?: string; day?: string }): Promise<Result<{ member: string } | { place: string }>> {
  return act(async actor => (await items.takeBack(db(), actor, id, input)).from);
}

// Undo of a take-back: the same holder has it again, without a new bell item.
export async function undoTakeBack(id: string, to: { member: string } | { place: string }): Promise<Result> {
  return act(async actor => { await items.give(db(), actor, id, { to }, { quiet: true }); return null; });
}

export async function setItemStatus(id: string, status: string, note?: string, repair?: { ref?: string; due?: string; cost?: string }): Promise<Result> {
  return act(async actor => { await items.setStatus(db(), actor, id, status, note, repair ?? {}); return null; });
}

export async function handOut(id: string, input: { qty: string; to?: { member: string } | { place: string } | null; note?: string }): Promise<Result<number>> {
  return act(async actor => (await items.handOut(db(), actor, id, input)).quantity ?? 0);
}

export async function restock(id: string, input: { qty: string; note?: string }): Promise<Result<number>> {
  return act(async actor => (await items.restock(db(), actor, id, input)).quantity ?? 0);
}

// "I received it".
export async function confirmReceipt(id: string, input: { remark?: string; charterId?: string }): Promise<Result> {
  return act(async actor => { await confirm(db(), actor, id, input); return null; });
}

// "Remind them": the bell, and email where the Chest sends it. Says
// whether the email left (the toast says how they were reminded).
export async function remindHolder(id: string): Promise<Result<{ mailed: boolean }>> {
  return act(async actor => {
    const r = await remind(db(), actor, id);
    return { mailed: await remindReceipt(actor!, r.holder, r.item, r.givenOn) };
  });
}

export async function saveCharter(body: string): Promise<Result> {
  return act(async actor => { await setCharter(db(), actor, body); return null; });
}

// Requests.
export async function askFor(input: { body: string; categoryId?: string }): Promise<Result> {
  return act(async actor => { await requests.ask(db(), actor, input); return null; });
}

export async function cancelRequest(id: string): Promise<Result> {
  return act(async actor => { await requests.cancel(db(), actor, id); return null; });
}

export async function approveRequest(id: string, answer?: string): Promise<Result> {
  return act(async actor => { await requests.approve(db(), actor, id, answer); return null; });
}

export async function refuseRequest(id: string, answer?: string): Promise<Result> {
  return act(async actor => { await requests.refuse(db(), actor, id, answer); return null; });
}

export async function fulfilRequest(id: string, itemId: string): Promise<Result> {
  return act(async actor => { await requests.fulfil(db(), actor, id, itemId); return null; });
}

// Fields of a category.
export async function newField(input: { categoryId: string; name: string; type: string }): Promise<Result> {
  return act(async actor => { await addField(db(), actor, input); return null; });
}

export async function saveField(id: string, name: string): Promise<Result> {
  return act(async actor => { await renameField(db(), actor, id, name); return null; });
}

export async function dropField(id: string): Promise<Result> {
  return act(async actor => { await removeField(db(), actor, id); return null; });
}

export async function undoDropField(id: string): Promise<Result> {
  return act(async actor => { await restoreField(db(), actor, id); return null; });
}

// The inventory.
export async function startInventory(): Promise<Result> {
  return act(async actor => { await inventory.startInventory(db(), actor); return null; });
}

export async function markSeen(input: { text?: string; itemId?: string }): Promise<Result<{ id: string; tag: string; name: string; already: boolean; outOfScope: boolean }>> {
  return act(async actor => {
    const r = await inventory.markSeen(db(), actor, input);
    return { id: r.item.id, tag: r.item.tag, name: r.item.name, already: r.already, outOfScope: r.outOfScope };
  });
}

export async function unmarkSeen(itemId: string): Promise<Result> {
  return act(async actor => { await inventory.unmarkSeen(db(), actor, itemId); return null; });
}

export async function closeInventory(): Promise<Result<{ id: string; missing: number }>> {
  return act(async actor => {
    const done = await inventory.closeInventory(db(), actor);
    return { id: done.id, missing: (done.total ?? 0) - (done.seen ?? 0) };
  });
}

export async function reopenInventory(id: string): Promise<Result> {
  return act(async actor => { await inventory.reopenInventory(db(), actor, id); return null; });
}

export async function giveSeat(id: string, member: string): Promise<Result> {
  return act(async actor => { await items.giveSeat(db(), actor, id, member); return null; });
}

export async function takeSeat(id: string, member: string): Promise<Result> {
  return act(async actor => { await items.takeSeat(db(), actor, id, member); return null; });
}

export async function undoTakeSeat(id: string, member: string): Promise<Result> {
  return act(async actor => { await items.giveSeat(db(), actor, id, member, { quiet: true }); return null; });
}

export async function takeEverythingBack(holder: string): Promise<Result<items.Taken>> {
  return act(async actor => items.takeEverythingBack(db(), actor, holder));
}

export async function giveBackEverything(holder: string, taken: items.Taken): Promise<Result> {
  return act(async actor => { await items.giveBackEverything(db(), actor, holder, taken); return null; });
}

export async function reportProblem(id: string, body: string): Promise<Result> {
  return act(async actor => { await items.report(db(), actor, id, body); return null; });
}

export async function solveProblem(id: string): Promise<Result> {
  return act(async actor => { await items.solve(db(), actor, id); return null; });
}

export async function saveCategory(id: string, input: { name?: string; icon?: string }): Promise<Result> {
  return act(async actor => { await updateCategory(db(), actor, id, input); return null; });
}

export async function newCategory(input: { name: string; icon: string; kind: string }): Promise<Result> {
  return act(async actor => { await addCategory(db(), actor, input); return null; });
}

export async function dropCategory(id: string): Promise<Result> {
  return act(async actor => { await removeCategory(db(), actor, id); return null; });
}

export async function undoDropCategory(id: string): Promise<Result> {
  return act(async actor => { await restoreCategory(db(), actor, id); return null; });
}

export async function checkImport(source: string, text: string, options?: { keep?: string[] }): Promise<Result<Plan>> {
  return attempt(async () => previewImport(db(), await currentMember(), source, text, options));
}

export async function runImport(source: string, text: string, options?: { keep?: string[] }): Promise<Result<{ imported: number; skipped: number; fields: number }>> {
  return act(async actor => applyImport(db(), actor, source, text, options));
}

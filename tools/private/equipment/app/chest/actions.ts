"use server";

import { revalidatePath } from "next/cache";
import { addCategory, removeCategory, restoreCategory, updateCategory } from "../../lib/categories.ts";
import { db } from "../../lib/db.ts";
import { attempt, type Result } from "../../lib/errors.ts";
import { applyImport, previewImport, type Plan } from "../../lib/importer.ts";
import * as items from "../../lib/items.ts";
import { currentMember } from "../../lib/session.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again, and the
// service checks their rights. They answer codes, never sentences.
async function act<T>(step: (actor: Awaited<ReturnType<typeof currentMember>>) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => step(await currentMember()));
  revalidatePath("/chest", "layout");
  return result;
}

export async function createItem(input: items.ItemInput): Promise<Result<{ id: string; tag: string }>> {
  return act(async actor => {
    const item = await items.createItem(db(), actor, input);
    return { id: item.id, tag: item.tag };
  });
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

export async function setItemStatus(id: string, status: string, note?: string): Promise<Result> {
  return act(async actor => { await items.setStatus(db(), actor, id, status, note); return null; });
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

export async function newCategory(input: { name: string; icon: string; licence: boolean }): Promise<Result> {
  return act(async actor => { await addCategory(db(), actor, input); return null; });
}

export async function dropCategory(id: string): Promise<Result> {
  return act(async actor => { await removeCategory(db(), actor, id); return null; });
}

export async function undoDropCategory(id: string): Promise<Result> {
  return act(async actor => { await restoreCategory(db(), actor, id); return null; });
}

export async function checkImport(source: string, text: string): Promise<Result<Plan>> {
  return attempt(async () => previewImport(db(), await currentMember(), source, text));
}

export async function runImport(source: string, text: string): Promise<Result<{ imported: number; skipped: number }>> {
  return act(async actor => applyImport(db(), actor, source, text));
}

"use server";

import { revalidatePath } from "next/cache";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { attempt, type Result } from "../../lib/errors.ts";
import { format } from "../../lib/i18n/index.ts";
import { addNote, removeNote, restoreNote, setPinned, type Note } from "../../lib/notes.ts";
import { notify, withdraw } from "../../lib/notify.ts";
import { currentMember } from "../../lib/session.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again, and the
// service checks their rights. They answer codes, never sentences.

export async function postNote(body: string): Promise<Result<Note>> {
  const result = await attempt(async () => addNote(db(), await currentMember(), body));
  revalidatePath("/chest");
  return result;
}

export async function deleteNote(id: string): Promise<Result> {
  const result = await attempt(async () => { await removeNote(db(), await currentMember(), id); return null; });
  revalidatePath("/chest");
  return result;
}

export async function undoDelete(id: string): Promise<Result> {
  const result = await attempt(async () => { await restoreNote(db(), await currentMember(), id); return null; });
  revalidatePath("/chest");
  return result;
}

export async function pinNote(id: string, pinned: boolean): Promise<Result<Note>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    const note = await setPinned(db(), actor, id, pinned);
    // The author hears of it, in their own language; not when they pin
    // their own note.
    if (pinned && actor && note.author !== actor.id && can(actor, "notes.pin")) {
      await notify([note.author], t => ({ title: format(t.notifications.pinnedTitle, { name: actor.name }), body: note.body }), { path: "/chest#note-" + note.id, key: "pinned:" + note.id });
    }
    if (!pinned) await withdraw("pinned:" + note.id);
    return note;
  });
  revalidatePath("/chest");
  return result;
}

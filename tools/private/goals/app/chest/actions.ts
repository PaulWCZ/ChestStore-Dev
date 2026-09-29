"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import * as comments from "../../lib/comments.ts";
import * as cycles from "../../lib/cycles.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import * as importer from "../../lib/import.ts";
import * as keyResults from "../../lib/key-results.ts";
import * as mail from "../../lib/mail.ts";
import { firstCycleChoices } from "../../lib/model.ts";
import { quarterName } from "../../lib/page-data.ts";
import * as objectives from "../../lib/objectives.ts";
import * as reminders from "../../lib/remind.ts";
import { reassign as reassignOwner } from "../../lib/orphans.ts";
import { currentMember } from "../../lib/session.ts";
import * as teams from "../../lib/teams.ts";
import * as tell from "../../lib/tell.ts";
import { today } from "../../lib/time.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

const words = (actor: Member) => catalogue(isLocale(actor.locale) ? actor.locale : "en");

// Cycles.
export async function createCycle(input: { name: string; startsOn: string; endsOn: string; current?: boolean }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await cycles.createCycle(db(), actor, input)).id }));
}

// The first cycle, in one click: this calendar quarter, or the next one
// when this one is nearly over (the Chest's calendar decides, never the
// browser's), named in the admin's words ("T4 2026").
export async function startFirstCycle(which: "current" | "next"): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const choices = firstCycleChoices(today());
    const chosen = [choices.main, choices.other].find(c => c?.which === which) ?? choices.main;
    const q = chosen.quarter;
    return { id: (await cycles.createCycle(db(), actor, { name: quarterName(words(actor), q), startsOn: q.startsOn, endsOn: q.endsOn, current: true })).id };
  });
}

export async function updateCycle(cycleId: string, input: { name?: string; startsOn?: string; endsOn?: string }): Promise<Result<null>> {
  return act(async actor => { await cycles.updateCycle(db(), actor, cycleId, input); return null; });
}

export async function makeCurrent(cycleId: string): Promise<Result<null>> {
  return act(async actor => { await cycles.setCurrent(db(), actor, cycleId); await tell.refreshBadges(db(), null); return null; });
}

export async function closeCycle(cycleId: string): Promise<Result<null>> {
  return act(async actor => { await cycles.closeCycle(db(), actor, cycleId); await tell.refreshBadges(db(), null); return null; });
}

export async function reopenCycle(cycleId: string): Promise<Result<null>> {
  return act(async actor => { await cycles.reopenCycle(db(), actor, cycleId); await tell.refreshBadges(db(), null); return null; });
}

export async function deleteCycle(cycleId: string): Promise<Result<null>> {
  return act(async actor => { await cycles.deleteCycle(db(), actor, cycleId); return null; });
}

// Objectives.
export async function createObjective(input: objectives.NewObjective): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    const made = await objectives.createObjective(sql, actor, input);
    const title = typeof input.title === "string" ? input.title.trim() : "";
    await tell.objectiveGiven(actor, made.owner, { id: made.id, title });
    await tell.shared(actor, made.viewers, { id: made.id, title });
    for (const k of made.keyResults) if (k.owner !== made.owner) await tell.keyResultGiven(actor, k.owner, { title: k.title, objectiveId: made.id });
    await tell.refreshBadges(sql, made.keyResults.map(k => k.owner));
    return { id: made.id };
  });
}

// An example company objective, in the admin's language: a one-click
// start that shows what a good objective looks like.
export async function addExample(cycleId: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const e = words(actor).example;
    const made = await objectives.createObjective(db(), actor, {
      cycleId,
      level: "company",
      title: e.title,
      why: e.why,
      keyResults: [
        { title: e.kr1, kind: "number", unit: e.kr1Unit, start: "0", target: "20" },
        { title: e.kr2, kind: "number", unit: e.kr2Unit, start: "0", target: "60" },
        { title: e.kr3, kind: "milestone" },
      ],
    });
    return { id: made.id };
  });
}

export async function updateObjective(objectiveId: string, input: { title?: string; why?: string; owner?: string; parentId?: string | null; teamId?: string; visibility?: string; viewers?: string[] }): Promise<Result<null>> {
  return act(async actor => {
    const done = await objectives.updateObjective(db(), actor, objectiveId, input);
    await tell.shared(actor, done.newViewers, { id: objectiveId, title: done.title });
    if (done.owner !== done.previousOwner) {
      await tell.objectiveGiven(actor, done.owner, { id: objectiveId, title: done.title });
      await tell.tellAdminsOfOrphans(db());
    }
    return null;
  });
}

export async function archiveObjective(objectiveId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await objectives.archiveObjective(sql, actor, objectiveId);
    await tell.refreshBadges(sql, null);
    return null;
  });
}

export async function restoreObjective(objectiveId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await objectives.restoreObjective(sql, actor, objectiveId);
    await tell.refreshBadges(sql, null);
    return null;
  });
}

export async function saveRetro(objectiveId: string, input: { score: string; learned: string }): Promise<Result<null>> {
  return act(async actor => { await objectives.saveRetro(db(), actor, objectiveId, input, today()); return null; });
}

export async function carryOver(objectiveId: string, cycleId: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: await objectives.carryOver(db(), actor, objectiveId, cycleId) }));
}

// Key results.
export async function addKeyResult(objectiveId: string, input: objectives.KeyResultInput): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const done = await keyResults.addKeyResult(db(), actor, objectiveId, input);
    await tell.keyResultGiven(actor, done.owner, { title: done.title, objectiveId });
    await tell.refreshBadges(db(), [done.owner]);
    return { id: done.id };
  });
}

export async function updateKeyResult(keyResultId: string, input: objectives.KeyResultInput): Promise<Result<null>> {
  return act(async actor => {
    const done = await keyResults.updateKeyResult(db(), actor, keyResultId, input);
    if (done.owner !== done.previousOwner) {
      await tell.keyResultGiven(actor, done.owner, { title: done.title, objectiveId: done.objectiveId });
      await tell.tellAdminsOfOrphans(db());
    }
    await tell.refreshBadges(db(), [done.owner, done.previousOwner]);
    return null;
  });
}

export async function archiveKeyResult(keyResultId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => {
    const done = await keyResults.archiveKeyResult(db(), actor, keyResultId, archived);
    await tell.refreshBadges(db(), [done.owner]);
    return null;
  });
}

export async function checkIn(keyResultId: string, input: { value: string | number; confidence: string; note: string }): Promise<Result<keyResults.CheckInDone>> {
  return act(async actor => {
    const done = await keyResults.checkIn(db(), actor, keyResultId, input);
    await tell.refreshBadges(db(), [done.owner]);
    return done;
  });
}

export async function undoCheckIn(checkInId: string): Promise<Result<null>> {
  return act(async actor => {
    const done = await keyResults.undoCheckIn(db(), actor, checkInId);
    await tell.refreshBadges(db(), [done.owner]);
    return null;
  });
}

// Comments.
export async function addComment(objectiveId: string, body: string): Promise<Result<comments.Comment>> {
  return act(async actor => {
    const done = await comments.addComment(db(), actor, objectiveId, body);
    await tell.commented(actor, [done.objective.owner, ...done.objective.keyResultOwners], done.objective, done.comment.body);
    return done.comment;
  });
}

export async function editComment(commentId: string, body: string): Promise<Result<null>> {
  return act(async actor => { await comments.editComment(db(), actor, commentId, body); return null; });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await comments.removeComment(db(), actor, commentId); return null; });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await comments.restoreComment(db(), actor, commentId); return null; });
}

// Settings and teams.
export async function saveSettings(input: { personal: boolean }): Promise<Result<teams.Settings>> {
  return act(actor => teams.saveSettings(db(), actor, input));
}

export async function addTeam(name: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await teams.addTeam(db(), actor, name)).id }));
}

export async function addGroupTeam(groupId: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await teams.addGroupTeam(db(), actor, groupId)).id }));
}

export async function addAllGroups(): Promise<Result<number>> {
  return act(actor => teams.addAllGroups(db(), actor));
}

export async function renameTeam(teamId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await teams.renameTeam(db(), actor, teamId, name); return null; });
}

export async function archiveTeam(teamId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await teams.archiveTeam(db(), actor, teamId, archived); return null; });
}

// Handing over what someone who left owned.
export async function reassign(input: { kind: "objective" | "key_result" | "all"; id?: string; from?: string; to: string }): Promise<Result<number>> {
  return act(async actor => {
    const sql = db();
    const done = await reassignOwner(sql, actor, input);
    await tell.tellAdminsOfOrphans(sql);
    await tell.refreshBadges(sql, [done.to]);
    return done.count;
  });
}

// Reminding who has not checked in this week (bell and email, once a day).
export async function remind(owner: string): Promise<Result<null>> {
  return act(async actor => { await reminders.remind(db(), actor, owner, tell.clockAt()); return null; });
}

export async function remindAll(): Promise<Result<number>> {
  return act(actor => reminders.remindAll(db(), actor, tell.clockAt()));
}

// My choice: reminders by email too, or only in the bell.
export async function setEmail(on: boolean): Promise<Result<null>> {
  return act(async actor => { await mail.setEmail(db(), actor, on); return null; });
}

// Importing a spreadsheet: what it would do, then doing it (and Undo).
type ImportInput = { text: string; mapping: importer.Mapping | null; cycleId: string; owners: Record<string, string> };
export async function previewImport(input: ImportInput): Promise<Result<importer.Preview>> {
  return attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return importer.previewImport(db(), actor, input);
  });
}

export async function runImport(input: ImportInput): Promise<Result<{ objectives: string[]; keyResults: number }>> {
  return act(async actor => {
    const sql = db();
    const done = await importer.runImport(sql, actor, input);
    await tell.refreshBadges(sql, done.owners);
    return { objectives: done.objectives, keyResults: done.keyResults };
  });
}

export async function undoImport(ids: string[]): Promise<Result<number>> {
  return act(async actor => {
    const sql = db();
    const n = await importer.undoImport(sql, actor, ids);
    await tell.refreshBadges(sql, null);
    return n;
  });
}

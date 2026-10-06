import { action, after, fail, field, type Field } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import type { KeyResultSent } from "./components/key-result-fields.tsx";
import { catalogue, localeOf } from "./i18n/index.ts";
import * as comments from "./lib/comments.ts";
import * as cycles from "./lib/cycles.ts";
import { db } from "./lib/db.ts";
import * as importer from "./lib/import.ts";
import * as keyResults from "./lib/key-results.ts";
import { confidences, firstCycleChoices, groupPattern, kinds, levels, limits, memberPattern, visibilities } from "./lib/model.ts";
import * as objectives from "./lib/objectives.ts";
import { reassign as reassignOwner } from "./lib/orphans.ts";
import { quarterName } from "./lib/page-data.ts";
import * as reminders from "./lib/remind.ts";
import { sources } from "./lib/sources.ts";
import * as teams from "./lib/teams.ts";
import * as tell from "./lib/tell.ts";
import { today } from "./lib/time.ts";
import { isDate } from "./lib/zone.ts";

// Every change Goals makes, by name: POST /chest/actions/<name>, from an
// island (call("checkIn", { … })) or a form. The member is read from the
// Chest's assertion on each call; the fields are read and bounded here, at
// the boundary; the services of src/lib/ check the rights first, then
// write, and refuse with a code (its sentence comes from the catalogue).
// What only tells people (notifications, the tile's number) runs after
// the answer (after()): a Chest that does not answer never fails a change
// already written.

// ---- Fields of Goals' own.
// A member id (mbr_…): an owner, someone who sees a confidential objective.
const member: Field<string> = { read: value => (typeof value === "string" && memberPattern.test(value) ? value : fail("invalid")) };
// A group of the Chest (grp_…).
const group: Field<string> = { read: value => (typeof value === "string" && groupPattern.test(value) ? value : fail("invalid")) };
// A calendar day that exists ("2026-10-01"); "Pick a valid date" otherwise.
const day: Field<string> = { read: value => (isDate(value) ? value : fail("invalid_date")) };
// A number as the person typed it ("12", "12,5", "1 200"): src/lib/model.ts
// reads it in either convention and says what is wrong with it.
const typed = field.text({ min: 0, max: 40 });
// Free text that may be empty (a "why", a note, a retrospective).
const prose = (max: number) => field.text({ min: 0, max });
// A key result as the form sends it (src/components/key-result-fields.tsx,
// krInput): each part read here; the measure and the owner are checked by
// src/lib/objectives.ts.
const keyResult: Field<objectives.KeyResultInput, KeyResultSent> = {
  read(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("invalid");
    const v = value as Record<string, unknown>;
    return {
      title: field.text({ max: limits.title }).read(v["title"]),
      kind: field.choice(kinds).read(v["kind"]),
      unit: prose(limits.unit).read(v["unit"]),
      start: field.optional(typed).read(v["start"]),
      target: field.optional(typed).read(v["target"]),
      owner: field.optional(member).read(v["owner"]),
      weight: field.int({ min: 1, max: 3 }).read(v["weight"]),
      source: field.choice(["manual", ...sources]).read(v["source"]),
      mine: field.bool().read(v["mine"]),
      scope: field.optional(field.text({ max: 64 })).read(v["scope"]),
    };
  },
};

const words = (actor: Member) => catalogue(localeOf(actor.language));
// The tile's number of these people, set again once the answer left.
const badges = (owners: string[] | null) => after("badges", () => tell.refreshBadges(db(), owners));

export const actions = {
  // ---- Cycles (admins).
  createCycle: action({ name: field.text({ max: limits.cycleName }), startsOn: day, endsOn: day, current: field.bool() }, async (input, { member: actor }): Promise<{ id: string }> => ({ id: (await cycles.createCycle(db(), actor, input)).id })),

  // The first cycle, in one click: this calendar quarter, or the next one
  // when this one is nearly over (the Chest's calendar decides, never the
  // browser's), named in the admin's words ("T4 2026").
  startFirstCycle: action({ which: field.choice(["current", "next"]) }, async ({ which }, { member: actor }): Promise<{ id: string }> => {
    const choices = firstCycleChoices(today());
    const chosen = [choices.main, choices.other].find(c => c?.which === which) ?? choices.main;
    const q = chosen.quarter;
    return { id: (await cycles.createCycle(db(), actor, { name: quarterName(words(actor), q), startsOn: q.startsOn, endsOn: q.endsOn, current: true })).id };
  }),

  updateCycle: action({ id: field.id(), name: field.text({ max: limits.cycleName }), startsOn: day, endsOn: day }, async ({ id, ...input }, { member: actor }): Promise<null> => {
    await cycles.updateCycle(db(), actor, id, input);
    return null;
  }),
  makeCurrent: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await cycles.setCurrent(db(), actor, id);
    badges(null);
    return null;
  }),
  closeCycle: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await cycles.closeCycle(db(), actor, id);
    badges(null);
    return null;
  }),
  reopenCycle: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await cycles.reopenCycle(db(), actor, id);
    badges(null);
    return null;
  }),
  deleteCycle: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await cycles.deleteCycle(db(), actor, id);
    return null;
  }),

  // ---- Objectives.
  createObjective: action({
    cycleId: field.id(),
    level: field.choice(levels),
    teamId: field.optional(field.id()),
    parentId: field.optional(field.id()),
    owner: field.optional(member),
    title: field.text({ max: limits.title }),
    why: prose(limits.why),
    keyResults: field.list(keyResult, limits.keyResultsPerObjective),
    visibility: field.optional(field.choice(visibilities)),
    viewers: field.list(member, limits.viewers),
  }, async (input, { member: actor }): Promise<{ id: string }> => {
    const made = await objectives.createObjective(db(), actor, input);
    after("tell", async () => {
      await tell.objectiveGiven(actor, made.owner, { id: made.id, title: input.title });
      await tell.shared(actor, made.viewers, { id: made.id, title: input.title });
      for (const k of made.keyResults) if (k.owner !== made.owner) await tell.keyResultGiven(actor, k.owner, { title: k.title, objectiveId: made.id });
    });
    badges(made.keyResults.map(k => k.owner));
    return { id: made.id };
  }),

  // An example company objective, in the admin's language: a one-click
  // start that shows what a good objective looks like.
  addExample: action({ cycleId: field.id() }, async ({ cycleId }, { member: actor }): Promise<{ id: string }> => {
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
    badges([actor.id]);
    return { id: made.id };
  }),

  updateObjective: action({
    id: field.id(),
    title: field.text({ max: limits.title }),
    why: prose(limits.why),
    owner: field.optional(member),
    parentId: field.nullable(field.id()),
    teamId: field.optional(field.id()),
    visibility: field.optional(field.choice(visibilities)),
    viewers: field.list(member, limits.viewers),
  }, async ({ id, ...input }, { member: actor }): Promise<null> => {
    const done = await objectives.updateObjective(db(), actor, id, input);
    after("tell", async () => {
      await tell.shared(actor, done.newViewers, { id, title: done.title });
      if (done.owner !== done.previousOwner) {
        await tell.objectiveGiven(actor, done.owner, { id, title: done.title });
        await tell.tellAdminsOfOrphans(db());
      }
    });
    return null;
  }),
  archiveObjective: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await objectives.archiveObjective(db(), actor, id);
    badges(null);
    return null;
  }),
  restoreObjective: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await objectives.restoreObjective(db(), actor, id);
    badges(null);
    return null;
  }),
  saveRetro: action({ id: field.id(), score: prose(5), learned: prose(limits.learned) }, async ({ id, ...input }, { member: actor }): Promise<null> => {
    await objectives.saveRetro(db(), actor, id, input, today());
    return null;
  }),
  carryOver: action({ id: field.id(), cycleId: field.id() }, async ({ id, cycleId }, { member: actor }): Promise<{ id: string }> => {
    const next = await objectives.carryOver(db(), actor, id, cycleId);
    badges(null);
    return { id: next };
  }),

  // ---- Key results and their weekly updates.
  addKeyResult: action({ objectiveId: field.id(), keyResult }, async ({ objectiveId, keyResult: input }, { member: actor }): Promise<{ id: string }> => {
    const done = await keyResults.addKeyResult(db(), actor, objectiveId, input);
    after("tell", () => tell.keyResultGiven(actor, done.owner, { title: done.title, objectiveId }));
    badges([done.owner]);
    return { id: done.id };
  }),
  updateKeyResult: action({ id: field.id(), keyResult }, async ({ id, keyResult: input }, { member: actor }): Promise<null> => {
    const done = await keyResults.updateKeyResult(db(), actor, id, input);
    if (done.owner !== done.previousOwner) {
      after("tell", async () => {
        await tell.keyResultGiven(actor, done.owner, { title: done.title, objectiveId: done.objectiveId });
        await tell.tellAdminsOfOrphans(db());
      });
    }
    badges([done.owner, done.previousOwner]);
    return null;
  }),
  archiveKeyResult: action({ id: field.id(), archived: field.bool() }, async ({ id, archived }, { member: actor }): Promise<null> => {
    const done = await keyResults.archiveKeyResult(db(), actor, id, archived);
    badges([done.owner]);
    return null;
  }),
  checkIn: action({ id: field.id(), value: typed, confidence: field.choice(confidences), note: prose(limits.note) }, async ({ id, ...input }, { member: actor }): Promise<{ id: string }> => {
    const done = await keyResults.checkIn(db(), actor, id, input);
    badges([done.owner]);
    return { id: done.id };
  }),
  undoCheckIn: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    const done = await keyResults.undoCheckIn(db(), actor, id);
    badges([done.owner]);
    return null;
  }),

  // ---- Comments.
  addComment: action({ objectiveId: field.id(), body: field.text({ max: limits.comment }) }, async ({ objectiveId, body }, { member: actor }): Promise<{ id: string }> => {
    const done = await comments.addComment(db(), actor, objectiveId, body);
    after("tell", () => tell.commented(actor, [done.objective.owner, ...done.objective.keyResultOwners], done.objective, done.comment.body));
    return { id: done.comment.id };
  }),
  editComment: action({ id: field.id(), body: field.text({ max: limits.comment }) }, async ({ id, body }, { member: actor }): Promise<null> => {
    await comments.editComment(db(), actor, id, body);
    return null;
  }),
  removeComment: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await comments.removeComment(db(), actor, id);
    return null;
  }),
  restoreComment: action({ id: field.id() }, async ({ id }, { member: actor }): Promise<null> => {
    await comments.restoreComment(db(), actor, id);
    return null;
  }),

  // ---- Settings and teams (admins).
  saveSettings: action({ personal: field.bool() }, async (input, { member: actor }): Promise<{ personal: boolean }> => teams.saveSettings(db(), actor, input)),
  addTeam: action({ name: field.text({ max: limits.teamName }) }, async ({ name }, { member: actor }): Promise<{ id: string }> => ({ id: (await teams.addTeam(db(), actor, name)).id })),
  addGroupTeam: action({ groupId: group }, async ({ groupId }, { member: actor }): Promise<{ id: string }> => ({ id: (await teams.addGroupTeam(db(), actor, groupId)).id })),
  addAllGroups: action({}, async (_input, { member: actor }): Promise<number> => teams.addAllGroups(db(), actor)),
  renameTeam: action({ id: field.id(), name: field.text({ max: limits.teamName }) }, async ({ id, name }, { member: actor }): Promise<null> => {
    await teams.renameTeam(db(), actor, id, name);
    return null;
  }),
  archiveTeam: action({ id: field.id(), archived: field.bool() }, async ({ id, archived }, { member: actor }): Promise<null> => {
    await teams.archiveTeam(db(), actor, id, archived);
    return null;
  }),

  // Handing over what someone who left owned.
  reassign: action({ kind: field.choice(["objective", "key_result", "all"]), id: field.optional(field.id()), from: field.optional(member), to: member }, async (input, { member: actor }): Promise<number> => {
    const done = await reassignOwner(db(), actor, input);
    after("tell", () => tell.tellAdminsOfOrphans(db()));
    badges([done.to]);
    return done.count;
  }),

  // Reminding who has not updated this week (a notification, once a day).
  remind: action({ owner: member }, async ({ owner }, { member: actor }): Promise<null> => reminders.remind(db(), actor, owner, tell.clockAt()), { parallel: true }),
  remindAll: action({}, async (_input, { member: actor }): Promise<number> => reminders.remindAll(db(), actor, tell.clockAt()), { parallel: true }),


  // Importing a spreadsheet: what it would do (read again at each choice,
  // beside the page's other actions), then doing it — and Undo. The file
  // is read in the browser and sent as text (1,000,000 characters at most).
  previewImport: action({ text: field.text({ min: 0, max: importer.importLimits.chars }), mapping: field.nullable(field.json()), cycleId: field.id(), owners: field.json() }, async (input, { member: actor }): Promise<importer.Preview> => importer.previewImport(db(), actor, input), { maxBody: 4 << 20, parallel: true }),
  runImport: action({ text: field.text({ min: 0, max: importer.importLimits.chars }), mapping: field.json(), cycleId: field.id(), owners: field.json() }, async (input, { member: actor }): Promise<{ objectives: string[]; keyResults: number }> => {
    const done = await importer.runImport(db(), actor, input);
    badges(done.owners);
    return { objectives: done.objectives, keyResults: done.keyResults };
  }, { maxBody: 4 << 20, parallel: true }),
  undoImport: action({ ids: field.list(field.id(), importer.importLimits.rows) }, async ({ ids }, { member: actor }): Promise<number> => {
    const n = await importer.undoImport(db(), actor, ids);
    badges(null);
    return n;
  }),
};

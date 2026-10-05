import { action, field, publicAction, redirect } from "./core/tool.ts";
import { db } from "./lib/db.ts";
import * as notes from "./lib/notes.ts";

// Every mutation of the tool, by name. action(): members only, the member
// read from the Chest's assertion on each call; publicAction(): anyone on
// the public part. The input is read by its fields (a refusal is a code
// the reader sees in their words); run returns plain data for the island.
// From an island: call("addNote", { body }). From a form:
// <form method="post" action="/chest/actions/addNote"> with fields of the
// same names. The page refreshes after each.
export const actions = {
  addNote: action({ body: field.text({ max: notes.maxLength }) }, async ({ body }, { member }) => ({ id: await notes.addNote(db(), member.id, body) })),
  pinNote: action({ id: field.id(), pinned: field.bool() }, async ({ id, pinned }, { member }) => notes.setPinned(db(), member, id, pinned)),
  removeNote: action({ id: field.id() }, async ({ id }, { member }) => notes.removeNote(db(), member, id)),
  restoreNote: action({ id: field.id() }, async ({ id }, { member }) => notes.restoreNote(db(), member, id)),

  // The public page's form. A field people never see (website) is filled
  // only by robots.
  sendMessage: publicAction({ body: field.text({ max: 1000 }), website: field.text({ min: 0, max: 200 }) }, async ({ body, website }) => {
    if (website === "") await notes.addNote(db(), null, body);
    redirect("/?sent=1");
  }),
};

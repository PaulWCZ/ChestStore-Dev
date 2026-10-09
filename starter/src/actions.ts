import { action, field } from "@argentic/chest-app";
import * as notes from "./lib/notes.ts";

// Every mutation of the tool, by name. action(): members only, the member
// read from the Chest's assertion on each call (a public part's actions
// are publicAction()). From an island: call("addNote", { body }). From a form:
// <form method="post" action="/chest/actions/addNote"> with fields of the
// same names. The page refreshes after each.
export const actions = {
  // EXAMPLE (Notes)
  addNote: action({ body: field.text({ max: notes.maxLength }) }, async ({ body }, { member }) => ({ id: await notes.addNote(member, body) })),
  pinNote: action({ id: field.id(), pinned: field.bool() }, ({ id, pinned }, { member }) => notes.setPinned(member, id, pinned)),
  removeNote: action({ id: field.id() }, ({ id }, { member }) => notes.removeNote(member, id)),
  restoreNote: action({ id: field.id() }, ({ id }, { member }) => notes.restoreNote(member, id)),
};

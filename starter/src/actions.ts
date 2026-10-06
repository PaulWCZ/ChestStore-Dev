import { action, field, publicAction, redirect } from "@argentic/chest-app";
import * as notes from "./lib/notes.ts";

// Every mutation of the tool, by name. action(): members only, the member
// read from the Chest's assertion on each call; publicAction(): anyone on
// the public part. From an island: call("addNote", { body }). From a form:
// <form method="post" action="/chest/actions/addNote"> with fields of the
// same names. The page refreshes after each.
export const actions = {
  // EXAMPLE (Notes)
  addNote: action({ body: field.text({ max: notes.maxLength }) }, async ({ body }, { member }) => ({ id: await notes.addNote(member, body) })),
  pinNote: action({ id: field.id(), pinned: field.bool() }, ({ id, pinned }, { member }) => notes.setPinned(member, id, pinned)),
  removeNote: action({ id: field.id() }, ({ id }, { member }) => notes.removeNote(member, id)),
  restoreNote: action({ id: field.id() }, ({ id }, { member }) => notes.restoreNote(member, id)),
  // The public page's form. A public write needs a bound (here: so many a
  // day) and a field people never see (website), filled only by robots.
  sendMessage: publicAction({ body: field.text({ max: 1000 }), website: field.text({ min: 0, max: 200 }) }, async ({ body, website }) => {
    if (website === "") await notes.addVisitorNote(body);
    redirect("/?sent=1");
  }),
};

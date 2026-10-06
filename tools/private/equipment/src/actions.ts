import { TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { action, fail, field, type Field, type Fields, type InputOf, type MemberContext } from "@argentic/chest-app";
import { can } from "./lib/access.ts";
import { addCategory, removeCategory, restoreCategory, setMembersSee as setSee, updateCategory } from "./lib/categories.ts";
import { db } from "./lib/db.ts";
import { addField, removeField, renameField, restoreField } from "./lib/fields.ts";
import { applyImport, previewImport, type Plan } from "./lib/importer.ts";
import { missingAsCsv, refresh } from "./lib/intune.ts";
import * as inventory from "./lib/inventory.ts";
import * as items from "./lib/items.ts";
import { confirm, remind, setCharter } from "./lib/receipts.ts";
import * as requests from "./lib/requests.ts";
import { tellPeople } from "./lib/returned.ts";
import { remindReceipt } from "./lib/tell.ts";
import { limits } from "./shared/model.ts";

// Every mutation of Equipment, by name: POST /chest/actions/<name>, called
// from the islands with call("giveItem", { id, to }). Each reads the member
// from the Chest's assertion; the services (src/lib/) check what the
// member may do and refuse with a code, never a sentence. After each one
// that succeeded, what is back from a leaving person is told to People
// (lib/returned.ts; never fails the action).
function act<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: MemberContext) => Promise<R>, options: { maxBody?: number } = {}) {
  return action(input, async (values, context) => {
    const value = await run(values, context);
    await tellPeople(db());
    return value;
  }, options);
}

// The services read and check what a person wrote themselves — clean(),
// day(), money(), count()… with the tool's own codes ("Write an amount
// such as 1299.90.") —: those values are taken as sent. Ids are checked
// here.
const raw = <W>(): Field<unknown, W> => ({ read: value => value });
const maybe = <W>(): Field<unknown, W | undefined> & { readonly omissible: true } => ({ omissible: true, read: value => value });
const id = field.id;
type Holding = { member: string } | { place: string };

// An object of an item's folder in the Chest's files, as the Chest named it.
const objectOf = (folder: "photos" | "invoices", itemId: string, name: string) => new RegExp(`^${folder}/${itemId}/[0-9a-f]{20}\\.[a-z0-9]{1,8}$`, "u").test(name);
async function managedItem(member: MemberContext["member"], itemId: string): Promise<{ id: string }> {
  if (!can(member, "items.manage")) fail("forbidden");
  return (await items.itemDetail(db(), member, itemId)).item;
}
// One upload granted into the item's folder: the browser PUTs the file
// there, then save… records it once the Chest says it holds it.
async function grant(folder: "photos" | "invoices", itemId: string, size: number, maxSize: number, types: string[]): Promise<{ url: string }> {
  if (size > maxSize) fail("file_too_large");
  try {
    const up = await files.uploadUrl(`${folder}/${itemId}/`, { maxSize, types, expiresIn: 600 });
    return { url: up.url };
  } catch (error) {
    if (error instanceof TooLarge) fail("file_too_large");
    throw error;
  }
}
const photoTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const invoiceTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export const actions = {
  // ---- Items. One or several identical ones: their ids and tags, in order.
  createItem: act({ input: field.json() }, async ({ input }, { member }): Promise<{ id: string; tag: string }[]> =>
    (await items.createItems(db(), member, input as items.ItemInput)).map(i => ({ id: i.id, tag: i.tag }))),
  updateItem: act({ id: id(), input: field.json() }, async ({ id, input }, { member }): Promise<null> => {
    await items.updateItem(db(), member, id, input as items.ItemInput);
    return null;
  }),
  deleteItem: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await items.deleteItem(db(), member, id);
    return null;
  }),
  restoreItem: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await items.restoreItem(db(), member, id);
    return null;
  }),

  // ---- Give and take back.
  giveItem: act({ id: id(), to: field.json(), note: maybe<string>(), day: maybe<string>() }, async ({ id, to, note, day }, { member }): Promise<null> => {
    await items.give(db(), member, id, { to, note, day });
    return null;
  }),
  takeBackItem: act({ id: id(), note: maybe<string>(), status: maybe<string>(), day: maybe<string>() }, async ({ id, note, status, day }, { member }): Promise<Holding> =>
    (await items.takeBack(db(), member, id, { note, status, day })).from),
  // Undo of a take-back: the same holder has it again, without a new bell item.
  undoTakeBack: act({ id: id(), to: field.json() }, async ({ id, to }, { member }): Promise<null> => {
    await items.give(db(), member, id, { to }, { quiet: true });
    return null;
  }),
  setItemStatus: act({ id: id(), status: raw<string>(), note: maybe<string>(), ref: maybe<string>(), due: maybe<string>(), cost: maybe<string>() },
    async ({ id, status, note, ref, due, cost }, { member }): Promise<null> => {
      await items.setStatus(db(), member, id, status, note, { ref, due, cost });
      return null;
    }),
  handOut: act({ id: id(), qty: raw<string | number>(), to: maybe<Holding | null>(), note: maybe<string>() }, async ({ id, qty, to, note }, { member }): Promise<number> =>
    (await items.handOut(db(), member, id, { qty, to, note })).quantity ?? 0),
  restock: act({ id: id(), qty: raw<string | number>(), note: maybe<string>() }, async ({ id, qty, note }, { member }): Promise<number> =>
    (await items.restock(db(), member, id, { qty, note })).quantity ?? 0),
  giveSeat: act({ id: id(), member: raw<string>() }, async ({ id, member: holder }, { member }): Promise<null> => {
    await items.giveSeat(db(), member, id, holder);
    return null;
  }),
  takeSeat: act({ id: id(), member: raw<string>() }, async ({ id, member: holder }, { member }): Promise<null> => {
    await items.takeSeat(db(), member, id, holder);
    return null;
  }),
  undoTakeSeat: act({ id: id(), member: raw<string>() }, async ({ id, member: holder }, { member }): Promise<null> => {
    await items.giveSeat(db(), member, id, holder, { quiet: true });
    return null;
  }),
  takeEverythingBack: act({ holder: raw<string>() }, async ({ holder }, { member }): Promise<items.Taken> => items.takeEverythingBack(db(), member, holder)),
  giveBackEverything: act({ holder: raw<string>(), taken: field.json() }, async ({ holder, taken }, { member }): Promise<null> => {
    await items.giveBackEverything(db(), member, holder, taken as { items?: unknown; seats?: unknown });
    return null;
  }),

  // ---- Problems.
  reportProblem: act({ id: id(), body: raw<string>() }, async ({ id, body }, { member }): Promise<null> => {
    await items.report(db(), member, id, body);
    return null;
  }),
  solveProblem: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await items.solve(db(), member, id);
    return null;
  }),

  // ---- "I received it", "Remind them" (the bell, and email where the
  // Chest sends it: says whether the email left), the rules.
  confirmReceipt: act({ id: id(), remark: maybe<string>(), charterId: maybe<string>() }, async ({ id, remark, charterId }, { member }): Promise<null> => {
    await confirm(db(), member, id, { remark, charterId });
    return null;
  }),
  remindHolder: act({ id: id() }, async ({ id }, { member }): Promise<{ mailed: boolean }> => {
    const r = await remind(db(), member, id);
    return { mailed: await remindReceipt(member, r.holder, r.item, r.givenOn) };
  }),
  saveCharter: act({ body: raw<string>() }, async ({ body }, { member }): Promise<null> => {
    await setCharter(db(), member, body);
    return null;
  }),

  // ---- Requests.
  askFor: act({ body: raw<string>(), categoryId: maybe<string>() }, async ({ body, categoryId }, { member }): Promise<null> => {
    await requests.ask(db(), member, { body, categoryId });
    return null;
  }),
  cancelRequest: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await requests.cancel(db(), member, id);
    return null;
  }),
  approveRequest: act({ id: id(), answer: maybe<string>() }, async ({ id, answer }, { member }): Promise<null> => {
    await requests.approve(db(), member, id, answer);
    return null;
  }),
  refuseRequest: act({ id: id(), answer: maybe<string>() }, async ({ id, answer }, { member }): Promise<null> => {
    await requests.refuse(db(), member, id, answer);
    return null;
  }),
  fulfilRequest: act({ id: id(), itemId: id() }, async ({ id, itemId }, { member }): Promise<null> => {
    await requests.fulfil(db(), member, id, itemId);
    return null;
  }),

  // ---- Categories and their fields.
  newCategory: act({ name: raw<string>(), icon: raw<string>(), kind: raw<string>() }, async ({ name, icon, kind }, { member }): Promise<null> => {
    await addCategory(db(), member, { name, icon, kind });
    return null;
  }),
  saveCategory: act({ id: id(), name: maybe<string>(), icon: maybe<string>() }, async ({ id, name, icon }, { member }): Promise<null> => {
    await updateCategory(db(), member, id, { ...(name !== undefined ? { name } : {}), ...(icon !== undefined ? { icon } : {}) });
    return null;
  }),
  setMembersSee: act({ id: id(), value: field.bool() }, async ({ id, value }, { member }): Promise<null> => {
    await setSee(db(), member, id, value);
    return null;
  }),
  dropCategory: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await removeCategory(db(), member, id);
    return null;
  }),
  undoDropCategory: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await restoreCategory(db(), member, id);
    return null;
  }),
  newField: act({ categoryId: raw<string>(), name: raw<string>(), type: raw<string>() }, async ({ categoryId, name, type }, { member }): Promise<null> => {
    await addField(db(), member, { categoryId, name, type });
    return null;
  }),
  saveField: act({ id: id(), name: raw<string>() }, async ({ id, name }, { member }): Promise<null> => {
    await renameField(db(), member, id, name);
    return null;
  }),
  dropField: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await removeField(db(), member, id);
    return null;
  }),
  undoDropField: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await restoreField(db(), member, id);
    return null;
  }),

  // ---- The inventory.
  startInventory: act({}, async (_input, { member }): Promise<null> => {
    await inventory.startInventory(db(), member);
    return null;
  }),
  markSeen: act({ text: maybe<string>(), itemId: maybe<string>() }, async ({ text, itemId }, { member }): Promise<{ id: string; tag: string; name: string; already: boolean; outOfScope: boolean }> => {
    const r = await inventory.markSeen(db(), member, { text, itemId });
    return { id: r.item.id, tag: r.item.tag, name: r.item.name, already: r.already, outOfScope: r.outOfScope };
  }),
  unmarkSeen: act({ itemId: id() }, async ({ itemId }, { member }): Promise<null> => {
    await inventory.unmarkSeen(db(), member, itemId);
    return null;
  }),
  closeInventory: act({}, async (_input, { member }): Promise<{ id: string; missing: number }> => {
    const done = await inventory.closeInventory(db(), member);
    return { id: done.id, missing: (done.total ?? 0) - (done.seen ?? 0) };
  }),
  reopenInventory: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    await inventory.reopenInventory(db(), member, id);
    return null;
  }),

  // ---- Import. The page sends the file's text (5 MB at most: the
  // service refuses more); checkImport reads it and answers what would
  // come, runImport writes it. checkIntune reads Microsoft Intune now and
  // shows what it knows that is not here yet, as a file would be shown.
  checkImport: act({ source: raw<string>(), text: raw<string>(), keep: maybe<string[]>() }, async ({ source, text, keep }, { member }): Promise<Plan> =>
    previewImport(db(), member, source, text, keep === undefined ? undefined : { keep }), { maxBody: limits.importBytes * 2 + 65_536 }),
  runImport: act({ source: raw<string>(), text: raw<string>(), keep: maybe<string[]>() }, async ({ source, text, keep }, { member }): Promise<{ imported: number; skipped: number; fields: number }> =>
    applyImport(db(), member, source, text, keep === undefined ? undefined : { keep }), { maxBody: limits.importBytes * 2 + 65_536 }),
  checkIntune: act({}, async (_input, { member }): Promise<{ devices: number; text: string | null; plan: Plan | null }> => {
    const read = await refresh(db(), member);
    const { text, count } = await missingAsCsv(db(), member, read.list);
    return { devices: read.devices, text: count > 0 ? text : null, plan: count > 0 ? await previewImport(db(), member, "intune", text) : null };
  }),

  // ---- An item's photo and its purchase invoice, in the Chest's files
  // (photos/<item>/…, invoices/<item>/…), in three steps around the
  // browser's own upload: one upload granted, the file PUT there by the
  // browser, then recorded once the Chest holds it (the old one deleted).
  uploadPhoto: act({ id: id(), size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ id, size }, { member }): Promise<{ url: string }> =>
    grant("photos", (await managedItem(member, id)).id, size, limits.photoSize, photoTypes)),
  savePhoto: act({ id: id(), name: field.text({ max: 200 }) }, async ({ id, name }, { member }): Promise<null> => {
    const item = await managedItem(member, id);
    if (!objectOf("photos", item.id, name)) fail("invalid");
    const held = await files.stat(name);
    if (!held) return fail("file_missing");
    const { previous } = await items.setPhoto(db(), member, item.id, held.name);
    if (previous && previous !== held.name) await files.delete(previous).catch(() => false);
    return null;
  }),
  removePhoto: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    const item = await managedItem(member, id);
    const { previous } = await items.setPhoto(db(), member, item.id, null);
    if (previous) await files.delete(previous).catch(() => false);
    return null;
  }),
  uploadInvoice: act({ id: id(), size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ id, size }, { member }): Promise<{ url: string }> =>
    grant("invoices", (await managedItem(member, id)).id, size, limits.invoiceSize, invoiceTypes)),
  saveInvoice: act({ id: id(), name: field.text({ max: 200 }) }, async ({ id, name }, { member }): Promise<null> => {
    const item = await managedItem(member, id);
    if (!objectOf("invoices", item.id, name)) fail("invalid");
    const held = await files.stat(name);
    if (!held) return fail("file_missing");
    const { previous } = await items.setInvoice(db(), member, item.id, held.name);
    if (previous && previous !== held.name) await files.delete(previous).catch(() => false);
    return null;
  }),
  removeInvoice: act({ id: id() }, async ({ id }, { member }): Promise<null> => {
    const item = await managedItem(member, id);
    const { previous } = await items.setInvoice(db(), member, item.id, null);
    if (previous) await files.delete(previous).catch(() => false);
    return null;
  }),
};

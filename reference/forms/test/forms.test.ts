import assert from "node:assert/strict";
import { test } from "node:test";
import { canEdit, canRead, Forms } from "../lib/forms.ts";
import { FormsError, limits } from "../lib/model.ts";
import { MemoryStore } from "./memory-store.ts";

const editor = { id: "mbr_aaaaaaaaaaaaaaaaaaaaaaaaaa", role: "editor" };
const reader = { id: "mbr_bbbbbbbbbbbbbbbbbbbbbbbbbb", role: "reader" };
const draft = { title: "Sign-up", description: "", fields: [{ label: "Name", kind: "text", required: true }, { label: "Email", kind: "email", required: false }] };
const refused = (code: FormsError["code"]) => (e: unknown) => e instanceof FormsError && e.code === code;
const fresh = () => {
  const store = new MemoryStore();
  let n = 0;
  return { store, forms: new Forms(store, size => new Uint8Array(size).fill(n++)) };
};

test("editors make forms, readers read them, anybody else nothing", async () => {
  const { forms } = fresh();
  assert.ok(canEdit(editor) && canRead(editor) && canRead(reader) && !canEdit(reader));
  for (const nobody of [null, {}, { role: null }, { role: "" }, { role: "admin" }, { role: "Editor" }, { role: "editeur" }, { role: "lecteur" }]) assert.ok(!canRead(nobody) && !canEdit(nobody));
  await assert.rejects(forms.create(reader, draft), refused("forbidden"));
  await assert.rejects(forms.create({ id: "x" }, draft), refused("forbidden"));
  const id = await forms.create(editor, draft);
  await assert.rejects(forms.publish(reader, id), refused("forbidden"));
  await assert.rejects(forms.update(reader, id, draft), refused("forbidden"));
  await assert.rejects(forms.remove(reader, id), refused("forbidden"));
  await assert.rejects(forms.list(null), refused("forbidden"));
  await assert.rejects(forms.get({ role: "admin" }, id), refused("forbidden"));
  assert.equal((await forms.list(reader)).length, 1);
  assert.equal((await forms.get(reader, id)).title, "Sign-up");
  await assert.rejects(forms.get(reader, "not-an-id"), refused("not_found"));
  await assert.rejects(forms.get(reader, "00000000-0000-0000-0000-000000000000"), refused("not_found"));
});

test("a draft is edited, published explicitly, then closed; it never goes back", async () => {
  const { forms } = fresh();
  const id = await forms.create(editor, draft);
  const created = await forms.get(editor, id);
  assert.equal(created.status, "draft");
  assert.match(created.slug, /^[a-km-np-z2-9]{10}$/u);
  await forms.update(editor, id, { ...draft, title: "Workshop sign-up" });
  assert.equal((await forms.get(editor, id)).title, "Workshop sign-up");
  await assert.rejects(forms.update(editor, id, { ...draft, fields: [] }), refused("invalid"));
  await assert.rejects(forms.close(editor, id), refused("conflict"));
  await forms.publish(editor, id);
  await assert.rejects(forms.publish(editor, id), refused("conflict"));
  await assert.rejects(forms.update(editor, id, draft), refused("conflict"));
  await assert.rejects(forms.remove(editor, id), refused("conflict"));
  await forms.close(editor, id);
  assert.equal((await forms.get(editor, id)).status, "closed");
  await assert.rejects(forms.publish(editor, id), refused("conflict"));
});

test("a draft can be removed, a published form cannot", async () => {
  const { forms } = fresh();
  const id = await forms.create(editor, draft);
  await forms.remove(editor, id);
  await assert.rejects(forms.get(editor, id), refused("not_found"));
});

test("the public side sees a published or closed form, never a draft", async () => {
  const { forms } = fresh();
  const id = await forms.create(editor, draft);
  const { slug } = await forms.get(editor, id);
  assert.equal(await forms.publicForm(slug), null);
  await assert.rejects(forms.answer(slug, () => "Claire"), refused("not_found"));
  assert.equal(await forms.publicForm("../chest"), null);
  await forms.publish(editor, id);
  assert.equal((await forms.publicForm(slug))?.status, "published");
  await forms.close(editor, id);
  assert.equal((await forms.publicForm(slug))?.status, "closed");
});

test("an anonymous answer is checked, kept, and stays when the form closes", async () => {
  const { forms } = fresh();
  const id = await forms.create(editor, draft);
  const { slug } = await forms.get(editor, id);
  await forms.publish(editor, id);
  assert.deepEqual(await forms.answer(slug, () => null), { ok: false, errors: { f1: "required" } });
  const sent: Record<string, string> = { f1: "Claire", f2: "claire@example.test" };
  assert.equal((await forms.answer(slug, name => sent[name])).ok, true);
  await forms.close(editor, id);
  assert.deepEqual(await forms.answer(slug, name => sent[name]), { ok: false, closed: true });
  const { form, responses } = await forms.responses(reader, id);
  assert.equal(form.responses, 1);
  assert.deepEqual(responses.map(r => r.answers), [{ f1: "Claire", f2: "claire@example.test" }]);
  await assert.rejects(forms.responses(null, id), refused("forbidden"));
});

test("a form takes no more answers than its bound", async () => {
  const { store, forms } = fresh();
  const id = await forms.create(editor, draft);
  const { slug } = await forms.get(editor, id);
  await forms.publish(editor, id);
  store.answers.set(id, Array.from({ length: limits.responses }, (_, i) => ({ id: String(i), at: new Date(0).toISOString(), answers: { f1: "x", f2: "" } })));
  await assert.rejects(forms.answer(slug, name => (name === "f1" ? "Claire" : "")), refused("full"));
  assert.equal((await forms.responses(reader, id, 5)).responses.length, 5);
});

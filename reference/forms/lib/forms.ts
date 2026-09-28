import { randomBytes } from "node:crypto";
import { answers, definition, FormsError, idPattern, limits, slugOf, slugPattern } from "./model.ts";
import type { Answers, Checked, Definition, Form, Response, Status } from "./model.ts";

// What the tool keeps, whatever keeps it: PostgreSQL in service, a double in
// tests. Each change says whether it happened; a condition (a status, a
// bound) is checked by the store in the same statement as the change.
export interface Store {
  list(): Promise<Form[]>;
  get(id: string): Promise<Form | null>;
  bySlug(slug: string): Promise<Form | null>;
  create(slug: string, definition: Definition, by: string): Promise<string>;
  updateDraft(id: string, definition: Definition): Promise<boolean>;
  removeDraft(id: string): Promise<boolean>;
  transition(id: string, from: Status, to: Status): Promise<boolean>;
  // respond adds an answer while the form is published and holds fewer than
  // max answers: "added", "closed" (not published any more) or "full".
  respond(id: string, answers: Answers, max: number): Promise<"added" | "closed" | "full">;
  responses(id: string, limit: number): Promise<Response[]>;
}

// Who asks, as the Chest asserts it (member() of the SDK): only the role
// matters here. Editors (editor) make, publish and close forms; readers
// (reader) read them and their responses. Any other role, or none, is
// nothing: the Chest decides who reaches the tool, the tool what each role
// may do in it.
export type Actor = { role?: string | null } | null;
export const canEdit = (actor: Actor): boolean => actor?.role === "editor";
export const canRead = (actor: Actor): boolean => canEdit(actor) || actor?.role === "reader";

export class Forms {
  readonly #store: Store;
  readonly #random: (size: number) => Uint8Array;
  constructor(store: Store, random: (size: number) => Uint8Array = randomBytes) {
    this.#store = store;
    this.#random = random;
  }

  #read(actor: Actor): void {
    if (!canRead(actor)) throw new FormsError("forbidden");
  }
  #edit(actor: Actor): void {
    if (!canEdit(actor)) throw new FormsError("forbidden");
  }

  async list(actor: Actor): Promise<Form[]> {
    this.#read(actor);
    return this.#store.list();
  }

  async get(actor: Actor, id: string): Promise<Form> {
    this.#read(actor);
    const form = idPattern.test(id) ? await this.#store.get(id) : null;
    if (!form) throw new FormsError("not_found");
    return form;
  }

  async create(actor: Actor & { id: string }, input: unknown): Promise<string> {
    this.#edit(actor);
    const form = definition(input);
    return this.#store.create(slugOf(this.#random(10)), form, actor.id);
  }

  // A form's fields change only while it is a draft: once published, its
  // answers are to those fields.
  async update(actor: Actor, id: string, input: unknown): Promise<void> {
    this.#edit(actor);
    const form = definition(input);
    await this.get(actor, id);
    if (!(await this.#store.updateDraft(id, form))) throw new FormsError("conflict");
  }

  async remove(actor: Actor, id: string): Promise<void> {
    this.#edit(actor);
    await this.get(actor, id);
    if (!(await this.#store.removeDraft(id))) throw new FormsError("conflict");
  }

  // Publishing is explicit, from a draft; closing stops the collection and
  // keeps every answer.
  publish(actor: Actor, id: string): Promise<void> {
    return this.#transition(actor, id, "draft", "published");
  }
  close(actor: Actor, id: string): Promise<void> {
    return this.#transition(actor, id, "published", "closed");
  }
  async #transition(actor: Actor, id: string, from: Status, to: Status): Promise<void> {
    this.#edit(actor);
    await this.get(actor, id);
    if (!(await this.#store.transition(id, from, to))) throw new FormsError("conflict");
  }

  // responses are the latest answers of a form, limit at most: a page shows
  // the latest ones, an export all a form may hold.
  async responses(actor: Actor, id: string, limit: number = limits.responses): Promise<{ form: Form; responses: Response[] }> {
    const form = await this.get(actor, id);
    return { form, responses: await this.#store.responses(id, Math.max(1, Math.min(limit, limits.responses))) };
  }

  // The public side: a published form, or a closed one to say so; a draft
  // or an unknown address is nothing.
  async publicForm(slug: string): Promise<Form | null> {
    const form = slugPattern.test(slug) ? await this.#store.bySlug(slug) : null;
    return form && form.status !== "draft" ? form : null;
  }

  // answer takes an anonymous answer to a published form.
  async answer(slug: string, read: (id: string) => unknown): Promise<Checked | { ok: false; closed: true }> {
    const form = await this.publicForm(slug);
    if (!form) throw new FormsError("not_found");
    if (form.status !== "published") return { ok: false, closed: true };
    const checked = answers(read, form.fields);
    if (!checked.ok) return checked;
    const outcome = await this.#store.respond(form.id, checked.answers, limits.responses);
    if (outcome === "closed") return { ok: false, closed: true };
    if (outcome === "full") throw new FormsError("full");
    return checked;
  }
}

import { randomUUID } from "node:crypto";
import type { Store } from "../lib/forms.ts";
import type { Answers, Definition, Form, Response, Status } from "../lib/model.ts";

// A Store kept in memory, with the same conditions as the PostgreSQL one:
// a draft alone changes or leaves, a status moves only from the one named,
// an answer reaches only a published form under its bound.
export class MemoryStore implements Store {
  forms = new Map<string, Omit<Form, "responses"> & { by: string }>();
  answers = new Map<string, Response[]>();

  async list(): Promise<Form[]> {
    return [...this.forms.values()].map(f => this.#view(f));
  }
  async get(id: string): Promise<Form | null> {
    const form = this.forms.get(id);
    return form ? this.#view(form) : null;
  }
  async bySlug(slug: string): Promise<Form | null> {
    const form = [...this.forms.values()].find(f => f.slug === slug);
    return form ? this.#view(form) : null;
  }
  async create(slug: string, definition: Definition, by: string): Promise<string> {
    const id = randomUUID();
    this.forms.set(id, { ...structuredClone(definition), id, slug, status: "draft", updated: new Date().toISOString(), by });
    return id;
  }
  async updateDraft(id: string, definition: Definition): Promise<boolean> {
    const form = this.forms.get(id);
    if (form?.status !== "draft") return false;
    this.forms.set(id, { ...form, ...structuredClone(definition) });
    return true;
  }
  async removeDraft(id: string): Promise<boolean> {
    return this.forms.get(id)?.status === "draft" && this.forms.delete(id);
  }
  async transition(id: string, from: Status, to: Status): Promise<boolean> {
    const form = this.forms.get(id);
    if (form?.status !== from) return false;
    form.status = to;
    return true;
  }
  async respond(id: string, answers: Answers, max: number): Promise<"added" | "closed" | "full"> {
    if (this.forms.get(id)?.status !== "published") return "closed";
    const list = this.answers.get(id) ?? [];
    if (list.length >= max) return "full";
    list.unshift({ id: randomUUID(), at: new Date().toISOString(), answers: structuredClone(answers) });
    this.answers.set(id, list);
    return "added";
  }
  async responses(id: string, limit: number): Promise<Response[]> {
    return (this.answers.get(id) ?? []).slice(0, limit);
  }
  #view(form: Omit<Form, "responses"> & { by: string }): Form {
    const { by: _, ...rest } = form;
    return { ...structuredClone(rest), responses: this.answers.get(form.id)?.length ?? 0 };
  }
}

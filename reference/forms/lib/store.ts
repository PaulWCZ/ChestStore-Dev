import postgres from "postgres";
import { storedAnswers, storedFields } from "./model.ts";
import type { Answers, Definition, Form, Response, Status } from "./model.ts";
import type { Store } from "./forms.ts";

// The tool's own PostgreSQL database, as its Chest gives it (DATABASE_URL,
// capability database); the schema is migrations/0001_forms.sql, played by
// the Chest before a version serves. Every statement is a tagged template:
// values are parameters, never text of the query.

type Sql = ReturnType<typeof postgres>;
const holder = globalThis as { formsSql?: Sql };

// One pool per process, opened at the first query. DATABASE_URL is the
// address the Chest gives at start (127.0.0.1, the launcher's relay): a
// secret, never logged, never sent to a browser.
function sql(): Sql {
  const url = process.env["DATABASE_URL"];
  if (!url?.startsWith("postgres://")) throw new Error("no database: the Chest gives DATABASE_URL to a version that declares the capability database");
  holder.formsSql ??= postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 10, onnotice: () => {} });
  return holder.formsSql;
}

type FormRow = { id: string; slug: string; title: string; description: string; fields: unknown; status: string; updated_at: Date; responses: string | number };

function form(row: FormRow): Form {
  if (row.status !== "draft" && row.status !== "published" && row.status !== "closed") throw new Error("unknown status");
  return { id: row.id, slug: row.slug, title: row.title, description: row.description, fields: storedFields(row.fields), status: row.status, updated: row.updated_at.toISOString(), responses: Number(row.responses) };
}

export class PostgresStore implements Store {
  async list(): Promise<Form[]> {
    const rows = await sql()<FormRow[]>`
      SELECT f.id, f.slug, f.title, f.description, f.fields, f.status, f.updated_at,
             (SELECT count(*) FROM responses r WHERE r.form_id = f.id) AS responses
      FROM forms f ORDER BY f.updated_at DESC LIMIT 500`;
    return rows.map(form);
  }

  async get(id: string): Promise<Form | null> {
    const [row] = await sql()<FormRow[]>`
      SELECT f.id, f.slug, f.title, f.description, f.fields, f.status, f.updated_at,
             (SELECT count(*) FROM responses r WHERE r.form_id = f.id) AS responses
      FROM forms f WHERE f.id = ${id}`;
    return row ? form(row) : null;
  }

  async bySlug(slug: string): Promise<Form | null> {
    const [row] = await sql()<FormRow[]>`
      SELECT f.id, f.slug, f.title, f.description, f.fields, f.status, f.updated_at, 0 AS responses
      FROM forms f WHERE f.slug = ${slug}`;
    return row ? form(row) : null;
  }

  async create(slug: string, definition: Definition, by: string): Promise<string> {
    const [row] = await sql()<{ id: string }[]>`
      INSERT INTO forms (slug, title, description, fields, created_by)
      VALUES (${slug}, ${definition.title}, ${definition.description}, ${sql().json(definition.fields)}, ${by})
      RETURNING id`;
    if (!row) throw new Error("form not created");
    return row.id;
  }

  async updateDraft(id: string, definition: Definition): Promise<boolean> {
    const result = await sql()`
      UPDATE forms SET title = ${definition.title}, description = ${definition.description}, fields = ${sql().json(definition.fields)}, updated_at = now()
      WHERE id = ${id} AND status = 'draft'`;
    return result.count === 1;
  }

  async removeDraft(id: string): Promise<boolean> {
    const result = await sql()`DELETE FROM forms WHERE id = ${id} AND status = 'draft'`;
    return result.count === 1;
  }

  async transition(id: string, from: Status, to: Status): Promise<boolean> {
    const result = await sql()`
      UPDATE forms SET status = ${to}, updated_at = now()
      WHERE id = ${id} AND status = ${from}`;
    return result.count === 1;
  }

  // The status and the bound are read under a lock of the form's row, in
  // the transaction that adds the answer: a form closed meanwhile takes
  // nothing more, and two answers never pass the bound together.
  async respond(id: string, answers: Answers, max: number): Promise<"added" | "closed" | "full"> {
    return sql().begin(async tx => {
      const [row] = await tx<{ status: string }[]>`SELECT status FROM forms WHERE id = ${id} FOR UPDATE`;
      if (!row || row.status !== "published") return "closed" as const;
      const [counted] = await tx<{ n: string }[]>`SELECT count(*) AS n FROM responses WHERE form_id = ${id}`;
      if (Number(counted?.n ?? max) >= max) return "full" as const;
      await tx`INSERT INTO responses (form_id, answers) VALUES (${id}, ${tx.json(answers)})`;
      return "added" as const;
    });
  }

  async responses(id: string, limit: number): Promise<Response[]> {
    const [owner] = await sql()<{ fields: unknown }[]>`SELECT fields FROM forms WHERE id = ${id}`;
    if (!owner) return [];
    const fields = storedFields(owner.fields);
    const rows = await sql()<{ id: string; created_at: Date; answers: unknown }[]>`
      SELECT id, created_at, answers FROM responses WHERE form_id = ${id}
      ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
    return rows.map(r => ({ id: r.id, at: r.created_at.toISOString(), answers: storedAnswers(r.answers, fields) }));
  }
}

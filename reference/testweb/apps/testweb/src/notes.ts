import type { Sql } from "postgres";

// The notes of the team, in the tool's own PostgreSQL database — the
// capability database of its manifest —: its table is made by
// migrations/0001_notes.sql, which the Chest plays before the tool starts.
// They outlive a restart, a new version and the node's restart.
export const maxNotes = 100;
export const maxLength = 280;

export type Note = { id: number; text: string; author: string };

// noteText is the text of a note as a member may write it: a string, trimmed,
// of 1 to 280 characters, without control or format characters; null
// otherwise.
export function noteText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  const length = [...text].length;
  if (length < 1 || length > maxLength || /[\p{Cc}\p{Cf}]/u.test(text)) return null;
  return text;
}

// Where the notes are kept: the database, or a test's stand-in.
export interface NoteStore {
  list(): Promise<Note[]>;
  // add returns the new note, or null when the list is full.
  add(text: string, author: string): Promise<Note | null>;
  remove(id: number): Promise<boolean>;
  // forget anonymises the notes of an author whose data was erased: their
  // identifier gives way to "erased"; how many notes it changed.
  forget(author: string): Promise<number>;
}

// PostgresNotes keeps the notes in the table notes of the tool's database,
// by parameterised queries only.
export class PostgresNotes implements NoteStore {
  readonly #sql: Sql;
  constructor(sql: Sql) { this.#sql = sql; }
  async list(): Promise<Note[]> {
    const rows = await this.#sql<Note[]>`SELECT id, text, author FROM notes ORDER BY id`;
    return rows.map(({ id, text, author }) => ({ id, text, author }));
  }
  async add(text: string, author: string): Promise<Note | null> {
    const rows = await this.#sql<Note[]>`INSERT INTO notes (text, author) SELECT ${text}, ${author} WHERE (SELECT count(*) FROM notes) < ${maxNotes} RETURNING id, text, author`;
    const note = rows[0];
    return note ? { id: note.id, text: note.text, author: note.author } : null;
  }
  async remove(id: number): Promise<boolean> {
    return (await this.#sql`DELETE FROM notes WHERE id = ${id}`).count > 0;
  }
  async forget(author: string): Promise<number> {
    return (await this.#sql`UPDATE notes SET author = 'erased' WHERE author = ${author}`).count;
  }
}

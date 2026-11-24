import type { Sql } from "postgres";
import { noteText } from "./notes.js";

// The chat of the test bench: rooms a member joins — rows of chat_members,
// the membership table of the live channel room:{id} —, and messages
// written in chat_messages, the feed of that channel. The tool keeps no
// socket: the Chest holds the members' pages and tells them each row at its
// commit (chest.json, "realtime"); the tool only writes.
export type ChatMessage = { id: number; room: number; author: string; text: string };

// The most messages a room shows at once.
export const pageSize = 50;

// chatText is a message as a member may write it: a note's rules.
export const chatText = noteText;

// Where the chat is kept: the database, or a test's stand-in.
export interface Chat {
  join(room: number, member: string): Promise<void>;
  // leave takes the member out of the room: its row goes, and the Chest
  // takes their pages out of the channel at once.
  leave(room: number, member: string): Promise<void>;
  // members are those in a room.
  members(room: number): Promise<string[]>;
  // messages are a room's after a message, oldest first, pageSize at most;
  // null for a member who is not in the room.
  messages(room: number, member: string, after: number): Promise<ChatMessage[] | null>;
  // post writes a message of a member in a room they are in; null otherwise.
  post(room: number, author: string, text: string): Promise<ChatMessage | null>;
  // forget anonymises the messages of an author whose data was erased.
  forget(author: string): Promise<number>;
}

// PostgresChat keeps the chat in the tool's database, by parameterised
// queries only.
export class PostgresChat implements Chat {
  readonly #sql: Sql;
  constructor(sql: Sql) { this.#sql = sql; }
  async join(room: number, member: string): Promise<void> {
    await this.#sql`INSERT INTO chat_members (room, member_id) VALUES (${room}, ${member}) ON CONFLICT DO NOTHING`;
  }
  async leave(room: number, member: string): Promise<void> {
    await this.#sql`DELETE FROM chat_members WHERE room = ${room} AND member_id = ${member}`;
  }
  async members(room: number): Promise<string[]> {
    return (await this.#sql<{ member_id: string }[]>`SELECT member_id FROM chat_members WHERE room = ${room} ORDER BY member_id`).map(r => r.member_id);
  }
  async messages(room: number, member: string, after: number): Promise<ChatMessage[] | null> {
    const [inRoom] = await this.#sql`SELECT 1 FROM chat_members WHERE room = ${room} AND member_id = ${member}`;
    if (!inRoom) return null;
    const rows = await this.#sql<ChatMessage[]>`SELECT id, room, author, text FROM chat_messages WHERE room = ${room} AND id > ${after} ORDER BY id LIMIT ${pageSize}`;
    return rows.map(({ id, room, author, text }) => ({ id, room, author, text }));
  }
  async post(room: number, author: string, text: string): Promise<ChatMessage | null> {
    const rows = await this.#sql<ChatMessage[]>`INSERT INTO chat_messages (room, author, text) SELECT ${room}, ${author}, ${text} WHERE EXISTS (SELECT 1 FROM chat_members WHERE room = ${room} AND member_id = ${author}) RETURNING id, room, author, text`;
    const message = rows[0];
    return message ? { id: message.id, room: message.room, author: message.author, text: message.text } : null;
  }
  async forget(author: string): Promise<number> {
    await this.#sql`DELETE FROM chat_members WHERE member_id = ${author}`;
    return (await this.#sql`UPDATE chat_messages SET author = 'erased' WHERE author = ${author}`).count;
  }
}

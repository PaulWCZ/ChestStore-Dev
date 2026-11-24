import type { IncomingMessage } from "node:http";
import * as events from "../../../packages/chest-client/src/events.js";
import type { ChestEvent, ToolEvent } from "../../../packages/chest-client/src/events.js";
import type { Chat } from "./chat.js";
import type { Note, NoteStore } from "./notes.js";

// What the Chest tells the tool, through the SDK's events.ts on POST
// /chest-events: its members' lifecycle ("receives": ["member.*"]) and the
// notes another installation of the bench adds ("note.added", which it
// emits too — the Chest never tells a tool its own events). Each event is
// handled once (the SDK's store of seen ids, in memory), kept in a list the
// laboratory's proof reads; member.erased has the notes and the chat
// messages of that person anonymised, then acknowledged to the Chest. hold
// makes every delivery answer 503 — the proof's way to see the Chest deliver
// the same event again —, the refused ones kept apart. Nothing of it
// outlives the process: the Chest delivers again what it did not see
// accepted.
// changed: what member.updated says changed; source: the tool that told a
// note, audience: who among this tool's members may see it.
export type Received = { id: string; type: ChestEvent["type"] | "note.added"; member: string; at: string; changed?: string[]; source?: string; audience?: "all" | string[] };
export type LifecycleView = { events: Received[]; refused: string[]; held: boolean };

export interface Lifecycle {
  // receive answers one delivery: the status for the Chest.
  receive(request: IncomingMessage): Promise<number>;
  // tell tells the other tools a note was added: how many it was written
  // for.
  tell(note: Note): Promise<number>;
  view(): LifecycleView;
  hold(held: boolean): void;
}

// The events kept, the most recent last: enough for the proofs.
const kept = 100;

export class ChestLifecycle implements Lifecycle {
  readonly #notes: NoteStore;
  readonly #chat: Chat;
  readonly #seen = events.memorySeen();
  readonly #received: Received[] = [];
  readonly #refused: string[] = [];
  #held = false;
  constructor(notes: NoteStore, chat: Chat) {
    this.#notes = notes;
    this.#chat = chat;
  }

  async receive(request: IncomingMessage): Promise<number> {
    if (this.#held) {
      const event = await events.verify(request);
      if (!event) return 401;
      this.#refused.push(event.id);
      this.#refused.splice(0, this.#refused.length - kept);
      return 503;
    }
    const record = (event: ChestEvent): void => {
      this.#received.push({ id: event.id, type: event.type, member: event.data.id, at: event.occurredAt, ...(event.type === "member.updated" ? { changed: [...event.data.changed] } : {}) });
      this.#received.splice(0, this.#received.length - kept);
    };
    return events.handle(request, {
      "member.updated": record,
      "access.revoked": record,
      "member.removed": record,
      "note.added": (event: ToolEvent) => {
        this.#received.push({ id: event.id, type: "note.added", member: String(event.data["author"]), at: event.occurredAt, source: event.source, audience: event.audience });
        this.#received.splice(0, this.#received.length - kept);
      },
      "member.erased": async event => {
        await this.#notes.forget(event.data.id);
        await this.#chat.forget(event.data.id);
        await events.acknowledgeErasure(event.data.erasure);
        record(event);
      },
    }, { seen: this.#seen });
  }

  async tell(note: Note): Promise<number> {
    const { receivers } = await events.emit("note.added", { note: String(note.id), author: note.author, text: note.text }, { subject: String(note.id), key: `note:${note.id}` });
    return receivers;
  }

  view(): LifecycleView { return { events: this.#received.map(e => ({ ...e, ...(e.changed ? { changed: [...e.changed] } : {}) })), refused: [...this.#refused], held: this.#held }; }

  hold(held: boolean): void { this.#held = held; }
}

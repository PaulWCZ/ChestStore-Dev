import type { IncomingMessage } from "node:http";
import * as events from "../../../packages/chest-client/src/events.js";
import type { ChestEvent } from "../../../packages/chest-client/src/events.js";
import type { NoteStore } from "./notes.js";

// What the Chest tells the tool of its members' lifecycle ("receives":
// ["member.*"]), through the SDK's events.ts on POST /chest-events: each
// event handled once (the SDK's store of seen ids, in memory), kept in a
// list the laboratory's proof reads; member.erased has the notes of that
// person anonymised, then acknowledged to the Chest. hold makes every
// delivery answer 503 — the proof's way to see the Chest deliver the same
// event again —, the refused ones kept apart. Nothing of it outlives the
// process: the Chest delivers again what it did not see accepted.
// changed: what member.updated says changed.
export type Received = { id: string; type: ChestEvent["type"]; member: string; at: string; changed?: string[] };
export type LifecycleView = { events: Received[]; refused: string[]; held: boolean };

export interface Lifecycle {
  // receive answers one delivery: the status for the Chest.
  receive(request: IncomingMessage): Promise<number>;
  view(): LifecycleView;
  hold(held: boolean): void;
}

// The events kept, the most recent last: enough for the proofs.
const kept = 100;

export class ChestLifecycle implements Lifecycle {
  readonly #notes: NoteStore;
  readonly #seen = events.memorySeen();
  readonly #received: Received[] = [];
  readonly #refused: string[] = [];
  #held = false;
  constructor(notes: NoteStore) { this.#notes = notes; }

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
      "member.erased": async event => {
        await this.#notes.forget(event.data.id);
        await events.acknowledgeErasure(event.data.erasure);
        record(event);
      },
    }, { seen: this.#seen });
  }

  view(): LifecycleView { return { events: this.#received.map(e => ({ ...e, ...(e.changed ? { changed: [...e.changed] } : {}) })), refused: [...this.#refused], held: this.#held }; }

  hold(held: boolean): void { this.#held = held; }
}

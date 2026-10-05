import type { IncomingMessage } from "node:http";
import * as schedules from "../../../packages/chest-client/src/schedules.js";
import type { Run } from "../../../packages/chest-client/src/schedules.js";

// What the tool does by itself ("schedules" in chest.json): the Chest posts
// each run to POST /chest-schedules, the SDK's schedules.ts verifies it and
// hands it to the handler of its schedule, once (its store of seen runs, in
// memory). The bench's only schedule, morning, keeps the run in a list the
// laboratory's proof reads — it is how a run woke the tool. Nothing of it
// outlives the process.
export type Ran = Run & { at: string };

export interface Schedules {
  // receive answers one run: the status for the Chest.
  receive(request: IncomingMessage): Promise<number>;
  view(): { runs: Ran[] };
}

// The runs kept, the most recent last: enough for the proofs.
const kept = 100;

export class ChestSchedules implements Schedules {
  readonly #runs: Ran[] = [];

  receive(request: IncomingMessage): Promise<number> {
    return schedules.handle(request, {
      morning: run => {
        this.#runs.push({ ...run, at: new Date().toISOString() });
        this.#runs.splice(0, this.#runs.length - kept);
      },
    });
  }

  view(): { runs: Ran[] } { return { runs: this.#runs.map(r => ({ ...r })) }; }
}

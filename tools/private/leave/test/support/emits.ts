import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeEmits } from "@argentic/chest-sdk/testing";

// What Leave's chest.json declares it emits, as the fake Chest checks each
// event against it (fakeChest({ emits })).
export const declaredEmits: Record<string, FakeEmits> = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "chest.json"), "utf8")).emits;

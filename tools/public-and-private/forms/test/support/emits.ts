import { readFileSync } from "node:fs";
import type { FakeEmits } from "@argentic/chest-sdk/testing";

// What Forms declares it tells (chest.json "emits"): the fake Chest checks
// each event's data against it, as the Chest does (SDK 0.7.0).
export const emits = (JSON.parse(readFileSync(new URL("../../chest.json", import.meta.url), "utf8")) as { emits: Record<string, FakeEmits> }).emits;

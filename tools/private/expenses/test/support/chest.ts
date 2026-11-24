import { readFileSync } from "node:fs";
import type { FakeChestOptions } from "@argentic/chest-sdk/testing";

// What the tool's chest.json gives a fake Chest: its capabilities (sealed
// and realtime among them), its roles (whom a sealed IBAN opens for), its
// realtime channels and feeds.
const manifest = JSON.parse(readFileSync(new URL("../../chest.json", import.meta.url), "utf8")) as { capabilities: string[]; roles: string[]; realtime: FakeChestOptions["realtime"] };
export const tool: Pick<FakeChestOptions, "capabilities" | "roles" | "realtime"> = { capabilities: manifest.capabilities, roles: manifest.roles, realtime: manifest.realtime };

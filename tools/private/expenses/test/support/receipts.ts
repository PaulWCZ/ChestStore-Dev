import type { FakeChest } from "@argentic/chest-sdk/testing";
import type { Member } from "@argentic/chest-sdk/member";
import type { Sql } from "../../src/lib/db.ts";
import { grant, inspect, type ReceiptFile } from "../../src/lib/receipts.ts";

// A receipt as a member's browser sends it: authorised, PUT to the fake
// Chest's front, then inspected as the save does.
export async function upload(chest: FakeChest, sql: Sql, actor: Member, bytes: Uint8Array | string = "%PDF-1.4 receipt " + Math.random(), type = "application/pdf"): Promise<ReceiptFile> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const up = await grant(sql, actor, { type, size: data.length });
  const response = await chest.upload(up.url, data, type);
  if (response.status !== 201) throw new Error("upload refused: " + response.status);
  return inspect(sql, actor, up.object);
}

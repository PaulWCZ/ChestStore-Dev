import { randomBytes } from "node:crypto";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Sql } from "./db.ts";
import { limits, receiptExtension, receiptTypes } from "../shared/model.ts";

// Receipts go from the member's browser to the Chest's files directly: the
// tool names the object and authorises that one upload, the browser sends
// it, and the expense records it once the Chest holds it. The file is kept
// as it came (never changed, its SHA-256 recorded): a faithful copy of the
// paper receipt.

export const objectPattern = /^receipts\/\d{4}-\d{2}\/[0-9a-f]{24}\.(jpg|png|webp|heic|heif|pdf)$/u;

// grant authorises one upload of a receipt of that type and size for the
// member, for 10 minutes. Uploads a member never used go after a day.
export async function grant(sql: Sql, actor: Member | null, input: { type?: unknown; size?: unknown }, now = new Date()): Promise<{ url: string; method: string; object: string }> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const type = input.type;
  if (typeof type !== "string" || !(receiptTypes as readonly string[]).includes(type)) throw new AppError("file_type");
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size < 1) throw new AppError("invalid");
  if (input.size > limits.receiptSize) throw new AppError("file_too_large", { max: limits.receiptSize >> 20 });
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from uploads where member_id = ${actor.id} and created_at > now() - interval '1 hour'`;
  const n = counted?.n ?? 0;
  if (n >= 60) throw new AppError("too_many", { max: 60 });
  const object = `receipts/${now.toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}.${receiptExtension[type]}`;
  const up = await files.uploadUrl(object, { maxSize: limits.receiptSize, types: [type], expiresIn: 600 });
  await sql`insert into uploads (object, member_id) values (${object}, ${actor.id})`;
  return { url: up.url, method: up.method, object };
}

export type ReceiptFile = { object: string; type: string; size: number; sha256: string };

// inspect checks that a receipt the member was allowed to upload arrived,
// with its SHA-256 as the Chest took it (FileObject.sha256): the file is
// never read into the tool's memory.
export async function inspect(sql: Sql, actor: Member, object: unknown): Promise<ReceiptFile> {
  if (typeof object !== "string" || !objectPattern.test(object)) throw new AppError("file_missing");
  const [mine] = await sql`select 1 from uploads where object = ${object} and member_id = ${actor.id}`;
  if (!mine) throw new AppError("file_missing");
  const info = await files.stat(object);
  if (!info) throw new AppError("file_missing");
  if (!(receiptTypes as readonly string[]).includes(info.type)) throw new AppError("file_type");
  if (info.size > limits.receiptSize) throw new AppError("file_too_large", { max: limits.receiptSize >> 20 });
  return { object, type: info.type, size: info.size, sha256: info.sha256 };
}

// forget deletes objects no expense holds any more; a file the Chest
// cannot delete now stays (it holds no one's data the tool shows).
export async function forget(objects: Iterable<string>): Promise<void> {
  for (const object of objects) await files.delete(object).catch(() => false);
}

// cleanUploads forgets the uploads authorised more than a day ago and never
// put on an expense.
export async function cleanUploads(sql: Sql, memberId?: string): Promise<number> {
  const gone = await sql<{ object: string }[]>`
    delete from uploads where created_at < now() - interval '1 day' ${memberId ? sql`and member_id = ${memberId}` : sql``} returning object`;
  await forget(gone.map(g => g.object));
  return gone.length;
}

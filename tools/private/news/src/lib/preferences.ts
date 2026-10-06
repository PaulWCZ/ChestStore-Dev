import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "../core/tool.ts";

// Each person's choice: the weekly digest by email as well as in the bell
// (on unless they turn it off). Important posts always go by email: they
// are the all-staff email News replaces.
export async function digestEmail(sql: Sql, actor: Member | null): Promise<boolean> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const [row] = await sql<{ digest_email: boolean }[]>`select digest_email from preferences where member = ${actor.id}`;
  return row?.digest_email ?? true;
}

export async function setDigestEmail(sql: Sql, actor: Member | null, on: unknown): Promise<void> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await sql`insert into preferences (member, digest_email) values (${actor.id}, ${on}) on conflict (member) do update set digest_email = excluded.digest_email`;
}

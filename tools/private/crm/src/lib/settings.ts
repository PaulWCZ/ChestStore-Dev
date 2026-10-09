import type { Member } from "@argentic/chest-sdk/member";
import { can, roleOf } from "./access.ts";
import type { Query } from "./db.ts";
import { AppError } from "./errors.ts";

// The team's settings a manager chooses (migrations/0008, table settings).
// "export": who may download the lists — companies, contacts, deals as
// files (a whole client base leaves with them): the managers, the managers
// and sales (the default), or everyone with a role. The whole book's ZIP
// stays the managers'; one person's vCard and their own data (GDPR) stay
// open to whoever reads them.
export const exportChoices = ["managers", "sales", "everyone"] as const;
export type ExportChoice = (typeof exportChoices)[number];

export async function exportSetting(sql: Query): Promise<ExportChoice> {
  const [row] = await sql<{ value: string }[]>`select value from settings where key = 'export'`;
  return (exportChoices as readonly string[]).includes(row?.value ?? "") ? row!.value as ExportChoice : "sales";
}

export function mayExport(actor: Member | null, setting: ExportChoice): boolean {
  const role = roleOf(actor);
  if (role === null) return false;
  return setting === "everyone" || role === "manager" || (setting === "sales" && role === "sales");
}

// Refuses a download of a list to whoever the setting leaves out.
export async function checkExport(sql: Query, actor: Member | null): Promise<void> {
  if (!mayExport(actor, await exportSetting(sql))) throw new AppError("forbidden");
}

export async function setExport(sql: Query, actor: Member | null, value: ExportChoice): Promise<void> {
  if (!can(actor, "stages")) throw new AppError("forbidden");
  await sql`insert into settings (key, value) values ('export', ${value}) on conflict (key) do update set value = excluded.value`;
}

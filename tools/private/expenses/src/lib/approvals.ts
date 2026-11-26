import type { Query } from "./db.ts";
import { accountants, mayApprove } from "./people.ts";
import { approverMap, approverOf } from "./settings.ts";

// Who approves whose expenses, as the Chest's roles and the accountant's
// table say now. Nobody approves their own (lib/access.ts): an accountant's
// own expenses go to the approver named for them, or else to the other
// accountants; a company with one accountant and nobody named for them has
// nobody to approve them, and the pages say so until someone is named.

// approversFor: who may approve this member's expenses sent now.
export async function approversFor(sql: Query, member: string, known?: { accountants?: string[] }): Promise<string[]> {
  const named = await approverOf(sql, member);
  if (named !== null && named !== member && (await mayApprove(named))) return [named];
  return (known?.accountants ?? (await accountants())).filter(a => a !== member);
}

// alone: the accountants whose own expenses nobody may approve (no other
// accountant, nobody named for them who may still approve).
export async function alone(sql: Query): Promise<string[]> {
  const list = await accountants();
  if (list.length === 0) return [];
  const named = await approverMap(sql);
  const out: string[] = [];
  for (const a of list) {
    if (list.some(b => b !== a)) continue;
    const approver = named.get(a);
    if (approver && approver !== a && (await mayApprove(approver))) continue;
    out.push(a);
  }
  return out;
}

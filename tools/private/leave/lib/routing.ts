import { canBeApprover } from "./access.ts";
import type { DirectoryPerson } from "./directory.ts";

// Who answers a person's requests, given who has the tool now: the
// approver HR named, while they still have a role that answers requests;
// otherwise the HR people (not the person themselves — unless they are the
// only HR person). Pure: the directory is read by the caller.
export function answerers(person: { memberId: string; approverId: string | null }, directory: readonly Pick<DirectoryPerson, "id" | "role">[]): string[] {
  if (person.approverId !== null && person.approverId !== person.memberId) {
    const approver = directory.find(p => p.id === person.approverId);
    if (approver && canBeApprover(approver.role)) return [approver.id];
  }
  const hr = directory.filter(p => p.role === "hr").map(p => p.id);
  const others = hr.filter(h => h !== person.memberId);
  return others.length > 0 ? others : hr;
}

// counts: how many open requests wait for each answerer.
export function counts(open: readonly { memberId: string; approverId: string | null }[], directory: readonly Pick<DirectoryPerson, "id" | "role">[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const r of open) for (const a of answerers(r, directory)) found.set(a, (found.get(a) ?? 0) + 1);
  return found;
}

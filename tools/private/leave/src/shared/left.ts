// Safe in the browser: no SDK here.
// The one "days left" of a balance, the same on every screen: what the
// person may still take, approved leave (past and to come) already
// deducted. Days waiting for an answer are shown beside it, never taken
// off it.

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const daysLeft = (b: { left: number }): number => b.left;

// What would be left if every waiting request of the kind were approved.
export const leftIfApproved = (b: { left: number; pending: number }): number => round2(b.left - b.pending);

// The balance after a waiting request, for whoever answers it: what is
// left, less this request and the person's other waiting requests of the
// same kind that come before it (by first day, then the order asked) —
// those are answered first in the list. `others` counts the ones after it.
export function afterRequest(left: number, waiting: readonly { id: string; start: string; days: number }[], r: { id: string; start: string }): { after: number; before: number; others: number } {
  const first = (x: { id: string; start: string }) => x.start < r.start || (x.start === r.start && Number(x.id) <= Number(r.id));
  const ahead = waiting.filter(first);
  const taken = ahead.reduce((a, x) => a + x.days, 0);
  return { after: round2(left - taken), before: ahead.filter(x => x.id !== r.id).length, others: waiting.length - ahead.length };
}

"use client";

import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { removeSubscriber } from "../actions.ts";

// The subscribers, for the rare removal someone asks for by phone or
// email (they can always unsubscribe themselves from any email).
export type SubscriberRow = { id: string; email: string; pending: boolean; follows: string; since: string };

export function SubscriberList({ rows, t }: { rows: SubscriberRow[]; t: { subscribers: Record<string, string>; errors: Record<ErrorCode, string> } }) {
  const w = t.subscribers;
  const { run, pending } = useRun(t.errors);
  return (
    <ul className="rows card subscribers">
      {rows.map(r => (
        <li key={r.id} className="subscriber">
          <div>
            <strong className="email">{r.email}</strong>
            <p className="muted small">{r.pending ? w.pending : format(w.follows!, { list: r.follows })} · {r.since}</p>
          </div>
          <button type="button" className="button small quiet" disabled={pending} onClick={() => run(() => removeSubscriber(r.id), w.removed)}>{w.remove}</button>
        </li>
      ))}
    </ul>
  );
}

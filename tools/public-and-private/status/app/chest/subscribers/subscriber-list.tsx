"use client";

import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { removeSubscriber } from "../actions.ts";

// The subscribers, for the rare erasure someone asks for by phone or email
// (they can always unsubscribe themselves from any email). An address is
// personal data: erasing it is for good, so the kit's Confirm asks first.
export type SubscriberRow = { id: string; email: string; pending: boolean; follows: string; since: string };

export function SubscriberList({ rows, t }: { rows: SubscriberRow[]; t: { subscribers: Record<string, string>; errors: Record<ErrorCode, string> } }) {
  const w = t.subscribers;
  const { run, pending } = useRun(t.errors);
  const [erasing, setErasing] = useState<SubscriberRow | null>(null);
  return (
    <>
      <ul className="rows card subscribers">
        {rows.map(r => (
          <li key={r.id} className="subscriber">
            <div>
              <strong className="email">{r.email}</strong>
              <p className="muted small">{r.pending ? w.pending : format(w.follows!, { list: r.follows })} · {r.since}</p>
            </div>
            <button type="button" className="button small quiet" disabled={pending} aria-label={format(w.remove!, { email: r.email })} onClick={() => setErasing(r)}>{w.erase}</button>
          </li>
        ))}
      </ul>
      <Confirm
        open={erasing !== null}
        title={format(w.eraseTitle!, { email: erasing?.email ?? "" })}
        body={w.eraseBody!}
        confirmLabel={w.erase!}
        cancelLabel={w.cancel!}
        busy={pending}
        onCancel={() => setErasing(null)}
        onConfirm={() => { const r = erasing; if (r) void run(() => removeSubscriber(r.id), w.removed).then(() => setErasing(null)); }}
      />
    </>
  );
}

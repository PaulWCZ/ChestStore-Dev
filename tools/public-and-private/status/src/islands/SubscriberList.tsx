import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { useRun } from "../components/use-run.ts";
import type { ErrorCode } from "../lib/app-error.ts";
import { format } from "../components/format.ts";

// The subscribers, for the rare erasure someone asks for by phone or email
// (they can always unsubscribe themselves from any email). An address is
// personal data: erasing it is for good, so the kit's Confirm asks first.
export type SubscriberRow = { id: string; email: string; pending: boolean; follows: string; since: string };

export function SubscriberList({ rows, t }: { rows: SubscriberRow[]; t: { subscribers: Record<string, string>; errors: Record<ErrorCode, string> } }) {
  const w = t.subscribers;
  const { run, pending } = useRun();
  const [erasing, setErasing] = useState<SubscriberRow | null>(null);
  return (
    <>
      <ul className="rows card">
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
        onConfirm={() => { const r = erasing; if (r) void run("removeSubscriber", { subscriberId: r.id }, w.removed).then(() => setErasing(null)); }}
      />
    </>
  );
}

// Subscriptions in a chat or at a web address (Proposal (studio):
// webhooks): where, in which language, what they follow, whether the
// Chest delivers. Removing one makes the Chest forget the address — for
// good: the Confirm asks first.
export type HookRow = { id: string; shown: string; line: string; state: string; stopped: boolean };

export function HookList({ rows, t }: { rows: HookRow[]; t: { subscribers: Record<string, string>; errors: Record<ErrorCode, string> } }) {
  const w = t.subscribers;
  const { run, pending } = useRun();
  const [removing, setRemoving] = useState<HookRow | null>(null);
  return (
    <>
      <ul className="rows card">
        {rows.map(r => (
          <li key={r.id} className="subscriber">
            <div>
              <strong className="email">{r.shown}</strong>
              <p className="muted small">{r.line}</p>
              <p className={`small${r.stopped ? " error" : " muted"}`}>{r.state}</p>
            </div>
            <button type="button" className="button small quiet" disabled={pending} aria-label={format(w.hookRemoveLabel!, { address: r.shown })} onClick={() => setRemoving(r)}>{w.hookRemove}</button>
          </li>
        ))}
      </ul>
      <Confirm
        open={removing !== null}
        title={format(w.hookRemoveLabel!, { address: removing?.shown ?? "" })}
        body={w.hookRemoved!}
        confirmLabel={w.hookRemove!}
        cancelLabel={w.cancel!}
        busy={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { const r = removing; if (r) void run("removeHook", { hookId: r.id }, w.hookRemoved).then(() => setRemoving(null)); }}
      />
    </>
  );
}

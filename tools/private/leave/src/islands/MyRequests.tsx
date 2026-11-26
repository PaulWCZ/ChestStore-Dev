import { call, toast } from "@argentic/chest-app/client";
import { StatusBadge } from "@argentic/chest-ui/components";
import { useState } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { toneOf } from "../shared/status.ts";

export type RequestRow = {
  id: string;
  type: string;
  color: string;
  when: string;
  days: string;
  status: "pending" | "approved" | "refused" | "cancelled" | "cancelAsked" | "declared";
  upcoming: boolean;
  canCancel: boolean;
  canAskCancel: boolean;
  reason: string;
  start: string;
};

type Words = { home: Catalogue["home"]; status: Catalogue["status"] };

// My requests: coming up first, then earlier ones. Cancelling a waiting
// request is immediate, with "Undo" (the kit's toast says whether it
// worked); an approved one is asked to the approver (their bell is told:
// the toast offers no Undo). A refusal is a toast in the reader's words.
export function MyRequests({ rows, t }: { rows: readonly RequestRow[]; t: Words }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const show = (id: string) => setHidden(h => { const n = new Set(h); n.delete(id); return n; });

  async function cancel(row: RequestRow) {
    setBusy(row.id);
    if (row.canCancel) setHidden(h => new Set(h).add(row.id));
    const result = await call("cancelLeave", { id: row.id });
    setBusy(null);
    if (!result.ok) return show(row.id);
    if (result.value === "cancelled") {
      toast({
        id: `cancel-${row.id}`,
        text: t.home.cancelled,
        undo: async () => {
          const back = await call("restoreLeave", { id: row.id }, { quiet: true });
          if (!back.ok) return back.message;
          show(row.id);
          return true;
        },
      });
    } else toast({ id: `cancel-${row.id}`, text: t.home.cancelAsked, sent: true });
  }

  // The next leave first; earlier ones, the latest first (as they come).
  const upcoming = rows.filter(r => r.upcoming).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : Number(a.id) - Number(b.id)));
  const earlier = rows.filter(r => !r.upcoming).slice(0, 12);
  const list = (items: readonly RequestRow[]) => (
    <ul className="requests">
      {items.map(r => (
        <li key={r.id} id={`request-${r.id}`} className={`request${hidden.has(r.id) ? " gone" : ""}`} data-start={r.start}>
          <span className={`kind k-${r.color}`}>{r.type}</span>
          <span className="request-when">
            <a href={`/chest/requests/${r.id}`}>{r.when}</a>
            <span className="muted">{r.days}</span>
            {r.reason && (r.status === "refused" || r.status === "cancelled") && <span className="muted request-reason">“{r.reason}”</span>}
          </span>
          <StatusBadge tone={hidden.has(r.id) ? "neutral" : toneOf(r.status)} label={hidden.has(r.id) ? t.status.cancelled : t.status[r.status]} size="s" />
          {(r.canCancel || r.canAskCancel) && !hidden.has(r.id) && (
            <button type="button" className="button quiet small" disabled={busy === r.id} onClick={() => void cancel(r)}>
              {r.canCancel ? t.home.cancel : t.home.askCancel}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {upcoming.length > 0 && (<><h3 className="sub-title">{t.home.upcoming}</h3>{list(upcoming)}</>)}
      {earlier.length > 0 && (<><h3 className="sub-title">{t.home.past}</h3>{list(earlier)}</>)}
    </>
  );
}

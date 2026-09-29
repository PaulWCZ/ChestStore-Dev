"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../components/toast.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { cancelLeave, restoreLeave } from "./actions.ts";

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

type Words = { home: Catalogue["home"]; status: Catalogue["status"]; errors: Catalogue["errors"] };

// My requests: coming up first, then earlier ones. Cancelling a waiting
// request is immediate, with "Undo"; an approved one is asked to the
// approver.
export function MyRequests({ rows, t }: { rows: RequestRow[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const fail = (error: keyof Words["errors"], values?: Record<string, string | number>) => toast(format(t.errors[error], values));

  function cancel(row: RequestRow) {
    setBusy(row.id);
    start(async () => {
      if (row.canCancel) setHidden(h => new Set(h).add(row.id));
      const result = await cancelLeave(row.id);
      setBusy(null);
      if (!result.ok) {
        setHidden(h => { const n = new Set(h); n.delete(row.id); return n; });
        fail(result.error, result.values);
        return;
      }
      if (result.value === "cancelled") {
        toast(t.home.cancelled, {
          label: t.home.undo,
          run: () => start(async () => {
            const back = await restoreLeave(row.id);
            if (!back.ok) fail(back.error, back.values);
            setHidden(h => { const n = new Set(h); n.delete(row.id); return n; });
            router.refresh();
          }),
        });
      } else toast(t.home.cancelAsked);
      router.refresh();
    });
  }

  // The next leave first; earlier ones, the latest first (as they come).
  const upcoming = rows.filter(r => r.upcoming).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : Number(a.id) - Number(b.id)));
  const earlier = rows.filter(r => !r.upcoming).slice(0, 12);
  const list = (items: RequestRow[]) => (
    <ul className="requests">
      {items.map(r => (
        <li key={r.id} className={`request${hidden.has(r.id) ? " gone" : ""}`}>
          <span className={`kind k-${r.color}`}>{r.type}</span>
          <span className="request-when">
            <Link href={`/chest/requests/${r.id}`}>{r.when}</Link>
            <span className="muted">{r.days}</span>
            {r.reason && (r.status === "refused" || r.status === "cancelled") && <span className="muted request-reason">“{r.reason}”</span>}
          </span>
          <span className={`status s-${r.status}`}>{hidden.has(r.id) ? t.status.cancelled : t.status[r.status]}</span>
          {(r.canCancel || r.canAskCancel) && !hidden.has(r.id) && (
            <button type="button" className="button quiet small" disabled={busy === r.id} onClick={() => cancel(r)}>
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

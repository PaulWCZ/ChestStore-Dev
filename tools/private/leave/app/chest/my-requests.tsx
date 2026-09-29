"use client";

import { StatusBadge, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { toneOf } from "../../lib/status.ts";
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
// request is immediate, with "Undo" (the kit's toast says whether it
// worked); an approved one is asked to the approver (their bell is told:
// the toast offers no Undo).
export function MyRequests({ rows, t }: { rows: RequestRow[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const fail = (error: keyof Words["errors"], values?: Record<string, string | number>) => toast({ text: format(t.errors[error], values), tone: "error" });
  const show = (id: string) => setHidden(h => { const n = new Set(h); n.delete(id); return n; });

  function cancel(row: RequestRow) {
    setBusy(row.id);
    start(async () => {
      if (row.canCancel) setHidden(h => new Set(h).add(row.id));
      const result = await cancelLeave(row.id);
      setBusy(null);
      if (!result.ok) {
        show(row.id);
        fail(result.error, result.values);
        return;
      }
      if (result.value === "cancelled") {
        toast({
          id: `cancel-${row.id}`,
          text: t.home.cancelled,
          undo: async () => {
            const back = await restoreLeave(row.id);
            router.refresh();
            if (!back.ok) return format(t.errors[back.error], back.values);
            show(row.id);
            return true;
          },
        });
      } else toast({ id: `cancel-${row.id}`, text: t.home.cancelAsked, sent: true });
      router.refresh();
    });
  }

  // The next leave first; earlier ones, the latest first (as they come).
  const upcoming = rows.filter(r => r.upcoming).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : Number(a.id) - Number(b.id)));
  const earlier = rows.filter(r => !r.upcoming).slice(0, 12);
  const list = (items: RequestRow[]) => (
    <ul className="requests">
      {items.map(r => (
        <li key={r.id} className={`request${hidden.has(r.id) ? " gone" : ""}`} data-start={r.start}>
          <span className={`kind k-${r.color}`}>{r.type}</span>
          <span className="request-when">
            <Link href={`/chest/requests/${r.id}`}>{r.when}</Link>
            <span className="muted">{r.days}</span>
            {r.reason && (r.status === "refused" || r.status === "cancelled") && <span className="muted request-reason">“{r.reason}”</span>}
          </span>
          <StatusBadge tone={hidden.has(r.id) ? "neutral" : toneOf(r.status)} label={hidden.has(r.id) ? t.status.cancelled : t.status[r.status]} size="s" />
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

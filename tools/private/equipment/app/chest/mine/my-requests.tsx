"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { StatusStamp } from "../../../components/bits.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { cancelRequest } from "../actions.ts";

type Words = { requests: Catalogue["requests"]; errors: Catalogue["errors"] };
export type MyRequest = { id: string; body: string; status: "open" | "approved" | "refused" | "done" | "cancelled"; when: string; answer: string | null; kind: string | null };

// What I asked for, and where it stands; a request still waiting can be
// cancelled.
export function MyRequests({ requests, t }: { requests: MyRequest[]; t: Words }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const w = t.requests;
  return (
    <ul className="plain requests">
      {requests.map(r => (
        <li key={r.id} className="request">
          <div className="request-head">
            <StatusStamp status={r.status} text={w.status[r.status]} />
            <span className="small muted">{r.kind ? `${r.kind} · ` : ""}{r.when}</span>
          </div>
          <p className="quote">{r.body}</p>
          {r.answer && <p className="small">{format(w.answer, { text: r.answer })}</p>}
          {(r.status === "open" || r.status === "approved") && (
            <div><button type="button" className="button link small" disabled={pending} onClick={() => start(async () => {
              const x = await cancelRequest(r.id);
              if (!x.ok) return void toast({ text: format(t.errors[x.error], x.values), tone: "error" });
              toast(w.cancelled);
              router.refresh();
            })}>{w.cancel}</button></div>
          )}
        </li>
      ))}
    </ul>
  );
}

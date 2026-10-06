import { call, navigate, toast } from "@argentic/chest-app/client";
import { useTransition } from "react";
import { StatusStamp } from "../components/bits.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";

type Words = { requests: Catalogue["requests"] };
export type MyRequest = { id: string; body: string; status: "open" | "approved" | "refused" | "done" | "cancelled"; when: string; answer: string | null; kind: string | null };

// What I asked for, and where it stands; a request still waiting can be
// cancelled.
export function MyRequests({ requests, t }: { requests: MyRequest[]; t: Words }) {
  const [pending, start] = useTransition();
  const w = t.requests;
  return (
    <ul className="plain requests">
      {requests.map(r => (
        <li key={r.id} id={`request-${r.id}`} className="request">
          <div className="request-head">
            <StatusStamp status={r.status} text={w.status[r.status]} />
            <span className="small muted">{r.kind ? `${r.kind} · ` : ""}{r.when}</span>
          </div>
          <p className="quote">{r.body}</p>
          {r.answer && <p className="small">{format(w.answer, { text: r.answer })}</p>}
          {(r.status === "open" || r.status === "approved") && (
            <div><button type="button" className="button link small" disabled={pending} onClick={() => start(async () => {
              const x = await call("cancelRequest", { id: r.id });
              if (x.ok) toast(w.cancelled);
            })}>{w.cancel}</button></div>
          )}
        </li>
      ))}
    </ul>
  );
}

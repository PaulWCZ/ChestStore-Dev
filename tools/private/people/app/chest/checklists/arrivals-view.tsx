"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Trash, Wave } from "../../../components/icons.tsx";
import { Portrait } from "../../../components/portrait.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { linkArrival, removeArrival } from "../actions.ts";

// The arrivals another tool told of (Hiring): who is coming, when, as what;
// HR starts their arrival checklist, links them to the member they became,
// or removes them.
export type ArrivalView = {
  id: string; name: string; details: string; when: string; cancelled: boolean; checklists: number;
  suggested: string | null;
};
type Words = {
  arrivals: {
    fromHiring: string; cancelled: string; start: string; started: { one: string; other: string }; link: string; choose: string;
    linkButton: string; linked: string; remove: string; removed: string; suggestion: string; suggestionAction: string;
  };
  errors: Record<ErrorCode, string>;
};

export function ArrivalList({ arrivals, people, locale, t }: { arrivals: ArrivalView[]; people: { id: string; name: string }[]; locale: string; t: Words }) {
  return (
    <ul className="arrival-list">
      {arrivals.map(a => <ArrivalRow key={a.id} arrival={a} people={people} locale={locale} t={t} />)}
    </ul>
  );
}

function ArrivalRow({ arrival: a, people, locale, t }: { arrival: ArrivalView; people: { id: string; name: string }[]; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(a.suggested ?? "");
  const run = (step: () => Promise<{ ok: true } | { ok: false; error: ErrorCode; values?: Record<string, string | number> }>, done: string) => start(async () => {
    const r = await step();
    if (!r.ok) toast(format(t.errors[r.error], r.values ?? {}));
    else {
      toast(done);
      router.refresh();
    }
  });
  return (
    <li className={a.cancelled ? "arrival is-cancelled" : "arrival"}>
      <div className="arrival-id">
        <Portrait name={a.name} photo={null} size={52} />
        <div>
          <strong>{a.name}</strong>
          <span className="muted">{a.details}</span>
          <span className="row tags">
            <span className="source">{t.arrivals.fromHiring}</span>
            {a.cancelled ? <span className="due late">{t.arrivals.cancelled}</span> : <span className="small">{a.when}</span>}
            {a.checklists !== 0 && <span className="muted small">{plural(t.arrivals.started, a.checklists, locale)}</span>}
          </span>
        </div>
      </div>
      <div className="arrival-actions">
        {!a.cancelled && (
          <>
            {a.checklists === 0 && <Link className="button small" href={`/chest/checklists/new?arrival=${a.id}`}><Wave />{t.arrivals.start}</Link>}
            <div className="link-row">
              <label htmlFor={uid + "who"} className="label small">{t.arrivals.link}</label>
              <div className="row">
                <select id={uid + "who"} className="select" value={chosen} onChange={e => setChosen(e.target.value)}>
                  <option value="">{t.arrivals.choose}</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" className="button quiet small" disabled={!chosen || pending} onClick={() => run(() => linkArrival(a.id, chosen), t.arrivals.linked)}>{t.arrivals.linkButton}</button>
              </div>
            </div>
          </>
        )}
        {(a.cancelled || a.checklists === 0) && (
          <button type="button" className="button quiet small danger" disabled={pending} onClick={() => run(() => removeArrival(a.id), t.arrivals.removed)}><Trash />{t.arrivals.remove}</button>
        )}
      </div>
    </li>
  );
}

// "Nora Petit now has access. Is this the person hired through Hiring?" —
// offered to HR when a newcomer appears whose name matches an arrival.
export function LinkSuggestion({ arrivalId, memberId, name, t }: { arrivalId: string; memberId: string; name: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="banner suggest">
      <Wave />
      <span>{format(t.arrivals.suggestion, { name })}</span>
      <button type="button" className="button small" disabled={pending} onClick={() => start(async () => {
        const r = await linkArrival(arrivalId, memberId);
        if (!r.ok) toast(format(t.errors[r.error], r.values ?? {}));
        else {
          toast(t.arrivals.linked);
          router.refresh();
        }
      })}>{t.arrivals.suggestionAction}</button>
    </div>
  );
}

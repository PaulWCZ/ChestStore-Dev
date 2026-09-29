"use client";

import { Dialog, EmptyState, PageHeader, PeoplePicker, TimeSelect, useToast } from "@argentic/chest-ui/components";
import { localSearch } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Badge, Check, Plus } from "../../../components/icons.tsx";
import type { Result } from "../../../lib/errors.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatTime, plural } from "../../../lib/i18n/format.ts";
import { step } from "../../../lib/model.ts";
import { announceVisit, cancelVisit, restoreVisit, visitorArrived, visitorNotArrived } from "../actions.ts";

type Words = { visitors: Catalogue["visitors"]; errors: Catalogue["errors"]; dialog: Catalogue["dialog"]; peoplePicker: Catalogue["peoplePicker"] };
type Person = { id: string; name: string; photo: string | null };
export type VisitRow = { id: string; at: number; time: string; name: string; company: string; host: string; hostId: string; arrivedAt: string | null; mayArrive: boolean };

// The day's visitors, by time: who, from which company, to see whom, and —
// on their day — "Mark arrived", which tells the host. One obvious action:
// announce a visitor.
export function VisitorsView({ head, strip, officeId, day, dayLabel, isToday, past, defaultAt, reception, me, visits, people, locale, t }: {
  head: { title: string; intro: ReactNode; secondary?: ReactNode };
  strip: ReactNode;
  officeId: string;
  day: string;
  dayLabel: string;
  isToday: boolean;
  past: boolean;
  defaultAt: number;
  reception: boolean;
  me: Person;
  visits: VisitRow[];
  people: Person[];
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const w = t.visitors;
  const fail = (r: Extract<Result<unknown>, { ok: false }>) => void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
  const undone = (r: Result<unknown>) => (r.ok ? true : format(t.errors[r.error], r.values));
  const here = visits.filter(v => v.arrivedAt !== null).length;

  function arrived(v: VisitRow) {
    start(async () => {
      const r = await visitorArrived(v.id);
      if (!r.ok) return fail(r);
      toast({
        id: "visit-" + v.id,
        text: v.hostId === me.id ? format(w.arrivedToastSelf, { name: v.name }) : format(w.arrivedToast, { name: v.name, host: v.host }),
        undo: async () => {
          const back = await visitorNotArrived(v.id);
          router.refresh();
          return undone(back);
        },
      });
      router.refresh();
    });
  }
  function cancel(v: VisitRow) {
    start(async () => {
      const r = await cancelVisit(v.id);
      if (!r.ok) return fail(r);
      toast({
        id: "visit-" + v.id,
        text: format(w.cancelled, { name: v.name }),
        undo: async () => {
          const back = await restoreVisit(v.id);
          router.refresh();
          return undone(back);
        },
      });
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader title={head.title} intro={head.intro} secondary={head.secondary}
        action={<button type="button" className="button" disabled={past} onClick={() => { setDirty(false); setOpen(true); }}><Plus />{w.announce}</button>} />
      {strip}
      {!reception && <p className="hint">{w.onlyYours}</p>}
      {visits.length === 0 ? (
        <EmptyState icon={<Badge />} title={w.empty.title} body={w.empty.body} />
      ) : (
        <section className="stack" aria-labelledby="visits-title">
          <h2 id="visits-title" className="annotation">
            {plural(w.expected, visits.length, locale)}{here > 0 && <span className="count"> · {plural(w.here, here, locale)}</span>}
          </h2>
          <ul className="rows visits">
            {visits.map(v => (
              <li key={v.id} className={"row-item visit-row" + (v.arrivedAt ? " is-here" : "")}>
                <span className="mono visit-time">{v.time}</span>
                <span className="grow">
                  <strong>{v.name}</strong>{v.company && <span className="muted"> · {v.company}</span>}
                  <span className="muted small sub-line">{format(w.toSee, { name: v.host })}</span>
                </span>
                <span className="visit-actions">
                  {v.arrivedAt && <span className="tag"><Check />{format(w.arrivedAt, { time: v.arrivedAt })}</span>}
                  {!v.arrivedAt && isToday && v.mayArrive && <button type="button" className="button small" onClick={() => arrived(v)}><Check />{w.arrive}</button>}
                  {!past && !v.arrivedAt && <button type="button" className="link-button" onClick={() => cancel(v)}>{w.cancel}</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Dialog open={open} title={format(w.formTitle, { day: dayLabel })} dirty={dirty} labels={t.dialog} onClose={() => { setOpen(false); setDirty(false); }}>
        {open && (
          <VisitForm officeId={officeId} day={day} defaultAt={defaultAt} reception={reception} me={me} people={people} locale={locale} t={t}
            onDirty={() => setDirty(true)}
            onDone={(name, at) => {
              setOpen(false);
              setDirty(false);
              toast({ id: "visit-new", text: format(w.announced, { name, day: dayLabel, time: formatTime(at, locale) }) });
              router.refresh();
            }} />
        )}
      </Dialog>
    </>
  );
}

// Who comes, from where, at what time, to see whom (the reception chooses
// the host; a member is the host).
function VisitForm({ officeId, day, defaultAt, reception, me, people, locale, t, onDirty, onDone }: {
  officeId: string; day: string; defaultAt: number; reception: boolean; me: Person; people: Person[]; locale: string; t: Words;
  onDirty: () => void; onDone: (name: string, at: number) => void;
}) {
  const w = t.visitors;
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [at, setAt] = useState(defaultAt);
  const [host, setHost] = useState<Person>(me);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const find = useMemo(() => localSearch(people), [people]);
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); onDirty(); };
  function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void announceVisit({ officeId, day, at, name, company, host: host.id }).then(r => {
      setBusy(false);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      onDone(r.value.name, r.value.at);
    });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-4">
          <span className="label">{w.name}</span>
          <input className="field" required maxLength={120} autoComplete="off" value={name} onChange={e => change(setName)(e.target.value)} />
        </label>
        <label className="span-3">
          <span className="label">{w.company}</span>
          <input className="field" maxLength={120} autoComplete="off" value={company} onChange={e => change(setCompany)(e.target.value)} />
        </label>
        <label>
          <span className="label">{w.at}</span>
          <TimeSelect value={at} min={0} max={1440 - step} step={step} onChange={change(setAt)} />
        </label>
      </div>
      {reception && (
        <PeoplePicker label={w.host} value={[host]} search={find} labels={t.peoplePicker} lang={locale}
          onChange={v => change(setHost)(v[0] ?? me)} />
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="button" disabled={busy || name.trim() === ""}><Badge />{w.save}</button>
      </div>
    </form>
  );
}

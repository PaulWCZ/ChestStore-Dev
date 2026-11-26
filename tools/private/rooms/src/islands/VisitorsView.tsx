import { call, toast, type Outcome } from "@argentic/chest-app/client";
import { Dialog, EmptyState, PageHeader, PeoplePicker, TimeSelect } from "@argentic/chest-ui/components";
import { localSearch } from "@argentic/chest-ui/components/logic";
import { useMemo, useState, type FormEvent } from "react";
import { DayPicker, type DayPickerProps } from "../components/day-picker.tsx";
import { Badge, Check, Plus } from "../components/icons.tsx";
import { OfficePicker, type OfficePickerProps } from "../components/office-picker.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, formatTime, plural } from "../i18n/format.ts";
import { step } from "../shared/model.ts";

export type VisitorWords = { visitors: Catalogue["visitors"]; dialog: Catalogue["kit"]["dialog"]; peoplePicker: Catalogue["kit"]["peoplePicker"] };
type Words = VisitorWords;
type Person = { id: string; name: string; photo: string | null };
export type VisitRow = { id: string; at: number; time: string; name: string; company: string; host: string; hostId: string; arrivedAt: string | null; mayArrive: boolean; invitation: "sent" | "not_sent" | null };
type Mail = { ok: boolean; replyTo: string | null };

// The day's visitors, by time: who, from which company, to see whom, and —
// on their day — "Mark arrived", which tells the host. One obvious action:
// announce a visitor.
export function VisitorsView({ head, strip, officeId, day, dayLabel, isToday, past, defaultAt, reception, mail, me, visits, people, locale, t }: {
  head: { title: string; intro: string; offices: OfficePickerProps | null };
  strip: DayPickerProps;
  officeId: string;
  day: string;
  dayLabel: string;
  isToday: boolean;
  past: boolean;
  defaultAt: number;
  reception: boolean;
  mail: Mail;
  me: Person;
  visits: VisitRow[];
  people: Person[];
  locale: string;
  t: Words;
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const w = t.visitors;
  const undone = (r: Outcome<unknown>) => (r.ok ? true : r.message);
  const here = visits.filter(v => v.arrivedAt !== null).length;

  async function arrived(v: VisitRow) {
    const r = await call("visitorArrived", { visitId: v.id });
    if (!r.ok) return;
    toast({
      id: "visit-" + v.id,
      text: v.hostId === me.id ? format(w.arrivedToastSelf, { name: v.name }) : format(w.arrivedToast, { name: v.name, host: v.host }),
      undo: async () => undone(await call("visitorNotArrived", { visitId: v.id }, { quiet: true })),
    });
  }
  async function cancel(v: VisitRow) {
    const r = await call("cancelVisit", { visitId: v.id });
    if (!r.ok) return;
    toast({
      id: "visit-" + v.id,
      text: format(v.invitation === "sent" ? w.cancelledMailed : w.cancelled, { name: v.name }),
      undo: async () => undone(await call("restoreVisit", { visitId: v.id }, { quiet: true })),
    });
  }

  return (
    <>
      <PageHeader title={head.title} intro={<span className="place-line">{head.intro}</span>} secondary={head.offices ? <OfficePicker {...head.offices} /> : undefined}
        action={<button type="button" className="button" disabled={past} onClick={() => { setDirty(false); setOpen(true); }}><Plus />{w.announce}</button>} />
      <DayPicker {...strip} />
      {!reception && <p className="hint">{w.onlyYours}</p>}
      {visits.length === 0 ? (
        <EmptyState icon={<Badge />} title={w.empty.title} body={w.empty.body} />
      ) : (
        <section className="stack" aria-labelledby="visits-title">
          <h2 id="visits-title" className="annotation">
            {plural(w.expected, visits.length, locale)}{here > 0 && <span className="count"> · {plural(w.here, here, locale)}</span>}
          </h2>
          <ul className="rows">
            {visits.map(v => (
              <li key={v.id} className={"row-item visit-row" + (v.arrivedAt ? " is-here" : "")}>
                <span className="mono visit-time">{v.time}</span>
                <span className="grow">
                  <strong>{v.name}</strong>{v.company && <span className="muted"> · {v.company}</span>}
                  <span className="muted small sub-line">{format(w.toSee, { name: v.host })}{v.invitation && <> · {v.invitation === "sent" ? w.invitationSent : w.invitationNotSent}</>}</span>
                </span>
                <span className="visit-actions">
                  {v.arrivedAt && <span className="tag"><Check />{format(w.arrivedAt, { time: v.arrivedAt })}</span>}
                  {!v.arrivedAt && isToday && v.mayArrive && <button type="button" className="button small" onClick={() => void arrived(v)}><Check />{w.arrive}</button>}
                  {!past && !v.arrivedAt && <button type="button" className="link-button" onClick={() => void cancel(v)}>{w.cancel}</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Dialog open={open} title={format(w.formTitle, { day: dayLabel })} dirty={dirty} labels={t.dialog} onClose={() => { setOpen(false); setDirty(false); }}>
        {open && (
          <VisitForm officeId={officeId} day={day} defaultAt={defaultAt} reception={reception} mail={mail} me={me} people={people} locale={locale} t={t}
            onDirty={() => setDirty(true)}
            onDone={(name, at, invitation) => {
              setOpen(false);
              setDirty(false);
              const said = invitation === "sent" ? w.announcedSent : invitation === "not_sent" ? w.announcedNotSent : w.announced;
              toast({ id: "visit-new", text: format(said, { name, day: dayLabel, time: formatTime(at, locale) }) });
            }} />
        )}
      </Dialog>
    </>
  );
}

// Who comes, from where, at what time, to see whom (the reception chooses
// the host; a member is the host).
function VisitForm({ officeId, day, defaultAt, reception, mail, me, people, locale, t, onDirty, onDone }: {
  officeId: string; day: string; defaultAt: number; reception: boolean; mail: Mail; me: Person; people: Person[]; locale: string; t: Words;
  onDirty: () => void; onDone: (name: string, at: number, invitation: "sent" | "not_sent" | null) => void;
}) {
  const w = t.visitors;
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
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
    void call("announceVisit", { officeId, day, at, name, company, host: host.id, ...(mail.ok && email.trim() ? { email: email.trim() } : {}) }, { quiet: true }).then(r => {
      setBusy(false);
      if (!r.ok) return setError(r.message);
      onDone(r.value.name, r.value.at, r.value.invitation);
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
      {/* The visitor's invitation by email: offered only when the Chest can
          send now; otherwise the form says so and the visit still stands. */}
      {mail.ok ? (
        <label>
          <span className="label">{w.email}</span>
          <input className="field" type="email" maxLength={254} autoComplete="off" spellCheck={false} aria-describedby="visit-email-hint" value={email} onChange={e => change(setEmail)(e.target.value)} />
          <span id="visit-email-hint" className="hint">{mail.replyTo ? format(w.emailHintReply, { address: mail.replyTo }) : w.emailHint}</span>
        </label>
      ) : (
        <p className="hint">{w.noMail}</p>
      )}
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

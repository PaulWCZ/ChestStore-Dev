import { useState, type FormEvent } from "react";
import { Check, Cross, Maybe, Party } from "../components/icons.tsx";
import { Honeypot, send } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";
import { fill as format, plural, type Plural } from "./words.ts";

// A guest's answer (src/lib/guests.ts): a name, an email if they want the
// chosen date, and yes / if need be / no per date — the same big controls
// as the team's. A plain form to the public action answerGuest, posted
// under the poll's page (/p/<link>/actions/…: the guest's secret is a
// cookie for that path alone): without
// script it posts and the server sends the page back; with it, it is sent
// in place, a refusal said under the button (a robot's too), and after
// sending: thanks, and "change my answer" from this browser until the poll
// closes.
type Words = { guest: Catalogue["guest"]; poll: Catalogue["poll"] };
export type GuestOption = { id: string; month: string; day: string; weekday: string; text: string; hours: string; left: number | null };

export function GuestForm({ link, pollId, options, signup, mailOn, mine, sent, locale, t }: {
  link: string;
  pollId: string;
  options: GuestOption[];
  signup: boolean;
  // Whether the Chest can email the chosen date (mail.available()): off,
  // the form does not ask for an address it could not use.
  mailOn: boolean;
  mine: { name: string; email: string; dates: Record<string, number> } | null;
  sent: "1" | "2" | null;
  locale: string;
  t: Words;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(mine === null);
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...(mine?.dates ?? {}) }));
  // Kept by the page, not by the form: a refused answer keeps what was typed.
  const [name, setName] = useState(mine?.name ?? "");
  const [email, setEmail] = useState(mine?.email ?? "");
  const placesWord = (n: number) => plural(t.poll.places as Plural, n, locale);

  if (!editing && mine) {
    const said = options.filter(o => mine.dates[o.id] === 2 || mine.dates[o.id] === 1).map(o => `${o.weekday} ${o.day} ${o.month} · ${o.hours} · ${mine.dates[o.id] === 2 ? t.poll.yes : t.poll.maybe}`);
    return (
      <div className="thanks" role="status">
        <h2><Party /> {format(sent === "2" ? t.guest.updated : t.guest.thanks, { name: mine.name })}</h2>
        {said.length > 0 ? (
          <div className="said" aria-label={t.poll.youSaid}>{said.map((s, i) => <span key={i} className="chip">{s}</span>)}</div>
        ) : <p>{t.guest.noneSuits}</p>}
        <p>{mine.email && mailOn ? format(t.guest.willMail, { email: mine.email }) : t.guest.changeHint}</p>
        <button type="button" className="button small" onClick={() => setEditing(true)}>{t.poll.change}</button>
      </div>
    );
  }

  // Sent by this island (its onSubmit), not by the page's forms: the
  // refusal stays here, under the button. The server answers the page of
  // the link (?sent=1) with this browser's secret in a cookie.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await send(event.currentTarget.action, {}, new FormData(event.currentTarget), { refresh: false, quiet: true });
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setEditing(false);
  }

  return (
    <form className="card answer-card guest-form" method="post" action={`/p/${link}/actions/answerGuest`} onSubmit={e => void submit(e)} noValidate>
      <input type="hidden" name="link" value={link} />
      <input type="hidden" name="poll" value={pollId} />
      {/* The field only robots fill, and the form's token (the package's guard). */}
      <Honeypot />
      <h2>{t.guest.title}</h2>
      <p className="hint">{t.guest.intro}</p>
      <div className="guest-fields">
        <label className="lbl" htmlFor="guest-name">{t.guest.name}</label>
        <input id="guest-name" name="name" className="field" type="text" required maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
        {mailOn && <>
          <label className="lbl" htmlFor="guest-email">{t.guest.email}</label>
          <input id="guest-email" name="email" className="field" type="email" maxLength={254} autoComplete="email" aria-describedby="guest-email-hint" value={email} onChange={e => setEmail(e.target.value)} />
          <p id="guest-email-hint" className="hint">{t.guest.emailHint}</p>
        </>}
        {/* Mail off for now: an address given earlier is kept, not asked. */}
        {!mailOn && email !== "" && <input type="hidden" name="email" value={email} />}
      </div>
      <fieldset className="q">
        <legend className="visually-hidden">{t.guest.dates}</legend>
        <p className="hint">{t.poll.dateHint}</p>
        <div className="date-rows">
          {options.map(o => {
            const value = values[o.id] ?? null;
            const choose = (v: number) => setValues(s => ({ ...s, [o.id]: v }));
            const cls = value === 2 ? " yes" : value === 1 ? " maybe" : "";
            const full = o.left === 0 && value !== 2;
            return (
              <div key={o.id} className={"date-row" + cls} role="radiogroup" aria-label={o.text + ", " + o.hours}>
                <div className="when">
                  <span className="day-badge" aria-hidden="true"><span className="m">{o.month}</span><span className="d">{o.day}</span><span className="w">{o.weekday}</span></span>
                  <span className="when-text"><strong>{o.text}</strong><span>{o.hours}</span>{o.left !== null && <span className={"places" + (o.left === 0 ? " none" : "")}>{placesWord(o.left)}</span>}</span>
                </div>
                <div className={"tri" + (signup ? " two" : "")}>
                  <label className="yes"><input type="radio" name={`d${o.id}`} value="2" checked={value === 2} disabled={full} onChange={() => choose(2)} /><span><Check />{t.poll.yes}</span></label>
                  {!signup && <label className="maybe"><input type="radio" name={`d${o.id}`} value="1" checked={value === 1} onChange={() => choose(1)} /><span><Maybe />{t.poll.maybe}</span></label>}
                  <label className="no"><input type="radio" name={`d${o.id}`} value="0" checked={value === 0} onChange={() => choose(0)} /><span><Cross />{t.poll.no}</span></label>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="submit-row">
        <button type="submit" className="button primary big" disabled={busy}>{busy ? t.poll.sending : mine ? t.poll.update : t.poll.send}</button>
        {mine && <button type="button" className="button link" onClick={() => { setValues({ ...mine.dates }); setEditing(false); }}>{t.poll.cancelChange}</button>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

import { call, Honeypot, navigate } from "@argentic/chest-app/client";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Check, Close } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// The client's answer: accepting is the one obvious action — their name,
// the box "Bon pour accord", the day already written — and declining is a
// quieter link that opens its own short form (their name, a reason if they
// wish). The form carries the fingerprint of the PDF the page shows: if the
// quote changed meanwhile, the answer is refused and the page is drawn
// again with the quote as it is, saying what is different (`changes`);
// the name typed stays, the box is to tick again.
//
// It works without script too: a plain form posted to the public action
// (POST /actions/answerQuote, with the package's honeypot and form token),
// which goes back to this page with the refusal, or on to the answer.
export type AnswerWords = Pick<Catalogue["online"], "acceptTitle" | "name" | "goodForAgreement" | "agreeHint" | "agreeHintTerms" | "date" | "accept" | "declineLink" | "declineTitle" | "reason" | "optional" | "decline" | "cancel" | "changedTitle" | "changedLead" | "changedPlain"> & { lead: string };

// `t.lead` (online.acceptLead) comes filled with the quote's amount. `terms`: the fingerprint of the terms and conditions of sale offered
// with the quote ("" when the company has none). `changes`: what differs
// from the version the visitor's last answer was given on (null: nothing
// to say; [] the quote changed, without the detail).
export function AnswerForm({ secret, shown, terms, today, t, changes }: { secret: string; shown: string; terms: string; today: string; t: AnswerWords; changes: readonly string[] | null }) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  // Another version of the PDF on the page: the box is to tick again.
  useEffect(() => setAgree(false), [shown]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const answer = mode === "accept" ? "accepted" : "refused";
    // On success the action goes on to the answer's page (redirect).
    const result = await call("answerQuote", { secret, answer, name, agree: mode === "accept" && agree, reason: mode === "decline" ? reason : "", shown, terms }, { quiet: true });
    setPending(false);
    if (result.ok) return;
    // The quote changed while it was read: the page as it is now, with
    // what is different from what was read.
    if (result.error === "changed") return void navigate(`/q/${secret}?read=${shown}`, { top: false });
    setError({ code: result.error, text: result.message });
  }
  const changed = changes !== null ? (
    <div className="answer-changes" role="alert">
      <h3>{t.changedTitle}</h3>
      {changes.length > 0 ? (
        <>
          <p>{t.changedLead}</p>
          <ul>{changes.map(c => <li key={c}>{c}</li>)}</ul>
        </>
      ) : <p>{t.changedPlain}</p>}
    </div>
  ) : null;
  const hidden = (
    <>
      <Honeypot />
      <input type="hidden" name="secret" value={secret} />
      <input type="hidden" name="shown" value={shown} />
      <input type="hidden" name="terms" value={terms} />
    </>
  );
  const nameInvalid = error?.code === "name_short" || error?.code === "empty" ? true : undefined;
  const said = error && <p className="error" id="answer-error" role="alert"><Alert />{error.text}</p>;
  if (mode === "decline") {
    return (
      <form method="post" action="/actions/answerQuote" className="answer-form" aria-labelledby="decline-title" onSubmit={e => void submit(e)}>
        <h2 id="decline-title">{t.declineTitle}</h2>
        {changed}
        {hidden}
        <input type="hidden" name="answer" value="refused" />
        <div>
          <label className="label" htmlFor="decline-name">{t.name}</label>
          <input id="decline-name" name="name" className="field" autoComplete="name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} aria-invalid={nameInvalid} aria-describedby={error ? "answer-error" : undefined} />
        </div>
        <div>
          <label className="label" htmlFor="decline-reason">{t.reason} <span className="optional">{t.optional}</span></label>
          <textarea id="decline-reason" name="reason" className="field" rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        {said}
        <div className="row">
          <button type="submit" className="button" disabled={pending}><Close />{t.decline}</button>
          <button type="button" className="button quiet" onClick={() => { setMode("accept"); setError(null); }}>{t.cancel}</button>
        </div>
      </form>
    );
  }
  return (
    <form method="post" action="/actions/answerQuote" className="answer-form" aria-labelledby="accept-title" onSubmit={e => void submit(e)}>
      <h2 id="accept-title">{t.acceptTitle}</h2>
      {changed}
      <p className="hint">{t.lead}</p>
      {hidden}
      <input type="hidden" name="answer" value="accepted" />
      <div>
        <label className="label" htmlFor="accept-name">{t.name}</label>
        <input id="accept-name" name="name" className="field" autoComplete="name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} aria-invalid={nameInvalid} aria-describedby={error ? "answer-error" : undefined} />
      </div>
      <label className="agree">
        <input type="checkbox" name="agree" required checked={agree} onChange={e => setAgree(e.target.checked)} aria-invalid={error?.code === "must_agree" ? true : undefined} />
        <span><strong>{t.goodForAgreement}</strong><br /><span className="hint">{terms ? t.agreeHintTerms : t.agreeHint}</span></span>
      </label>
      <p className="answer-date"><span className="hint">{t.date}</span> {today}</p>
      {said}
      <button type="submit" className="button block" disabled={pending}><Check />{t.accept}</button>
      <p className="decline-line"><button type="button" className="link-button" onClick={() => { setMode("decline"); setError(null); }}>{t.declineLink}</button></p>
    </form>
  );
}

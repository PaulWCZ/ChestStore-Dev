"use client";

import { useActionState, useState } from "react";
import { Alert, Check, Close } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { answerQuote, type AnswerState } from "../../public-actions.ts";

// The client's answer: accepting is the one obvious action — their name,
// the box "Bon pour accord", the day already written — and declining is a
// quieter link that opens its own short form (their name, a reason if they
// wish). The form carries the fingerprint of the PDF the page shows: if the
// quote changed meanwhile, the answer is refused and the page asks to read
// it again.
export type AnswerWords = Catalogue["online"] & { errors: Catalogue["errors"] };

// `terms`: the fingerprint of the terms and conditions of sale offered
// with the quote ("" when the company has none).
export function AnswerForm({ secret, shown, terms, started, today, amount, t }: { secret: string; shown: string; terms: string; started: string; today: string; amount: string; t: AnswerWords }) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerQuote.bind(null, secret), { error: null, values: { name: "", reason: "" } });
  // The quote changed while it was read: the page now shows it as it is,
  // and says what is different (the answer must be given again).
  const changed = state.error === "changed";
  const error = state.error && !changed ? format(t.errors[state.error] ?? t.errors.unknown, { max: 120 }) : null;
  const changes = changed ? (
    <div className="answer-changes" role="alert">
      <h3>{t.changedTitle}</h3>
      {state.changes && state.changes.length > 0 ? (
        <>
          <p>{t.changedLead}</p>
          <ul>{state.changes.map(c => <li key={c}>{c}</li>)}</ul>
        </>
      ) : <p>{t.changedPlain}</p>}
    </div>
  ) : null;
  const hidden = (
    <>
      <input type="hidden" name="shown" value={shown} />
      <input type="hidden" name="terms" value={terms} />
      <input type="hidden" name="started" value={started} />
      <div className="trap" aria-hidden="true"><label>{t.trap}<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </>
  );
  if (mode === "decline") {
    return (
      <form action={action} className="answer-form" aria-labelledby="decline-title">
        <h2 id="decline-title">{t.declineTitle}</h2>
        {changes}
        {hidden}
        <input type="hidden" name="answer" value="refused" />
        <div>
          <label className="label" htmlFor="decline-name">{t.name}</label>
          <input id="decline-name" name="name" className="field" autoComplete="name" required maxLength={120} defaultValue={state.values.name} aria-invalid={state.error === "name_short" || state.error === "empty" ? true : undefined} aria-describedby={error ? "answer-error" : undefined} />
        </div>
        <div>
          <label className="label" htmlFor="decline-reason">{t.reason} <span className="optional">{t.optional}</span></label>
          <textarea id="decline-reason" name="reason" className="field" rows={3} maxLength={1000} defaultValue={state.values.reason} />
        </div>
        {error && <p className="error" id="answer-error" role="alert"><Alert />{error}</p>}
        <div className="row">
          <button type="submit" className="button" disabled={pending}><Close />{t.decline}</button>
          <button type="button" className="button quiet" onClick={() => setMode("accept")}>{t.cancel}</button>
        </div>
      </form>
    );
  }
  return (
    <form action={action} className="answer-form" aria-labelledby="accept-title">
      <h2 id="accept-title">{t.acceptTitle}</h2>
      {changes}
      <p className="hint">{format(t.acceptLead, { amount })}</p>
      {hidden}
      <input type="hidden" name="answer" value="accepted" />
      <div>
        <label className="label" htmlFor="accept-name">{t.name}</label>
        <input id="accept-name" name="name" className="field" autoComplete="name" required maxLength={120} defaultValue={state.values.name} aria-invalid={state.error === "name_short" || state.error === "empty" ? true : undefined} aria-describedby={error ? "answer-error" : undefined} />
      </div>
      <label className="agree">
        <input type="checkbox" name="agree" value="yes" required aria-invalid={state.error === "must_agree" ? true : undefined} />
        <span><strong>{t.goodForAgreement}</strong><br /><span className="hint">{terms ? t.agreeHintTerms : t.agreeHint}</span></span>
      </label>
      <p className="answer-date"><span className="hint">{t.date}</span> {today}</p>
      {error && <p className="error" id="answer-error" role="alert"><Alert />{error}</p>}
      <button type="submit" className="button block" disabled={pending}><Check />{t.accept}</button>
      <p className="decline-line"><button type="button" className="link-button" onClick={() => setMode("decline")}>{t.declineLink}</button></p>
    </form>
  );
}

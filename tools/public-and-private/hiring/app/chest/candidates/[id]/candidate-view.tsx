"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { HireDialog } from "../../../../components/hire-dialog.tsx";
import { Arrow, Ban, Bell, Bin, Dots, Pencil, Undo, Upload } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Feedback } from "../../../../lib/candidates.ts";
import { format, intl, languageNames, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { languages, limits, recommendations, rejectReasons, type Language, type RejectReason } from "../../../../lib/model.ts";
import { cvAccept, uploadCv } from "../../../../lib/upload.ts";
import { addNote, askFeedback, cancelAsk, editCandidate, eraseCandidate, giveFeedback, moveCandidate, rejectCandidate, removeNote, restoreCandidate, setCv } from "../../actions.ts";

type Errors = Catalogue["errors"];
type Fail = { ok: false; error: keyof Errors; values?: Record<string, string | number> };
const failed = (t: Errors, r: Fail) => format(t[r.error], r.values ?? {});

// ---- The recruiter's actions -----------------------------------------------

type ActionWords = { candidate: Catalogue["candidate"]; reject: Catalogue["reject"]; errors: Errors; common: Catalogue["common"]; apply: Catalogue["apply"]; board: Catalogue["board"]; hire: Catalogue["hire"] };

export function CandidateActions({ jobId, candidate, stages, next, askable, draft, languageName, locale, t }: {
  jobId: string;
  candidate: { id: string; name: string; status: "active" | "rejected"; stageId: string; email: string; phone: string; link: string; language: Language };
  stages: { id: string; name: string; hired: boolean }[];
  next: { id: string; name: string } | null;
  askable: { id: string; name: string; asked: boolean }[];
  draft: string;
  languageName: string;
  locale: string;
  t: ActionWords;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"reject" | "ask" | "edit" | "erase" | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const w = t.candidate;
  const stageName = (id: string) => stages.find(s => s.id === id)?.name ?? "";
  const close = () => { if (menu.current) menu.current.open = false; };

  const [hiring, setHiring] = useState<string | null>(null);
  const isHired = (id: string) => stages.find(s => s.id === id)?.hired === true;
  function request(to: string) {
    if (isHired(to) && !isHired(candidate.stageId)) setHiring(to);
    else move(to);
  }
  function move(to: string, undo = true, day?: string | null) {
    const from = candidate.stageId;
    start(async () => {
      const r = await moveCandidate(candidate.id, to, day ?? undefined);
      if (!r.ok) return toast(failed(t.errors, r));
      if (undo) toast(format(w.moved, { stage: stageName(to) }), { label: t.common.undo, run: () => start(async () => { await moveCandidate(candidate.id, from); }) });
    });
  }

  function restore() {
    start(async () => {
      const r = await restoreCandidate(candidate.id);
      if (!r.ok) return toast(failed(t.errors, r));
      toast(format(w.restored, { name: candidate.name, stage: stageName(candidate.stageId) }));
    });
  }

  async function replaceCv(f: File) {
    close();
    start(async () => {
      const sent = await uploadCv(f, "/chest/api/cv");
      if (!sent.ok) return toast(t.errors[sent.error === "cv_off" ? "unavailable" : sent.error]);
      const r = await setCv(candidate.id, sent.ticket, f.name);
      if (!r.ok) return toast(failed(t.errors, r));
      toast(w.cvSaved);
    });
  }

  return (
    <div className="cand-actions">
      {candidate.status === "active" ? (
        <>
          {next && <button type="button" className="button" disabled={pending} onClick={() => request(next.id)}>{format(w.next, { stage: next.name })}<Arrow /></button>}
          <div className="move-to">
            <label className="visually-hidden" htmlFor="move-to">{w.moveTo}</label>
            <select id="move-to" className="field" value="" disabled={pending} onChange={e => { if (e.target.value) request(e.target.value); }}>
              <option value="">{w.moveTo}…</option>
              {stages.filter(s => s.id !== candidate.stageId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button type="button" className="button quiet" onClick={() => setDialog("ask")}><Bell />{w.ask}</button>
          <button type="button" className="button quiet danger-text" onClick={() => setDialog("reject")}><Ban />{w.reject}</button>
        </>
      ) : (
        <button type="button" className="button" disabled={pending} onClick={restore}><Undo />{w.restore}</button>
      )}
      <details className="menu" ref={menu}>
        <summary className="button quiet icon-only" title={t.common.more}><Dots /><span className="visually-hidden">{t.common.more}</span></summary>
        <div className="menu-pop">
          <button type="button" onClick={() => { close(); setDialog("edit"); }}><Pencil />{w.edit}</button>
          <button type="button" onClick={() => file.current?.click()}><Upload />{w.replaceCv}</button>
          <hr />
          <button type="button" className="danger-text" onClick={() => { close(); setDialog("erase"); }}><Bin />{w.erase}</button>
        </div>
      </details>
      <input ref={file} type="file" accept={cvAccept} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) void replaceCv(f); }} />

      <HireDialog name={hiring ? candidate.name : null} onCancel={() => setHiring(null)} onConfirm={day => { const to = hiring; setHiring(null); if (to) move(to, true, day); }} t={{ hire: t.hire, common: t.common }} />
      <Dialog open={dialog === "reject"} title={format(t.reject.title, { name: candidate.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <RejectForm candidate={candidate} draft={draft} languageName={languageName} t={t} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "ask"} title={w.ask} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <AskForm candidateId={candidate.id} askable={askable} locale={locale} t={t} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "edit"} title={w.edit} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <EditForm candidate={candidate} t={t} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog open={dialog === "erase"} title={format(w.eraseTitle, { name: candidate.name })} closeLabel={t.common.close} onClose={() => setDialog(null)}>
        <div className="stack">
          <p>{w.eraseBody}</p>
          <div className="form-actions">
            <button type="button" className="button danger" disabled={pending} onClick={() => start(async () => {
              const r = await eraseCandidate(candidate.id);
              if (!r.ok) return toast(failed(t.errors, r));
              setDialog(null);
              toast(format(w.erased, { name: candidate.name }));
              router.replace(`/chest/jobs/${jobId}`);
            })}><Bin />{w.eraseConfirm}</button>
            <button type="button" className="button quiet" onClick={() => setDialog(null)}>{t.common.cancel}</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RejectForm({ candidate, draft, languageName, t, onDone }: { candidate: { id: string; name: string }; draft: string; languageName: string; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<RejectReason>("skills");
  const [send, setSend] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const w = t.reject;
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      setError(null);
      start(async () => {
        const r = await rejectCandidate(candidate.id, reason, String(data.get("note") ?? ""), { send, text: String(data.get("text") ?? "") });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        const message = r.value.delivery === "email" ? w.doneEmailed : r.value.delivery === "none" ? w.noMail : w.done;
        toast(format(message, { name: candidate.name }), { label: t.common.undo, run: () => start(async () => { await restoreCandidate(candidate.id); }) });
      });
    }}>
      <fieldset className="choices">
        <legend className="label">{w.reason} <span className="optional">{w.reasonHint}</span></legend>
        <div className="reason-grid">
          {rejectReasons.map(r => (
            <label key={r} className={`pill${reason === r ? " on" : ""}`}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              <span>{w.reasons[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field-block">
        <label className="label" htmlFor="reject-note">{w.note} <span className="optional">{t.apply.optional}</span></label>
        <input id="reject-note" name="note" className="field" maxLength={limits.rejectNote} />
      </div>
      <label className="check">
        <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} />
        <span>{w.email}</span>
      </label>
      {send && (
        <div className="field-block">
          <label className="visually-hidden" htmlFor="reject-text">{w.email}</label>
          <textarea id="reject-text" name="text" className="field" rows={9} maxLength={limits.emailText} defaultValue={draft} aria-describedby="reject-hint" />
          <p className="hint" id="reject-hint">{format(w.emailHint, { language: languageName })}</p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button danger" disabled={pending}>{w.confirm}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

function AskForm({ candidateId, askable, locale, t, onDone }: { candidateId: string; askable: { id: string; name: string; asked: boolean }[]; locale: string; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const w = t.candidate;
  if (askable.length === 0) return <p className="muted">{w.nobodyToAsk}</p>;
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      start(async () => {
        const r = await askFeedback(candidateId, [...chosen]);
        if (!r.ok) return toast(failed(t.errors, r));
        onDone();
        toast(plural(w.asked, r.value.count, locale));
      });
    }}>
      <p className="hint">{w.askHint}</p>
      <ul className="pick-list">
        {askable.map(p => (
          <li key={p.id}>
            {p.asked ? (
              <span className="asked-row">
                <span>{p.name}</span>
                <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => { const r = await cancelAsk(candidateId, p.id); if (!r.ok) toast(failed(t.errors, r)); })}>{format(w.stopAsking, { name: p.name })}</button>
              </span>
            ) : (
              <label className="check">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={e => setChosen(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                <span>{p.name}</span>
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || chosen.size === 0}><Bell />{w.askSend}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

function EditForm({ candidate, t, onDone }: { candidate: { id: string; name: string; email: string; phone: string; link: string; language: Language }; t: ActionWords; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      const text = (k: string) => String(data.get(k) ?? "");
      start(async () => {
        const r = await editCandidate(candidate.id, { name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), language: text("language") });
        if (!r.ok) return setError(failed(t.errors, r));
        onDone();
        toast(t.common.saved);
      });
    }}>
      <div className="field-block"><label className="label" htmlFor="edit-name">{t.apply.name}</label><input id="edit-name" name="name" className="field" required maxLength={limits.name} defaultValue={candidate.name} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-email">{t.apply.email}</label><input id="edit-email" name="email" type="email" className="field" required maxLength={limits.email} defaultValue={candidate.email} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-phone">{t.apply.phone}</label><input id="edit-phone" name="phone" type="tel" className="field" maxLength={limits.phone} defaultValue={candidate.phone} /></div>
      <div className="field-block"><label className="label" htmlFor="edit-link">{t.apply.link}</label><input id="edit-link" name="link" className="field" maxLength={limits.link} defaultValue={candidate.link} /></div>
      <div className="field-block">
        <label className="label" htmlFor="edit-language">{t.candidate.language}</label>
        <select id="edit-language" name="language" className="field" defaultValue={candidate.language}>
          {languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{t.common.save}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// ---- Feedback --------------------------------------------------------------

type FeedbackWords = { candidate: Catalogue["candidate"]; errors: Errors };

export function FeedbackForm({ candidateId, mine, t }: { candidateId: string; mine: Feedback | null; t: FeedbackWords }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rating, setRating] = useState<number>(mine?.rating ?? 0);
  const [recommendation, setRecommendation] = useState<string>(mine?.recommendation ?? "");
  const [error, setError] = useState<string | null>(null);
  const w = t.candidate;
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  return (
    <form className="stack feedback-form" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      if (!rating || !recommendation) return setError(t.errors.empty);
      setError(null);
      start(async () => {
        const r = await giveFeedback(candidateId, { rating, recommendation, strengths: String(data.get("strengths") ?? ""), concerns: String(data.get("concerns") ?? "") });
        if (!r.ok) return setError(failed(t.errors, r));
        toast(w.feedbackSaved);
      });
    }}>
      <fieldset className="choices">
        <legend className="label">{w.rating}</legend>
        <div className="scale">
          {ratingWords.map((word, i) => (
            <label key={i} className={`scale-step s${i + 1}${rating === i + 1 ? " on" : ""}`}>
              <input type="radio" name="rating" value={i + 1} checked={rating === i + 1} onChange={() => setRating(i + 1)} required />
              <span className="scale-n">{i + 1}</span>
              <span className="scale-word">{word}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor={`strengths-${candidateId}`}>{w.strengths}</label>
          <textarea id={`strengths-${candidateId}`} name="strengths" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.strengths ?? ""} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor={`concerns-${candidateId}`}>{w.concerns}</label>
          <textarea id={`concerns-${candidateId}`} name="concerns" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.concerns ?? ""} />
        </div>
      </div>
      <p className="hint">{w.feedbackHint}</p>
      <fieldset className="choices">
        <legend className="label">{w.recommendation}</legend>
        <div className="reco">
          {recommendations.map(r => (
            <label key={r} className={`pill reco-${r}${recommendation === r ? " on" : ""}`}>
              <input type="radio" name="recommendation" value={r} checked={recommendation === r} onChange={() => setRecommendation(r)} required />
              <span>{w.recommendations[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{mine ? w.updateFeedback : w.sendFeedback}</button>
      </div>
    </form>
  );
}

export function FeedbackList({ mine, others, hidden, locale, t }: { mine: (Feedback & { authorName: string }) | null; others: (Feedback & { authorName: string })[]; hidden: number; locale: string; t: { candidate: Catalogue["candidate"] } }) {
  const w = t.candidate;
  const all = [...(mine ? [mine] : []), ...others];
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  const average = all.length > 0 ? all.reduce((sum, f) => sum + f.rating, 0) / all.length : null;
  if (hidden > 0) return <p className="hidden-feedback">{plural(w.hidden, hidden, locale)}</p>;
  if (all.length === 0) return <p className="muted">{w.noFeedback}</p>;
  return (
    <>
      {average !== null && all.length > 1 && <p className="average">{format(w.average, { rating: new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 }).format(average) })}</p>}
      <ul className="feedback-list">
        {all.map(f => (
          <li key={f.id} className="feedback-card">
            <div className="feedback-head">
              <strong>{f.authorName}</strong>
              <span className={`score s${f.rating}`}>{f.rating}/4 · {ratingWords[f.rating - 1]}</span>
              <span className={`reco-tag reco-${f.recommendation}`}>{w.recommendations[f.recommendation]}</span>
            </div>
            {f.strengths && <p><span className="fb-label">{w.strengths}</span> <span className="pre">{f.strengths}</span></p>}
            {f.concerns && <p><span className="fb-label">{w.concerns}</span> <span className="pre">{f.concerns}</span></p>}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Notes -----------------------------------------------------------------

export function Notes({ candidateId, notes, canWrite, t }: { candidateId: string; notes: { id: string; authorName: string; body: string; when: string; mine: boolean }[]; canWrite: boolean; t: FeedbackWords }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const w = t.candidate;
  return (
    <div className="notes">
      {notes.length === 0 ? <p className="muted">{w.noNotes}</p> : (
        <ul className="note-list">
          {notes.map(n => (
            <li key={n.id}>
              <div className="note-head"><strong>{n.authorName}</strong><span className="muted small">{n.when}</span>
                {n.mine && canWrite && <button type="button" className="icon-button small" title={w.removeNote} onClick={() => start(async () => { const r = await removeNote(n.id); if (!r.ok) toast(failed(t.errors, r)); })}><Bin /><span className="visually-hidden">{w.removeNote}</span></button>}
              </div>
              <p className="pre">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="note-form" onSubmit={e => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          start(async () => {
            const r = await addNote(candidateId, body);
            if (!r.ok) return toast(failed(t.errors, r));
            setText("");
          });
        }}>
          <label className="visually-hidden" htmlFor="note">{w.notes}</label>
          <textarea id="note" className="field" rows={3} maxLength={limits.note} value={text} onChange={e => setText(e.target.value)} placeholder={w.notePlaceholder} />
          <div className="form-actions"><button type="submit" className="button quiet small" disabled={pending || !text.trim()}>{w.addNote}</button></div>
        </form>
      )}
    </div>
  );
}

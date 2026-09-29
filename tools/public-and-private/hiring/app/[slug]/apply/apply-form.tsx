"use client";

import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Question } from "../../../lib/model.ts";
import { cvKinds, cvMaxSize, uploadCv } from "../../../lib/upload.ts";
import { sendApplication, type FormState } from "../../public-actions.ts";

type Words = { apply: Catalogue["apply"]; errors: Catalogue["errors"]; files: FileWords };
const limits = { name: 120, email: 254, phone: 40, link: 500, coverLetter: 10000 };

// The form a candidate fills. The CV goes as soon as it is chosen, from the
// browser to the Chest (lib/upload.ts; the kit's file picker says how it
// goes), then the form with the ticket the tool gave for it. Nothing typed
// is lost when something is refused: the form is sent by hand, never
// reset.
export function ApplyForm({ slug, started, kept, pool, questions, t }: { slug: string; started: string; kept: string; pool: string; questions: Question[]; t: Words }) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(sendApplication, { error: null });
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [local, setLocal] = useState<FormState["error"] | null>(null);
  // Without public uploads on this Chest, a link replaces the file.
  const [linkOnly, setLinkOnly] = useState(false);
  const w = t.apply;
  const error = local ?? state.error;
  const message = error ? format(t.errors[error], { max: limits.coverLetter }) : null;
  const uploading = files.some(f => f.status === "sending");
  const busy = pending || uploading;
  const cv = files.find(f => f.status === "ready" && f.ref);
  // The form's guard refuses what comes within 3 seconds of the page (a
  // robot): a CV chosen that fast waits for it before it is sent.
  const shown = useRef(0);
  useEffect(() => { shown.current = Date.now(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setLocal(null);
    const data = new FormData(event.currentTarget);
    if (cv && !linkOnly) {
      data.set("cv", cv.ref!);
      data.set("cvName", cv.name);
    } else if (!linkOnly && !String(data.get("link") ?? "").trim()) {
      setLocal("cv_missing");
      return;
    }
    startTransition(() => dispatch(data));
  }

  return (
    <form className="stack" onSubmit={submit} noValidate={false}>
      <input type="hidden" name="started" value={started} />
      <input type="hidden" name="slug" value={slug} />
      <div className="honey" aria-hidden="true">
        <label htmlFor="website">{w.website}</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="name">{w.name}</label>
          <input id="name" name="name" className="field" autoComplete="name" required maxLength={limits.name} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="email">{w.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={limits.email} aria-invalid={error === "invalid_email" || undefined} />
        </div>
      </div>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="phone">{w.phone} <span className="optional">{w.optional}</span></label>
          <input id="phone" name="phone" type="tel" className="field" autoComplete="tel" maxLength={limits.phone} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="link">{linkOnly ? w.cvLinkRequired : w.link} {!linkOnly && <span className="optional">{w.optional}</span>}</label>
          <input id="link" name="link" type="text" inputMode="url" className="field" autoComplete="url" placeholder={w.linkPlaceholder} required={linkOnly} maxLength={limits.link} aria-invalid={error === "invalid_link" || undefined} />
        </div>
      </div>
      {linkOnly ? (
        <p className="notice" role="status">{w.cvOff}</p>
      ) : (
        <div className="field-block">
          <span className="label">{w.cv}</span>
          <FilePicker
            label={w.cv}
            files={files}
            onChange={update => { setFiles(update); setLocal(null); }}
            accept={cvKinds}
            maxFiles={1}
            maxSize={cvMaxSize}
            labels={t.files}
            upload={async file => {
              const wait = 3500 - (Date.now() - shown.current);
              if (wait > 0) await new Promise(done => setTimeout(done, wait));
              const sent = await uploadCv(file, "/api/cv", { slug, started });
              if (sent.ok) return { ok: true, ref: sent.ticket };
              if (sent.error === "cv_off") setLinkOnly(true);
              return { ok: false, error: t.errors[sent.error === "cv_off" ? "unavailable" : sent.error] };
            }}
          />
        </div>
      )}
      <div className="field-block">
        <label className="label" htmlFor="coverLetter">{w.coverLetter} <span className="optional">{w.optional}</span></label>
        <textarea id="coverLetter" name="coverLetter" className="field" rows={6} maxLength={limits.coverLetter} placeholder={w.coverLetterHint} />
      </div>
      {questions.length > 0 && (
        <fieldset className="questions">
          <legend className="label">{w.questions}</legend>
          {questions.map(q => (
            <div key={q.id} className="field-block">
              {q.kind === "text" ? (
                <>
                  <label className="label" htmlFor={`answer-${q.id}`}>{q.label} {!q.required && <span className="optional">{w.optional}</span>}</label>
                  <textarea id={`answer-${q.id}`} name={`answer:${q.id}`} className="field" rows={2} maxLength={1000} required={q.required} />
                </>
              ) : (
                <fieldset className="choices">
                  <legend className="label">{q.label} {!q.required && <span className="optional">{w.optional}</span>}</legend>
                  <div className="reason-grid">
                    {(q.kind === "yesno" ? [["yes", w.yes], ["no", w.no]] : q.options.map(o => [o, o])).map(([value, text]) => (
                      <label key={value} className="pill">
                        <input type="radio" name={`answer:${q.id}`} value={value} required={q.required} />
                        <span>{text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          ))}
        </fieldset>
      )}
      <p className="kept">{kept} <span className="muted">{w.consentMore}</span></p>
      <label className="consent">
        <input type="checkbox" name="pool" value="yes" />
        <span>{pool} <span className="optional">{w.optional}</span></span>
      </label>
      {message && <p className="error" role="alert">{message}</p>}
      <div className="form-actions">
        <button type="submit" className="button big" disabled={busy}>{uploading ? w.uploading : pending ? w.sending : w.send}</button>
      </div>
    </form>
  );
}

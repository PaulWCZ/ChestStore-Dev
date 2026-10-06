import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { FormToken, Honeypot, send } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";
import type { Catalogue } from "../i18n/index.ts";
import type { Question } from "../shared/model.ts";
import { cvKinds, cvMaxSize, uploadPublicCv } from "../components/upload.ts";

type Errors = { cv_missing: string; cv_invalid: string; cv_too_large: string; unavailable: string; limit: string; cv_off: string };
type Words = { apply: Catalogue["apply"]; errors: Errors; files: FileWords };
const limits = { name: 120, email: 254, phone: 40, link: 500, coverLetter: 10000 };

// The form a candidate fills. The CV goes as soon as it is chosen, from the
// browser to the Chest (src/components/upload.ts; the kit's file picker
// says how it goes), then the form with the claim the Chest gave for it.
// Nothing typed is lost when something is refused: the form is sent in
// place and never reset (the refusal is a sentence above the button).
// Without JavaScript the same form posts to the same action: with a link
// to a CV instead of a file.
export function ApplyForm({ slug, locale, kept, pool, questions, t }: { slug: string; locale: string; kept: string; pool: string; questions: Question[]; t: Words }) {
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Without public uploads on this Chest, a link replaces the file.
  const [linkOnly, setLinkOnly] = useState(false);
  const w = t.apply;
  const uploading = files.some(f => f.status === "sending");
  const busy = pending || uploading;
  const cv = files.find(f => f.status === "ready" && f.ref);
  // A CV the Chest refused (not what it says, too large) stops the
  // application until it is removed or replaced: never sent without it.
  const refused = files.find(f => f.status === "failed");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    if (refused && !linkOnly) {
      setError(refused.error ?? t.errors.cv_invalid);
      return;
    }
    if (cv && !linkOnly) {
      data.set("cv", cv.ref!);
      data.set("cvName", cv.name);
    } else if (!String(data.get("link") ?? "").trim()) {
      setError(t.errors.cv_missing);
      return;
    }
    setPending(true);
    const outcome = await send<null>("/actions/apply", {}, data, { quiet: true });
    setPending(false);
    if (!outcome.ok) setError(outcome.message);
  }

  return (
    <form className="stack" method="post" action="/actions/apply" onSubmit={event => void submit(event)}>
      <Honeypot action="apply" />
      {/* The token a CV upload asks with (call("publicCvUpload")). */}
      <FormToken action="publicCvUpload" />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lang" value={locale} />
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="name">{w.name}</label>
          <input id="name" name="name" className="field" autoComplete="name" required maxLength={limits.name} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="email">{w.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={limits.email} />
        </div>
      </div>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="phone">{w.phone} <span className="optional">{w.optional}</span></label>
          <input id="phone" name="phone" type="tel" className="field" autoComplete="tel" maxLength={limits.phone} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="link">{linkOnly ? w.cvLinkRequired : w.link} {!linkOnly && <span className="optional">{w.optional}</span>}</label>
          <input id="link" name="link" type="text" inputMode="url" className="field" autoComplete="url" placeholder={w.linkPlaceholder} required={linkOnly} maxLength={limits.link} />
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
            onChange={update => { setFiles(update); setError(null); }}
            accept={cvKinds}
            maxFiles={1}
            maxSize={cvMaxSize}
            labels={t.files}
            upload={async file => {
              const sent = await uploadPublicCv(file, slug, { invalid: t.errors.cv_invalid, tooLarge: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit });
              if (sent.ok) return { ok: true, ref: sent.ref };
              if (sent.code === "cv_off") setLinkOnly(true);
              return { ok: false, error: sent.error };
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
        <input type="checkbox" name="pool" value="1" />
        <span>{pool} <span className="optional">{w.optional}</span></span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button big" disabled={busy}>{uploading ? w.uploading : pending ? w.sending : w.send}</button>
      </div>
    </form>
  );
}

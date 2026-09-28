"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, File, Upload } from "../../../../../components/icons.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import { fileSize, format, languageNames } from "../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { languages, limits } from "../../../../../lib/model.ts";
import { cvAccept, uploadCv } from "../../../../../lib/upload.ts";
import { addCandidate } from "../../../actions.ts";

type Words = { addForm: Catalogue["addForm"]; apply: Catalogue["apply"]; candidate: Catalogue["candidate"]; errors: Catalogue["errors"] };

export function AddForm({ jobId, stages, language, locale, t }: { jobId: string; stages: { id: string; name: string }[]; language: string; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const w = t.addForm;

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "");
    setError(null);
    start(async () => {
      let ticket = "";
      if (file) {
        const sent = await uploadCv(file, "/chest/api/cv");
        if (!sent.ok) return setError(t.errors[sent.error === "cv_off" ? "unavailable" : sent.error]);
        ticket = sent.ticket;
      }
      const r = await addCandidate(jobId, { name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), coverLetter: text("coverLetter"), language: text("language"), stageId: text("stage"), cv: ticket, cvName: file?.name ?? "" });
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      toast(format(w.added, { name: text("name").trim() }));
      router.push(`/chest/candidates/${r.value.id}`);
    });
  }

  return (
    <form className="job-form" onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }}>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="name">{t.apply.name}</label>
          <input id="name" name="name" className="field" required maxLength={limits.name} autoFocus />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="email">{t.apply.email}</label>
          <input id="email" name="email" type="email" className="field" required maxLength={limits.email} />
        </div>
      </div>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="phone">{t.apply.phone} <span className="optional">{t.apply.optional}</span></label>
          <input id="phone" name="phone" type="tel" className="field" maxLength={limits.phone} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="link">{t.apply.link} <span className="optional">{t.apply.optional}</span></label>
          <input id="link" name="link" className="field" inputMode="url" maxLength={limits.link} placeholder={t.apply.linkPlaceholder} />
        </div>
      </div>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="stage">{w.stage}</label>
          <select id="stage" name="stage" className="field" defaultValue={stages[0]?.id}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field-block">
          <label className="label" htmlFor="language">{w.language}</label>
          <select id="language" name="language" className="field" defaultValue={language} aria-describedby="language-hint">
            {languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}
          </select>
          <p className="hint" id="language-hint">{w.languageHint}</p>
        </div>
      </div>
      <div className="field-block">
        <span className="label" id="cv-label">{t.candidate.cv} <span className="optional">{t.apply.optional}</span></span>
        <label className={`dropzone${file ? " has-file" : ""}`}>
          <input type="file" accept={cvAccept} className="visually-hidden" aria-labelledby="cv-label" aria-describedby="cv-hint" onChange={e => setFile(e.currentTarget.files?.[0] ?? null)} />
          {file ? (
            <><span className="dz-icon done"><Check /></span><span className="dz-text"><strong>{format(t.apply.cvChosen, { name: file.name, size: fileSize(file.size, locale) })}</strong></span><span className="dz-action">{t.apply.cvChange}</span></>
          ) : (
            <><span className="dz-icon"><Upload /></span><span className="dz-text"><strong>{t.apply.cvChoose}</strong></span><span className="dz-action"><File /></span></>
          )}
        </label>
        <p className="hint" id="cv-hint">{t.apply.cvHint}</p>
      </div>
      <div className="field-block">
        <label className="label" htmlFor="coverLetter">{t.candidate.coverLetter} <span className="optional">{t.apply.optional}</span></label>
        <textarea id="coverLetter" name="coverLetter" className="field" rows={4} maxLength={limits.coverLetter} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{w.add}</button>
      </div>
    </form>
  );
}

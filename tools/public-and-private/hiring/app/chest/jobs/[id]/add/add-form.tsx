"use client";

import { FilePicker, useToast, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format, languageNames } from "../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { languages, limits } from "../../../../../lib/model.ts";
import { cvKinds, cvMaxSize, uploadCv } from "../../../../../lib/upload.ts";
import { addCandidate } from "../../../actions.ts";

type Words = { addForm: Catalogue["addForm"]; apply: Catalogue["apply"]; candidate: Catalogue["candidate"]; errors: Catalogue["errors"]; files: FileWords };

export function AddForm({ jobId, stages, language, t }: { jobId: string; stages: { id: string; name: string }[]; language: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const cv = files.find(f => f.status === "ready" && f.ref);
  const sending = files.some(f => f.status === "sending");
  const [error, setError] = useState<string | null>(null);
  const w = t.addForm;

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "");
    setError(null);
    start(async () => {
      const r = await addCandidate(jobId, { name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), coverLetter: text("coverLetter"), language: text("language"), stageId: text("stage"), cv: cv?.ref ?? "", cvName: cv?.name ?? "" });
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
        <span className="label">{t.candidate.cv} <span className="optional">{t.apply.optional}</span></span>
        <FilePicker
          label={t.candidate.cv}
          files={files}
          onChange={setFiles}
          accept={cvKinds}
          maxFiles={1}
          maxSize={cvMaxSize}
          labels={t.files}
          upload={async file => {
            const sent = await uploadCv(file, "/chest/api/cv");
            return sent.ok ? { ok: true, ref: sent.ticket } : { ok: false, error: t.errors[sent.error === "cv_off" ? "unavailable" : sent.error] };
          }}
        />
      </div>
      <div className="field-block">
        <label className="label" htmlFor="coverLetter">{t.candidate.coverLetter} <span className="optional">{t.apply.optional}</span></label>
        <textarea id="coverLetter" name="coverLetter" className="field" rows={4} maxLength={limits.coverLetter} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || sending}>{w.add}</button>
      </div>
    </form>
  );
}

import { call, navigate, toast } from "@argentic/chest-app/client";
import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { cvKinds, cvMaxSize, uploadTeamFile, type UploadWords } from "../components/upload.ts";
import type { Catalogue } from "../i18n/index.ts";
import { format, languageNames } from "../shared/format.ts";
import { languages, limits, type Language } from "../shared/model.ts";

type Words = { addForm: Catalogue["addForm"]; apply: Catalogue["apply"]; candidate: { cv: string; coverLetter: string }; upload: UploadWords; files: FileWords };

export function AddForm({ jobId, stages, language, t }: { jobId: string; stages: { id: string; name: string }[]; language: string; t: Words }) {
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const cv = files.find(f => f.status === "ready" && f.ref);
  const sending = files.some(f => f.status === "sending");
  const [error, setError] = useState<string | null>(null);
  const w = t.addForm;

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "");
    setError(null);
    setPending(true);
    void call("addCandidate", { jobId, name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), coverLetter: text("coverLetter"), language: text("language") as Language, stage: text("stage"), cv: cv?.ref ?? "", cvName: cv?.name ?? "" }, { quiet: true, refresh: false }).then(async r => {
      setPending(false);
      if (!r.ok) return setError(r.message);
      toast(format(w.added, { name: text("name").trim() }));
      await navigate(`/chest/candidates/${r.value.id}`);
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
            const sent = await uploadTeamFile(file, t.upload);
            return sent.ok ? { ok: true, ref: sent.ref } : { ok: false, error: sent.error };
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

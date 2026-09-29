"use client";

import { FilePicker, filesReady, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useRef, useState, useTransition } from "react";
import { CopyButton } from "../../../components/copy-button.tsx";
import { Bin, Download, Pencil, Plus, Upload } from "../../../components/icons.tsx";
import { format, languageNames, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { languages, limits, retentionChoices } from "../../../lib/model.ts";
import { cvKinds, cvMaxSize, imageAccept, uploadCv, uploadImage } from "../../../lib/upload.ts";
import { removeTemplate, saveSettings, saveTemplate, setBrandImage } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; retention: Catalogue["retention"]; errors: Catalogue["errors"]; common: Catalogue["common"]; careers: Catalogue["careers"]; templatesWords: Catalogue["templates"]; files: Catalogue["files"] };
type Settings = { companyName: string; intros: Record<string, string>; careersOpen: boolean; retentionMonths: number; country: string; website: string; accent: string };
type TemplateFile = { file: string; name: string; type: string; size: number };
type Template = { id: string; name: string; language: string; subject: string; body: string; attachments: TemplateFile[] };
// A template's file already kept: in the picker, never sent again.
const storedFile = (a: TemplateFile): PickedFile => ({ key: a.file, name: a.name, size: a.size, type: a.type, file: null, status: "ready", progress: 1, ref: a.file, error: null, stored: true });

const accents = ["cobalt", "forest", "plum", "tomato", "ocean", "graphite"] as const;

export function SettingsView({ settings, fallbackName, address, feeds, logo, photos, templates, countryNames, look, locale, t }: {
  settings: Settings; fallbackName: string; address: string; feeds: { indeed: string; rss: string; sitemap: string };
  look: "own" | "brand"; logo: string | null; photos: { object: string; url: string }[]; templates: Template[]; countryNames: [string, string][]; locale: string; t: Words;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accent, setAccent] = useState(settings.accent);
  const w = t.settings;
  const words: Record<number, string> = { 6: t.retention.m6, 12: t.retention.m12, 24: t.retention.m24 };
  return (
    <div className="settings-stack">
      <form className="job-form" onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await saveSettings({
            companyName: String(data.get("companyName") ?? ""),
            intros: Object.fromEntries(languages.map(l => [l, String(data.get(`intro-${l}`) ?? "")])),
            careersOpen: data.get("careersOpen") === "on",
            retentionMonths: Number(data.get("retentionMonths")),
            country: String(data.get("country") ?? ""),
            website: String(data.get("website") ?? ""),
            accent,
          });
          if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
          toast(w.saved);
        });
      }}>
        <div className="panel address">
          <span className="label">{w.address}</span>
          <a href={address} target="_blank" rel="noopener">{address}</a>
          <CopyButton text={address} label={w.copy} done={t.common.copied} failed={t.common.copyFailed} />
        </div>
        <label className="check">
          <input type="checkbox" name="careersOpen" defaultChecked={settings.careersOpen} aria-describedby="open-hint" />
          <span>{w.open}</span>
        </label>
        <p className="hint tight" id="open-hint">{w.openHint}</p>
        <div className="two">
          <div className="field-block">
            <label className="label" htmlFor="companyName">{w.company}</label>
            <input id="companyName" name="companyName" className="field" maxLength={limits.companyName} defaultValue={settings.companyName} placeholder={fallbackName} aria-describedby="company-hint" />
            <p className="hint" id="company-hint">{w.companyHint}</p>
          </div>
          <div className="field-block">
            <label className="label" htmlFor="website">{w.website}</label>
            <input id="website" name="website" className="field" inputMode="url" maxLength={limits.website} defaultValue={settings.website} placeholder={w.websitePlaceholder} aria-describedby="website-hint" />
            <p className="hint" id="website-hint">{w.websiteHint}</p>
          </div>
        </div>
        <fieldset className="salary">
          <legend className="label">{w.intro}</legend>
          <p className="hint tight-top">{w.introHint}</p>
          {languages.map(l => (
            <div key={l} className="field-block">
              <label className="small-label" htmlFor={`intro-${l}`} lang={l}>{languageNames[l]}</label>
              <textarea id={`intro-${l}`} name={`intro-${l}`} lang={l} className="field" rows={3} maxLength={limits.intro} defaultValue={settings.intros[l] ?? ""} placeholder={w.introPlaceholder} />
            </div>
          ))}
        </fieldset>
        {/* One place for the careers page's brand: when the company has a
            brand in its Chest, the page wears it (logo, colours, fonts) and
            Hiring's own colour and logo step aside — said here, not hidden
            silently (critique round 2, N1). */}
        {look === "brand" ? <p className="notice">{w.brandFromChest}</p> : (
        <fieldset className="choices">
            <legend className="label">{w.accent}</legend>
            <div className="swatches">
              {accents.map(a => (
                <label key={a} className={`swatch${accent === a ? " on" : ""}`}>
                  <input type="radio" name="accent" value={a} checked={accent === a} onChange={() => setAccent(a)} />
                  <span className={`swatch-dot swatch-${a}`} aria-hidden="true" />
                  <span>{w.accents[a]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="two">
          <div className="field-block">
            <label className="label" htmlFor="country">{w.country}</label>
            <select id="country" name="country" className="field" defaultValue={settings.country} aria-describedby="country-hint">
              {countryNames.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <p className="hint" id="country-hint">{w.countryHint}</p>
          </div>
          <div className="field-block">
            <label className="label" htmlFor="retentionMonths">{w.retention}</label>
            <select id="retentionMonths" name="retentionMonths" className="field" defaultValue={settings.retentionMonths} aria-describedby="retention-hint">
              {retentionChoices.map(m => <option key={m} value={m}>{words[m]}</option>)}
            </select>
            <p className="hint" id="retention-hint">{w.retentionHint}</p>
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit" className="button" disabled={pending}>{w.save}</button></div>
      </form>

      <Images logo={logo} photos={photos} brandLogo={look === "brand"} t={t} />

      <section className="panel" aria-labelledby="reach">
        <h2 id="reach">{w.reach}</h2>
        <p className="hint tight-top">{w.reachHint}</p>
        <dl className="feeds">
          {([["indeed", feeds.indeed, w.feedIndeed], ["rss", feeds.rss, w.feedRss], ["sitemap", feeds.sitemap, w.feedSitemap]] as const).map(([key, url, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd><a href={url} target="_blank" rel="noopener">{url}</a> <CopyButton text={url} label={w.copy} done={t.common.copied} failed={t.common.copyFailed} className="button link small" /></dd>
            </div>
          ))}
        </dl>
        <p className="hint">{w.noAudience}</p>
      </section>

      <Templates templates={templates} locale={locale} t={t} />

      <section className="panel" aria-labelledby="leave">
        <h2 id="leave">{w.exportTitle}</h2>
        <p className="hint tight-top">{w.exportHint}</p>
        <div><a className="button quiet" href="/chest/export" download><Download />{w.exportAll}</a></div>
      </section>
    </div>
  );
}

// The logo and up to three photos of the careers page.
function Images({ logo, photos, brandLogo, t }: { logo: string | null; photos: { object: string; url: string }[]; brandLogo: boolean; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const logoInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const w = t.settings;
  const keep = photos.map(p => p.object);
  function send(which: "logo" | "photos", file: File) {
    start(async () => {
      const up = await uploadImage(file);
      if (!up.ok) return void toast({ text: t.errors[up.error === "cv_off" ? "unavailable" : up.error], tone: "error" });
      const r = await setBrandImage(which, up.ticket, keep);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
      toast(w.imageSaved);
    });
  }
  return (
    <section className="panel" aria-labelledby="images">
      <h2 id="images">{w.images}</h2>
      <p className="hint tight-top">{w.imagesHint}</p>
      {!brandLogo && <div className="image-row">
        <span className="label">{w.logo}</span>
        {logo ? <img className="logo-preview" src={logo} alt={w.logo} /> : <span className="muted small">{w.noLogo}</span>}
        <span className="panel-actions">
          <button type="button" className="button quiet small" disabled={pending} onClick={() => logoInput.current?.click()}><Upload />{logo ? w.replace : w.add}</button>
          {logo && <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => { const r = await setBrandImage("logo", null); if (!r.ok) toast({ text: t.errors[r.error], tone: "error" }); })}>{t.common.remove}</button>}
        </span>
      </div>}
      <div className="image-row">
        <span className="label">{w.photos}</span>
        <ul className="photo-list">
          {photos.map(p => (
            <li key={p.object}>
              <img src={p.url} alt="" />
              <button type="button" className="icon-button small" disabled={pending} title={t.common.remove} onClick={() => start(async () => { const r = await setBrandImage("photos", null, keep.filter(k => k !== p.object)); if (!r.ok) toast({ text: t.errors[r.error], tone: "error" }); })}><Bin /><span className="visually-hidden">{t.common.remove}</span></button>
            </li>
          ))}
        </ul>
        {photos.length < limits.photos && <button type="button" className="button quiet small" disabled={pending} onClick={() => photoInput.current?.click()}><Plus />{w.addPhoto}</button>}
      </div>
      <input ref={logoInput} type="file" accept={imageAccept} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) send("logo", f); }} />
      <input ref={photoInput} type="file" accept={imageAccept} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) send("photos", f); }} />
    </section>
  );
}

// The company's email templates: a name, a language, a subject, a text
// with {firstName}, {job}, {company}, {sender} — and files sent with each
// email written from it (the offer letter).
function Templates({ templates, locale, t }: { templates: Template[]; locale: string; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditingState] = useState<Template | null>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const setEditing = (x: Template | null) => { setEditingState(x); setFiles((x?.attachments ?? []).map(storedFile)); };
  const w = t.settings;
  return (
    <section className="panel" aria-labelledby="templates">
      <div className="panel-head">
        <h2 id="templates">{w.templates}</h2>
        {!editing && <button type="button" className="button quiet small" onClick={() => setEditing({ id: "", name: "", language: languages[0], subject: "", body: "", attachments: [] })}><Plus />{w.addTemplate}</button>}
      </div>
      <p className="hint tight-top">{w.templatesHint}</p>
      {templates.length === 0 && !editing && <p className="muted">{w.noTemplates}</p>}
      <ul className="people-list">
        {templates.map(x => (
          <li key={x.id}>
            <span className="person-name">{x.name}</span>
            <span className="muted small">{languageNames[x.language]}{x.attachments.length > 0 && <> · {plural(w.templateFileCount, x.attachments.length, locale)}</>}</span>
            <button type="button" className="button link small" onClick={() => setEditing(x)} aria-label={`${t.common.edit} · ${x.name}`}><Pencil />{t.common.edit}</button>
            <button type="button" className="button link small" disabled={pending} aria-label={`${t.common.delete} · ${x.name}`} onClick={() => start(async () => {
              const r = await removeTemplate(x.id);
              if (!r.ok) return void toast({ text: t.errors[r.error], tone: "error" });
              // Undo writes it again, word for word.
              toast({
                id: `template-${x.id}`,
                text: format(w.templateDeleted, { name: x.name }),
                undo: async () => {
                  const back = await saveTemplate({ name: x.name, language: x.language, subject: x.subject, body: x.body, keep: x.attachments.map(a => ({ file: a.file, name: a.name })) });
                  return back.ok || format(t.errors[back.error], back.values ?? {});
                },
              });
            })}><Bin />{t.common.delete}</button>
          </li>
        ))}
      </ul>
      {editing && (
        <form className="stack template-form" onSubmit={e => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const text = (k: string) => String(data.get(k) ?? "");
          start(async () => {
            const r = await saveTemplate({
              ...(editing.id ? { id: editing.id } : {}), name: text("name"), language: text("language"), subject: text("subject"), body: text("body"),
              files: files.filter(f => !f.stored && f.ref).map(f => ({ ticket: f.ref!, name: f.name })),
              keep: files.filter(f => f.stored && f.ref).map(f => ({ file: f.ref!, name: f.name })),
            });
            if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
            setEditing(null);
            toast(t.common.saved);
          });
        }}>
          <div className="two">
            <div className="field-block"><label className="small-label" htmlFor="tpl-name">{w.templateName}</label><input id="tpl-name" name="name" className="field" required maxLength={limits.templateName} defaultValue={editing.name} /></div>
            <div className="field-block"><label className="small-label" htmlFor="tpl-language">{w.templateLanguage}</label>
              <select id="tpl-language" name="language" className="field" defaultValue={editing.language}>{languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}</select></div>
          </div>
          <div className="field-block"><label className="small-label" htmlFor="tpl-subject">{w.templateSubject}</label><input id="tpl-subject" name="subject" className="field" required maxLength={limits.subject} defaultValue={editing.subject} /></div>
          <div className="field-block"><label className="small-label" htmlFor="tpl-body">{w.templateBody}</label><textarea id="tpl-body" name="body" className="field" rows={8} required maxLength={limits.emailText} defaultValue={editing.body} aria-describedby="tpl-hint" /><p className="hint" id="tpl-hint">{w.placeholders}</p></div>
          <div className="field-block">
            <span className="small-label">{w.templateFiles}</span>
            <FilePicker label={w.templateFiles} files={files} onChange={setFiles} accept={cvKinds} maxFiles={5} maxSize={cvMaxSize} labels={t.files}
              upload={async file => {
                const sent = await uploadCv(file, "/chest/api/cv");
                return sent.ok ? { ok: true, ref: sent.ticket } : { ok: false, error: t.errors[sent.error === "cv_off" ? "unavailable" : sent.error === "cv_invalid" ? "file_invalid" : sent.error] };
              }} />
            <p className="hint">{w.templateFilesHint}</p>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={pending || !filesReady(files)}>{t.common.save}</button>
            <button type="button" className="button quiet" onClick={() => setEditing(null)}>{t.common.cancel}</button>
          </div>
        </form>
      )}
    </section>
  );
}

"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRef, useState, useTransition } from "react";
import { CopyButton } from "../../../components/copy-button.tsx";
import { Bin, Download, Pencil, Plus, Upload } from "../../../components/icons.tsx";
import { format, languageNames } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { languages, limits, retentionChoices } from "../../../lib/model.ts";
import { imageAccept, uploadImage } from "../../../lib/upload.ts";
import { removeTemplate, saveSettings, saveTemplate, setBrandImage } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; retention: Catalogue["retention"]; errors: Catalogue["errors"]; common: Catalogue["common"]; careers: Catalogue["careers"]; templatesWords: Catalogue["templates"] };
type Settings = { companyName: string; intros: Record<string, string>; careersOpen: boolean; retentionMonths: number; country: string; website: string; accent: string };
type Template = { id: string; name: string; language: string; subject: string; body: string };

const accents = ["cobalt", "forest", "plum", "tomato", "ocean", "graphite"] as const;

export function SettingsView({ settings, fallbackName, address, feeds, logo, photos, templates, countryNames, look, t }: {
  settings: Settings; fallbackName: string; address: string; feeds: { indeed: string; rss: string; sitemap: string };
  look: "own" | "catalogue" | "brand"; logo: string | null; photos: { object: string; url: string }[]; templates: Template[]; countryNames: [string, string][]; t: Words;
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
        <fieldset className="choices">
          <legend className="label">{w.accent}</legend>
          {look !== "own" && <p className="hint tight-top">{w.lookNote}</p>}
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

      <Templates templates={templates} t={t} />

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
      {brandLogo && <p className="notice">{w.logoBrand}</p>}
      <div className="image-row">
        <span className="label">{w.logo}</span>
        {logo ? <img className="logo-preview" src={logo} alt={w.logo} /> : <span className="muted small">{w.noLogo}</span>}
        <span className="panel-actions">
          <button type="button" className="button quiet small" disabled={pending} onClick={() => logoInput.current?.click()}><Upload />{logo ? w.replace : w.add}</button>
          {logo && <button type="button" className="button link small" disabled={pending} onClick={() => start(async () => { const r = await setBrandImage("logo", null); if (!r.ok) toast({ text: t.errors[r.error], tone: "error" }); })}>{t.common.remove}</button>}
        </span>
      </div>
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
// with {firstName}, {job}, {company}, {sender}.
function Templates({ templates, t }: { templates: Template[]; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Template | null>(null);
  const w = t.settings;
  return (
    <section className="panel" aria-labelledby="templates">
      <div className="panel-head">
        <h2 id="templates">{w.templates}</h2>
        {!editing && <button type="button" className="button quiet small" onClick={() => setEditing({ id: "", name: "", language: languages[0], subject: "", body: "" })}><Plus />{w.addTemplate}</button>}
      </div>
      <p className="hint tight-top">{w.templatesHint}</p>
      {templates.length === 0 && !editing && <p className="muted">{w.noTemplates}</p>}
      <ul className="people-list">
        {templates.map(x => (
          <li key={x.id}>
            <span className="person-name">{x.name}</span>
            <span className="muted small">{languageNames[x.language]}</span>
            <button type="button" className="icon-button" onClick={() => setEditing(x)} title={t.common.edit}><Pencil /><span className="visually-hidden">{t.common.edit} · {x.name}</span></button>
            <button type="button" className="icon-button" disabled={pending} onClick={() => start(async () => {
              const r = await removeTemplate(x.id);
              if (!r.ok) return void toast({ text: t.errors[r.error], tone: "error" });
              // Undo writes it again, word for word.
              toast({
                id: `template-${x.id}`,
                text: format(w.templateDeleted, { name: x.name }),
                undo: async () => {
                  const back = await saveTemplate({ name: x.name, language: x.language, subject: x.subject, body: x.body });
                  return back.ok || format(t.errors[back.error], back.values ?? {});
                },
              });
            })} title={t.common.delete}><Bin /><span className="visually-hidden">{t.common.delete} · {x.name}</span></button>
          </li>
        ))}
      </ul>
      {editing && (
        <form className="stack template-form" onSubmit={e => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const text = (k: string) => String(data.get(k) ?? "");
          start(async () => {
            const r = await saveTemplate({ id: editing.id || undefined, name: text("name"), language: text("language"), subject: text("subject"), body: text("body") } as { id?: string; name: string; language: string; subject: string; body: string });
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
          <div className="form-actions">
            <button type="submit" className="button" disabled={pending}>{t.common.save}</button>
            <button type="button" className="button quiet" onClick={() => setEditing(null)}>{t.common.cancel}</button>
          </div>
        </form>
      )}
    </section>
  );
}

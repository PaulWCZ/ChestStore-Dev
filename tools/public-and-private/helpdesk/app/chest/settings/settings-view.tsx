"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useState, useTransition, type ReactNode } from "react";
import { Bin, Download, Globe, Mail, Quote, Tag } from "../../../components/icons.tsx";
import { format, languageNames, plural } from "../../../lib/i18n/format.ts";
import { locales, type Catalogue } from "../../../lib/i18n/index.ts";
import { limits } from "../../../lib/model.ts";
import { deleteTag, eraseCustomer, removeReply, renameTag, restoreTag, saveReply, saveSettings } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };

export function SettingsView({ settings, tags, locale, publicAddress, emailAddress, replies, canSettings, canTags, canReplies, canErase, canExport, erasures, after, languageLabels, t }: {
  languageLabels: Record<string, string>;
  settings: { companyName: string; formOpen: boolean; intros: Record<string, string>; retentionMonths: number; helpUrl: string };
  erasures: string[];
  after: ReactNode;
  tags: { id: string; name: string; tickets: number }[];
  locale: string;
  canTags: boolean;
  publicAddress: string;
  emailAddress: string | null;
  replies: { id: string; title: string; body: string }[];
  canSettings: boolean; canReplies: boolean; canErase: boolean; canExport: boolean;
  t: Words;
}) {
  const s = t.settings;
  const toast = useToast();
  const [, start] = useTransition();
  const [eraseEmail, setEraseEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [erasing, setErasing] = useState(false);
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done?: (value: unknown) => string, after?: () => void) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) return void toast({ text: format(t.errors[r.error], r.values ?? { max: 5000 }), tone: "error" });
      if (done) toast(done((r as { value?: unknown }).value));
      after?.();
    });
  // Erasing is for good (the customer's right to erasure): asked first, in
  // the page's own dialog — never the browser's.
  const erase = () => {
    setErasing(true);
    start(async () => {
      const r = await eraseCustomer(eraseEmail);
      setErasing(false);
      setAsking(false);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
      toast(plural(s.erased, r.value.tickets, locale));
      setEraseEmail("");
    });
  };
  return (
    <>
      <Box title={s.form} icon={<Globe />}>
        <p className="copy-line"><span className="muted">{s.address}</span><code>{publicAddress}</code></p>
        {emailAddress ? <p className="copy-line"><span className="muted">{s.emailAddress}</span><code>{emailAddress}</code></p> : <p className="notice warm"><Mail />{s.noMail}</p>}
        {!canSettings && <p className="hint">{s.readOnly}</p>}
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const intros = Object.fromEntries(locales.map(code => [code, String(d.get(`intro-${code}`) ?? "")]));
          run(() => saveSettings({ companyName: String(d.get("company") ?? ""), intros, helpUrl: String(d.get("help") ?? ""), formOpen: d.get("open") === "on", retentionMonths: Number(d.get("retention") ?? 24) }), () => s.saved);
        }}>
          <fieldset disabled={!canSettings} className="stack bare">
            <label className="switch"><input type="checkbox" name="open" defaultChecked={settings.formOpen} />{s.formOpen}</label>
            <div><label className="label" htmlFor="company">{s.company}</label><input id="company" name="company" className="field" maxLength={80} defaultValue={settings.companyName} /></div>
            {locales.map(code => (
              <div key={code}>
                <label className="label" htmlFor={`intro-${code}`}>{format(s.introIn, { language: languageLabels[code] ?? languageNames[code] ?? code })}</label>
                <textarea id={`intro-${code}`} name={`intro-${code}`} lang={code} className="field" rows={2} maxLength={500} defaultValue={settings.intros[code] ?? ""} aria-describedby={code === "en" ? undefined : `intro-${code}-hint`} />
                {code !== "en" && <p id={`intro-${code}-hint`} className="hint">{s.introFallback}</p>}
              </div>
            ))}
            <div>
              <label className="label" htmlFor="help">{s.helpUrl}</label>
              <input id="help" name="help" type="url" className="field" maxLength={300} defaultValue={settings.helpUrl} placeholder={s.helpPlaceholder} aria-describedby="help-hint" />
              <p id="help-hint" className="hint">{s.helpHint}</p>
            </div>
            <div><label className="label" htmlFor="retention">{s.retention}</label><input id="retention" name="retention" type="number" min={0} max={120} className="field narrow" defaultValue={settings.retentionMonths} /></div>
            {canSettings && <div><button type="submit" className="button">{s.save}</button></div>}
          </fieldset>
        </form>
      </Box>

      {after}

      <Box title={s.tags} icon={<Tag />}>
        <p className="hint">{tags.length === 0 ? s.noTags : s.tagsHint}</p>
        {tags.length > 0 && (
          <ul className="list-rows">
            {tags.map(g => (
              <li key={g.id + g.name}>
                <form className="row grow" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => renameTag(g.id, String(d.get("name") ?? "")), () => s.saved); }}>
                  <label className="visually-hidden" htmlFor={`tag-${g.id}`}>{s.tagName}</label>
                  <input id={`tag-${g.id}`} name="name" className="field grow" defaultValue={g.name} maxLength={limits.tag} required disabled={!canTags} />
                  <span className="small muted">{plural(s.tagCount, g.tickets, locale)}</span>
                  {canTags && <>
                    <button type="submit" className="button small quiet">{s.save}</button>
                    <button type="button" className="link-button danger" onClick={() => start(async () => {
                      const r = await deleteTag(g.id);
                      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
                      const gone = r.value;
                      toast({ id: `tag-${g.id}`, text: format(s.tagDeleted, { tag: gone.name }), undo: async () => { const back = await restoreTag(gone); return back.ok || t.errors[back.error]; } });
                    })}>{s.deleteTag}</button>
                  </>}
                </form>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box title={s.replies} icon={<Quote />}>
        <p className="hint">{s.repliesHint}</p>
        <ul className="list-rows">
          {replies.map(r => (
            <li key={r.id}>
              <form className="stack grow" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => saveReply({ id: r.id, title: String(d.get("title") ?? ""), body: String(d.get("body") ?? "") }), () => s.saved); }}>
                <label className="visually-hidden" htmlFor={`t-${r.id}`}>{s.replyTitle}</label>
                <input id={`t-${r.id}`} name="title" className="field" defaultValue={r.title} maxLength={80} disabled={!canReplies} />
                <label className="visually-hidden" htmlFor={`b-${r.id}`}>{s.replyBody}</label>
                <textarea id={`b-${r.id}`} name="body" className="field" rows={3} defaultValue={r.body} maxLength={5000} disabled={!canReplies} />
                {canReplies && <div className="row"><button type="submit" className="button small quiet">{s.save}</button><button type="button" className="link-button danger" onClick={() => start(async () => {
                  const x = await removeReply(r.id);
                  if (!x.ok) return void toast({ text: format(t.errors[x.error], {}), tone: "error" });
                  toast({ id: `reply-${r.id}`, text: format(s.replyDeleted, { title: r.title }), undo: async () => { const back = await saveReply({ title: r.title, body: r.body }); return back.ok || t.errors[back.error]; } });
                })}>{s.deleteReply}</button></div>}
              </form>
            </li>
          ))}
        </ul>
        {canReplies && (
          <form className="stack" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); run(() => saveReply({ title: String(d.get("title") ?? ""), body: String(d.get("body") ?? "") }), undefined, () => form.reset()); }}>
            <div><label className="label" htmlFor="new-title">{s.replyTitle}</label><input id="new-title" name="title" className="field" maxLength={80} required /></div>
            <div><label className="label" htmlFor="new-body">{s.replyBody}</label><textarea id="new-body" name="body" className="field" rows={3} maxLength={5000} required /></div>
            <div><button type="submit" className="button soft">{s.addReply}</button></div>
          </form>
        )}
      </Box>

      {canExport && (
        <Box title={s.export} icon={<Download />}>
          <p className="hint">{s.exportHint}</p>
          <div><a className="button quiet" href="/chest/export"><Download />{s.exportZip}</a></div>
        </Box>
      )}

      {canErase && (
        <Box title={s.erase} icon={<Bin />}>
          <p className="hint">{s.eraseHint}</p>
          <form className="row" onSubmit={e => { e.preventDefault(); setAsking(true); }}>
            <label className="visually-hidden" htmlFor="erase">{s.erase}</label>
            <input id="erase" type="email" className="field grow" value={eraseEmail} onChange={e => setEraseEmail(e.target.value)} required />
            <button type="submit" className="button danger">{s.eraseButton}</button>
          </form>
          <Confirm open={asking} title={s.eraseTitle} body={format(s.eraseBody, { email: eraseEmail.trim() })} confirmLabel={s.eraseButton} cancelLabel={s.cancel}
            busy={erasing} onConfirm={erase} onCancel={() => setAsking(false)} />
          {erasures.length > 0 && (
            <div className="stack">
              <h3>{s.erasures}</h3>
              <ul className="small muted">{erasures.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </div>
          )}
        </Box>
      )}
    </>
  );
}

export function Box({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="box"><h2 className="row">{icon}{title}</h2>{children}</section>;
}

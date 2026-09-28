"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Bin, Clock, Download, Globe, Mail, Quote, Tag } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { lateChoices, limits } from "../../../lib/model.ts";
import { deleteTag, eraseCustomer, removeReply, renameTag, restoreTag, saveReply, saveSettings } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };

export function SettingsView({ settings, tags, locale, publicAddress, emailAddress, replies, canSettings, canTags, canReplies, canErase, canExport, t }: {
  settings: { companyName: string; formOpen: boolean; intro: string; retentionMonths: number; lateHours: number };
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
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done?: (value: unknown) => string, after?: () => void) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) return toast(format(t.errors[r.error], r.values ?? { max: 5000 }));
      if (done) toast(done((r as { value?: unknown }).value));
      after?.();
    });
  return (
    <>
      <Box title={s.form} icon={<Globe />}>
        <p className="copy-line"><span className="muted">{s.address}</span><code>{publicAddress}</code></p>
        {emailAddress ? <p className="copy-line"><span className="muted">{s.emailAddress}</span><code>{emailAddress}</code></p> : <p className="notice warm"><Mail />{s.noMail}</p>}
        {!canSettings && <p className="hint">{s.readOnly}</p>}
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          run(() => saveSettings({ companyName: String(d.get("company") ?? ""), intro: String(d.get("intro") ?? ""), formOpen: d.get("open") === "on", retentionMonths: Number(d.get("retention") ?? 24) }), () => s.saved);
        }}>
          <fieldset disabled={!canSettings} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <label className="switch"><input type="checkbox" name="open" defaultChecked={settings.formOpen} />{s.formOpen}</label>
            <div><label className="label" htmlFor="company">{s.company}</label><input id="company" name="company" className="field" maxLength={80} defaultValue={settings.companyName} /></div>
            <div><label className="label" htmlFor="intro">{s.intro}</label><textarea id="intro" name="intro" className="field" rows={2} maxLength={500} defaultValue={settings.intro} /></div>
            <div><label className="label" htmlFor="retention">{s.retention}</label><input id="retention" name="retention" type="number" min={0} max={120} className="field" style={{ maxWidth: 140 }} defaultValue={settings.retentionMonths} /></div>
            {canSettings && <div><button type="submit" className="button">{s.save}</button></div>}
          </fieldset>
        </form>
      </Box>

      <Box title={s.late} icon={<Clock />}>
        <div>
          <label className="label" htmlFor="late">{s.lateLabel}</label>
          <select id="late" className="select" style={{ maxWidth: 220 }} defaultValue={settings.lateHours} disabled={!canSettings}
            onChange={e => { const hours = Number(e.target.value); run(() => saveSettings({ lateHours: hours }), () => s.saved); }}>
            {lateChoices.map(h => <option key={h} value={h}>{h === 0 ? s.lateNever : plural(s.lateHours, h, locale)}</option>)}
          </select>
          <p className="hint" style={{ marginTop: "var(--space-1)" }}>{s.lateHint}</p>
        </div>
      </Box>

      <Box title={s.tags} icon={<Tag />}>
        <p className="hint">{tags.length === 0 ? s.noTags : s.tagsHint}</p>
        {tags.length > 0 && (
          <ul className="list-rows">
            {tags.map(g => (
              <li key={g.id + g.name}>
                <form className="row" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => renameTag(g.id, String(d.get("name") ?? "")), () => s.saved); }}>
                  <label className="visually-hidden" htmlFor={`tag-${g.id}`}>{s.tagName}</label>
                  <input id={`tag-${g.id}`} name="name" className="field" style={{ flex: 1, minWidth: 160 }} defaultValue={g.name} maxLength={limits.tag} required disabled={!canTags} />
                  <span className="small muted">{plural(s.tagCount, g.tickets, locale)}</span>
                  {canTags && <>
                    <button type="submit" className="button small quiet">{s.save}</button>
                    <button type="button" className="link-button danger" onClick={() => start(async () => {
                      const r = await deleteTag(g.id);
                      if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
                      const gone = r.value;
                      toast(format(s.tagDeleted, { tag: gone.name }), { label: s.undo, run: () => start(async () => { await restoreTag(gone); }) });
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
              <form className="stack" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => saveReply({ id: r.id, title: String(d.get("title") ?? ""), body: String(d.get("body") ?? "") }), () => s.saved); }}>
                <label className="visually-hidden" htmlFor={`t-${r.id}`}>{s.replyTitle}</label>
                <input id={`t-${r.id}`} name="title" className="field" defaultValue={r.title} maxLength={80} disabled={!canReplies} />
                <label className="visually-hidden" htmlFor={`b-${r.id}`}>{s.replyBody}</label>
                <textarea id={`b-${r.id}`} name="body" className="field" rows={3} defaultValue={r.body} maxLength={5000} disabled={!canReplies} />
                {canReplies && <div className="row"><button type="submit" className="button small quiet">{s.save}</button><button type="button" className="link-button danger" onClick={() => run(() => removeReply(r.id))}>{s.remove}</button></div>}
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
          <div><a className="button quiet" href="/chest/export"><Download />{s.exportCsv}</a></div>
        </Box>
      )}

      {canErase && (
        <Box title={s.erase} icon={<Bin />}>
          <p className="hint">{s.eraseHint}</p>
          <form className="row" onSubmit={e => { e.preventDefault(); run(() => eraseCustomer(eraseEmail), v => plural(s.erased, (v as { tickets: number }).tickets, locale), () => setEraseEmail("")); }}>
            <label className="visually-hidden" htmlFor="erase">{s.erase}</label>
            <input id="erase" type="email" className="field" style={{ flex: 1, minWidth: 220 }} value={eraseEmail} onChange={e => setEraseEmail(e.target.value)} required />
            <button type="submit" className="button danger">{s.eraseButton}</button>
          </form>
        </Box>
      )}
    </>
  );
}

function Box({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="box"><h2 className="row">{icon}{title}</h2>{children}</section>;
}

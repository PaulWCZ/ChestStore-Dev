"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Globe, Mask, Users } from "../../../../../../components/icons.tsx";
import { useToast } from "../../../../../../components/toast.tsx";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../../../lib/i18n/format.ts";
import { accents, retentions, type Accent, type Audience, type Layout } from "../../../../../../lib/model.ts";
import { closeForm, deleteForm, duplicateForm, reopenForm, saveSettings } from "../../../../actions.ts";

type Values = {
  audience: Audience; anonymous: boolean; once: boolean; tellTeam: boolean; layout: Layout; accent: Accent;
  closesDay: string; closesHour: number; maxAnswers: string; thanksTitle: string; thanksBody: string; redirectUrl: string;
  sendCopy: boolean; retentionMonths: string; watchers: string[];
};
type Props = {
  formId: string;
  canEdit: boolean;
  canDelete: boolean;
  status: "draft" | "published" | "closed";
  version: number;
  initial: Values;
  anonymityLocked: boolean;
  hasFiles: boolean;
  people: { id: string; name: string }[];
  zoneNote: string;
  locale: string;
  t: { s: Catalogue["settings"]; errors: Catalogue["errors"]; b: Catalogue["builder"] };
};

export function SettingsView(p: Props) {
  const { s, b } = p.t;
  const [v, setV] = useState<Values>(p.initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ro = !p.canEdit;
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV(x => ({ ...x, [k]: value }));
  const who = v.audience === "public" ? "public" : v.anonymous ? "anonymous" : "team";
  const error = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(p.t.errors[code] ?? p.t.errors.unknown, values ?? {}));

  const save = () => start(async () => {
    const r = await saveSettings(p.formId, JSON.stringify({
      ...v,
      maxAnswers: v.maxAnswers.trim() === "" ? null : Number(v.maxAnswers),
      retentionMonths: v.retentionMonths === "" ? null : Number(v.retentionMonths),
    }));
    if (r.ok) {
      toast(s.saved);
      router.refresh();
    } else error(r.error, r.values);
  });
  const run = (action: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done: string) => start(async () => {
    const r = await action();
    if (r.ok) {
      toast(done);
      router.refresh();
    } else if (r.error) error(r.error, r.values);
  });

  const whoChoice = (value: "public" | "team" | "anonymous", icon: ReactNode, title: string, hint: string) => {
    const lockedOut = (p.anonymityLocked && (value === "anonymous") !== p.initial.anonymous) || (value === "anonymous" && p.hasFiles);
    return (
      <label className={`choice-card${who === value ? " on" : ""}${lockedOut ? " off" : ""}`}>
        <input type="radio" name="who" checked={who === value} disabled={ro || lockedOut} onChange={() => setV(x => ({ ...x, audience: value === "public" ? "public" : "team", anonymous: value === "anonymous", sendCopy: value === "anonymous" ? false : x.sendCopy, once: value === "anonymous" ? true : x.once }))} />
        <span className="choice-icon" aria-hidden="true">{icon}</span>
        <span className="choice-text"><strong>{title}</strong><small>{hint}</small></span>
      </label>
    );
  };

  return (
    <form className="panel-page settings" onSubmit={e => { e.preventDefault(); save(); }}>
      <fieldset className="panel" disabled={ro}>
        <legend>{s.who}</legend>
        <div className="choice-cards">
          {whoChoice("public", <Globe />, s.whoPublic, s.whoPublicHint)}
          {whoChoice("team", <Users />, s.whoTeam, s.whoTeamHint)}
          {whoChoice("anonymous", <Mask />, s.whoAnonymous, s.whoAnonymousHint)}
        </div>
        {p.anonymityLocked && <p className="hint">{s.anonymousLocked}</p>}
        {p.hasFiles && !v.anonymous && <p className="hint">{p.t.errors.anonymous_files}</p>}
        {v.audience === "team" && !v.anonymous && (
          <label className="switch"><input type="checkbox" role="switch" checked={v.once} onChange={e => set("once", e.target.checked)} /><span className="switch-track" aria-hidden="true" />{s.once}</label>
        )}
        {v.audience === "team" && (
          <label className="switch"><input type="checkbox" role="switch" checked={v.tellTeam} onChange={e => set("tellTeam", e.target.checked)} /><span className="switch-track" aria-hidden="true" />{s.tellTeam}</label>
        )}
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.look}</legend>
        <div className="choice-cards two">
          {(["steps", "classic"] as const).map(l => (
            <label key={l} className={`choice-card layout-card${v.layout === l ? " on" : ""}`}>
              <input type="radio" name="layout" checked={v.layout === l} onChange={() => set("layout", l)} />
              <span className={`layout-art ${l}`} aria-hidden="true"><span /><span /><span /></span>
              <span className="choice-text"><strong>{l === "steps" ? s.layoutSteps : s.layoutClassic}</strong><small>{l === "steps" ? s.layoutStepsHint : s.layoutClassicHint}</small></span>
            </label>
          ))}
        </div>
        <div className="swatches" role="radiogroup" aria-label={s.colour}>
          <span className="mini-label" aria-hidden="true">{s.colour}</span>
          {accents.map(a => (
            <label key={a} className={`swatch${v.accent === a ? " on" : ""}`} data-accent={a}>
              <input type="radio" name="accent" checked={v.accent === a} onChange={() => set("accent", a)} />
              <span className="swatch-dot" aria-hidden="true" />
              <span className="visually-hidden">{s.colours[a]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.taking}</legend>
        <div className="row-fields">
          <label className="mini">
            <span className="mini-label">{s.closesOn}</span>
            <input className="field" type="date" value={v.closesDay} onChange={e => set("closesDay", e.target.value)} />
          </label>
          {v.closesDay && (
            <label className="mini">
              <span className="mini-label">{s.closesAt}</span>
              <select className="field" value={v.closesHour} onChange={e => set("closesHour", Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{format(s.hour, { hour: String(h).padStart(2, "0") })}</option>)}
              </select>
            </label>
          )}
          {v.closesDay && <button type="button" className="button link" onClick={() => set("closesDay", "")}>{s.closesNever}</button>}
        </div>
        {v.closesDay && <p className="hint">{p.zoneNote}</p>}
        <label className="mini inline">
          <span className="mini-label">{s.limit}</span>
          <input className="field number" inputMode="numeric" value={v.maxAnswers} placeholder={s.limitNone} onChange={e => /^\d{0,6}$/u.test(e.target.value) && set("maxAnswers", e.target.value)} />
          <span className="suffix">{s.limitSuffix}</span>
        </label>
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.after}</legend>
        <label className="mini block">
          <span className="mini-label">{s.thanksTitle}</span>
          <input className="field" value={v.thanksTitle} maxLength={120} placeholder={s.thanksTitlePlaceholder} onChange={e => set("thanksTitle", e.target.value)} />
        </label>
        <label className="mini block">
          <span className="mini-label">{s.thanksBody}</span>
          <textarea className="field" rows={3} value={v.thanksBody} maxLength={1000} placeholder={s.thanksBodyPlaceholder} onChange={e => set("thanksBody", e.target.value)} />
        </label>
        <label className="mini block">
          <span className="mini-label">{s.redirect}</span>
          <input className="field" type="url" inputMode="url" value={v.redirectUrl} maxLength={2000} placeholder={s.redirectPlaceholder} onChange={e => set("redirectUrl", e.target.value)} />
        </label>
        {v.anonymous ? <p className="hint">{s.sendCopyAnonymous}</p> : (
          <label className="switch">
            <input type="checkbox" role="switch" checked={v.sendCopy} onChange={e => set("sendCopy", e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span>{v.audience === "team" ? s.sendCopyTeam : s.sendCopy}{v.audience === "public" && <small className="switch-hint">{s.sendCopyHint}</small>}</span>
          </label>
        )}
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.bell}</legend>
        <p className="hint">{s.bellHint}</p>
        <div className="checks">
          {p.people.map(x => (
            <label key={x.id} className="check">
              <input type="checkbox" checked={v.watchers.includes(x.id)} onChange={e => set("watchers", e.target.checked ? [...v.watchers, x.id] : v.watchers.filter(w => w !== x.id))} />
              {x.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.privacy}</legend>
        <label className="mini inline">
          <span className="visually-hidden">{s.privacy}</span>
          <select className="field" value={v.retentionMonths} onChange={e => set("retentionMonths", e.target.value)}>
            <option value="">{s.keepForever}</option>
            {retentions.map(m => <option key={m} value={String(m)}>{plural(s.keepMonths, m, p.locale)}</option>)}
          </select>
        </label>
        <p className="hint">{s.privacyHint}</p>
      </fieldset>

      {!ro && (
        <div className="save-bar">
          <button type="submit" className="button" disabled={pending}>{pending ? s.saving : s.save}</button>
        </div>
      )}

      <section className="panel quiet-panel" aria-labelledby="form-actions">
        <h2 id="form-actions">{s.danger}</h2>
        <div className="row-actions">
          {!ro && p.status === "published" && <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => closeForm(p.formId), b.closedToast)}>{b.closeForm}</button>}
          {!ro && p.status === "closed" && p.version > 0 && <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => reopenForm(p.formId), b.reopened)}>{b.reopen}</button>}
          <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => { const r = await duplicateForm(p.formId); if (r && !r.ok) error(r.error, r.values); })}>{b.duplicateForm}</button>
          {p.canDelete && <button type="button" className="button quiet danger" disabled={pending} onClick={() => start(async () => { const r = await deleteForm(p.formId); if (r.ok) router.push(`/chest?deleted=${p.formId}`); else error(r.error, r.values); })}>{b.deleteForm}</button>}
        </div>
      </section>
    </form>
  );
}

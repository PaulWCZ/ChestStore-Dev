"use client";

import { DateField, Switch, TimeSelect, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Globe, Mask, Picture, Users } from "../../../../../../components/icons.tsx";
import type { ErrorCode } from "../../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../../../lib/i18n/format.ts";
import { holdLeaving } from "../../../../../../lib/leave-guard.ts";
import { accents, retentions, type Accent, type Audience, type Layout } from "../../../../../../lib/model.ts";
import type { ContactRoute, RequestRoute, Routes } from "../../../../../../lib/routes.ts";
import { uploadImage } from "../../../../../../lib/upload-client.ts";
import { deleteForm, duplicateForm, saveSettings, setCover } from "../../../../actions.ts";

// Settings save by themselves, like the questions: a moment after the last
// change, and at once before a tab or link of the tool leaves the page.
// One model for the whole tool — nothing here waits for a Save button.

type Values = {
  audience: Audience; anonymous: boolean; once: boolean; tellTeam: boolean; layout: Layout; accent: Accent;
  closesDay: string; closesHour: number; maxAnswers: string; thanksTitle: string; thanksBody: string; redirectUrl: string;
  sendCopy: boolean; retentionMonths: string; watchers: string[]; notifyEmail: boolean; shareEvents: boolean;
  routes: Routes;
};
// The questions that may give each piece of a contact or a ticket
// (lib/routes.ts contactSlots, requestSlots), written by the server.
export type RouteChoices = { contact: Record<keyof ContactRoute, { id: string; title: string }[]>; request: Record<keyof RequestRoute, { id: string; title: string }[]> };
const emptyContact: ContactRoute = { name: null, email: null, phone: null, company: null, message: null };
const emptyRequest: RequestRoute = { subject: null, details: null, email: null, name: null };
type Props = {
  formId: string;
  canEdit: boolean;
  canDelete: boolean;
  initial: Values;
  anonymityLocked: boolean;
  hasFiles: boolean;
  people: { id: string; name: string }[];
  zoneNote: string;
  locale: string;
  mailWorks: boolean | null;
  cover: string | null;
  // Today on the Chest's clock (the earliest closing day).
  today: string;
  // Whether the page wears Forms' own look (the default colour's name).
  own: boolean;
  routeChoices: RouteChoices;
  // The first guess of each piece when a link is turned on (lib/routes.ts
  // guessRoutes), and which receiving tools this Chest has (lib/linked.ts).
  routeGuess: Routes;
  installed: { contact: boolean; request: boolean };
  // The form's web addresses (hooks-box.tsx), placed after the links.
  hooks?: ReactNode;
  t: { s: Catalogue["settings"]; errors: Catalogue["errors"]; b: Catalogue["builder"]; date: Catalogue["date"] };
};
type SaveState = "saved" | "saving" | "error" | "held";

export function SettingsView(p: Props) {
  const { s, b } = p.t;
  const [v, setV] = useState<Values>(p.initial);
  const [save, setSave] = useState<SaveState>("saved");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cover, setCoverUrl] = useState(p.cover);
  const [sendingCover, setSendingCover] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const hourId = useId();
  const ro = !p.canEdit;
  const latest = useRef(v);
  latest.current = v;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiting = useRef(false);
  const first = useRef(true);
  const lastAudience = useRef(p.initial.audience + p.initial.anonymous);
  // A closing day the field refuses as typed (unreadable, or before
  // today): the field says why (kit 0.2.4), its onChange is not called, so
  // `v` still holds the previous day. Nothing is saved while it stands —
  // any other change would otherwise go out with that previous day, as if
  // it were what was typed — and the page says so. Corrected, all that
  // waited is saved.
  const refusedDay = useRef(false);
  const onDayProblem = useCallback((problem: string | null) => {
    const was = refusedDay.current;
    refusedDay.current = problem !== null;
    if (problem !== null) {
      clearTimeout(timer.current);
      setSave("held");
    } else if (was) setV(x => ({ ...x }));
  }, []);
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV(x => ({ ...x, [k]: value }));
  const who = v.audience === "public" ? "public" : v.anonymous ? "anonymous" : "team";
  const words = (code: ErrorCode, values?: Record<string, string | number>) => format(p.t.errors[code] ?? p.t.errors.unknown, values ?? {});

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (refusedDay.current) {
      waiting.current = true;
      setSave("held");
      return false;
    }
    waiting.current = false;
    const now = latest.current;
    setSave("saving");
    const r = await saveSettings(p.formId, JSON.stringify({
      ...now,
      maxAnswers: now.maxAnswers.trim() === "" ? null : Number(now.maxAnswers),
      retentionMonths: now.retentionMonths === "" ? null : Number(now.retentionMonths),
    })).catch(() => ({ ok: false as const, error: "unavailable" as ErrorCode, values: undefined }));
    if (!r.ok) {
      setSave("error");
      setProblem(words(r.error, r.values));
      return false;
    }
    setProblem(null);
    setSave(latest.current === now ? "saved" : "saving");
    // Who answers shows in the form's header: it follows.
    const audience = now.audience + now.anonymous;
    if (audience !== lastAudience.current) {
      lastAudience.current = audience;
      router.refresh();
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.formId, router]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (ro) return;
    waiting.current = true;
    if (refusedDay.current) return setSave("held");
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }, [v, ro, flush]);

  useEffect(() => holdLeaving(async () => (waiting.current || save === "error" || save === "held" ? flush() : true)), [flush, save]);
  useEffect(() => () => {
    // Left by the app's own navigation with a change waiting: it goes now.
    if (waiting.current) void flush();
  }, [flush]);

  const run = (action: () => Promise<{ ok: boolean; error?: ErrorCode; values?: Record<string, string | number> }>, done?: string) => start(async () => {
    const r = await action();
    if (r.ok) {
      if (done) toast({ id: "settings", text: done });
      router.refresh();
    } else if (r.error) toast({ id: "settings", text: words(r.error, r.values), tone: "error" });
  });

  async function pickCover(file: File) {
    setSendingCover(true);
    const sent = await uploadImage(file, p.formId);
    if (!sent.ok) {
      setSendingCover(false);
      return void toast({ id: "cover", text: words(sent.error), tone: "error" });
    }
    const r = await setCover(p.formId, sent.ref);
    setSendingCover(false);
    if (!r.ok) return void toast({ id: "cover", text: words(r.error, r.values), tone: "error" });
    setCoverUrl(r.value.url);
    toast({ id: "cover", text: s.coverSaved });
  }

  const whoChoice = (value: "public" | "team" | "anonymous", icon: ReactNode, title: string, hint: string) => {
    const lockedOut = (p.anonymityLocked && (value === "anonymous") !== p.initial.anonymous) || (value === "anonymous" && p.hasFiles);
    return (
      <label className={`choice-card${who === value ? " on" : ""}${lockedOut ? " off" : ""}`}>
        <input type="radio" name="who" checked={who === value} disabled={ro || lockedOut} onChange={() => setV(x => ({ ...x, audience: value === "public" ? "public" : "team", anonymous: value === "anonymous", sendCopy: value === "anonymous" ? false : x.sendCopy, shareEvents: value === "anonymous" ? false : x.shareEvents, routes: value === "anonymous" ? { contact: null, request: null } : x.routes, once: value === "anonymous" ? true : x.once }))} />
        <span className="choice-icon" aria-hidden="true">{icon}</span>
        <span className="choice-text"><strong>{title}</strong><small>{hint}</small></span>
      </label>
    );
  };

  const saveLabel = save === "saving" ? s.saving : save === "saved" ? s.savedState : s.unsaved;
  // Said beside the status, never under the field: the sentence under it
  // is the kit's, and this line going moves nothing below the field.
  const said = save === "held" ? s.dayHeld : problem;
  return (
    <form className="panel-page settings" onSubmit={e => { e.preventDefault(); void flush(); }}>
      {!ro && (
        <p className="settings-status">
          <span className={`save-state ${save}`} role="status" aria-live="polite">{saveLabel}</span>
          {said && <span className="settings-problem" role={save === "held" ? undefined : "alert"}>{said}</span>}
          {save === "error" && <button type="button" className="button link" onClick={() => void flush()}>{b.retry}</button>}
        </p>
      )}
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
          <Switch label={s.once} hint={s.onceHint} checked={v.once} onChange={on => set("once", on)} />
        )}
        {v.audience === "team" && (
          <Switch label={s.tellTeam} checked={v.tellTeam} onChange={on => set("tellTeam", on)} />
        )}
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.look}</legend>
        <div className="choice-cards two">
          {(["steps", "classic"] as const).map(l => (
            <label key={l} className={`choice-card layout-card${v.layout === l ? " on" : ""}`}>
              <input type="radio" name="layout" checked={v.layout === l} onChange={() => set("layout", l)} />
              <span className={`layout-art art-${l}`} aria-hidden="true"><span /><span /><span /></span>
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
              <span className="visually-hidden">{a === "berry" && !p.own ? s.colours.look : s.colours[a]}</span>
            </label>
          ))}
        </div>
        {!p.own && <p className="hint">{s.colourHint}</p>}
        <div className="cover-field">
          <span className="mini-label">{s.cover}</span>
          <div className="cover-row">
            <span className="cover-preview" aria-hidden="true">{cover ? <img src={cover} alt="" /> : <Picture />}</span>
            {!ro && (
              <label className={`button quiet small file-button${sendingCover ? " busy" : ""}`}>
                {sendingCover ? s.coverSending : cover ? s.coverChange : s.coverAdd}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={sendingCover} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickCover(f); }} />
              </label>
            )}
            {!ro && cover && <button type="button" className="button link" onClick={() => start(async () => { const r = await setCover(p.formId, null); if (r.ok) { setCoverUrl(null); toast({ id: "cover", text: s.coverRemoved }); } else toast({ id: "cover", text: words(r.error), tone: "error" }); })}>{s.coverRemove}</button>}
          </div>
          <p className="hint">{s.coverHint}</p>
        </div>
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.taking}</legend>
        <div className="row-fields">
          <div className="mini closes-day">
            <DateField label={s.closesOn} value={v.closesDay || null} onChange={d => set("closesDay", d ?? "")} onProblem={onDayProblem} today={p.today} min={v.closesDay && v.closesDay < p.today ? null : p.today} disabled={ro} labels={p.t.date} />
          </div>
          {v.closesDay && (
            <div className="mini">
              <label className="mini-label" htmlFor={hourId}>{s.closesAt}</label>
              <TimeSelect id={hourId} step={60} max={1380} value={v.closesHour * 60} onChange={m => set("closesHour", Math.floor(m / 60))} disabled={ro} />
            </div>
          )}
          {v.closesDay && !ro && <button type="button" className="button link" onClick={() => set("closesDay", "")}>{s.closesNever}</button>}
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
          <Switch label={v.audience === "team" ? s.sendCopyTeam : s.sendCopy} hint={v.routes.request && p.installed.request ? s.supportConfirms : v.audience === "public" ? s.sendCopyHint : undefined} checked={v.sendCopy} onChange={on => set("sendCopy", on)} />
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
        <Switch label={s.notifyEmail} hint={v.anonymous ? s.notifyEmailAnonymous : s.notifyEmailHint} checked={v.notifyEmail} onChange={on => set("notifyEmail", on)} />
        {v.notifyEmail && p.mailWorks === false && <p className="notice">{s.mailOff}</p>}
      </fieldset>

      <fieldset className="panel" disabled={ro}>
        <legend>{s.tools}</legend>
        {v.anonymous ? <p className="hint">{s.toolsAnonymous}</p> : (
          <>
            {/* A contact in Clients: the form's author says which question
                gives what (lib/routes.ts, README "With the other tools"). */}
            {/* Greyed while Clients is not installed (chest.toolUrl), unless
                already on: it can always be turned off. */}
            <Switch label={s.contactSwitch} hint={p.installed.contact ? s.contactHint : s.contactMissing} checked={v.routes.contact !== null} disabled={ro || (!p.installed.contact && v.routes.contact === null)}
              onChange={on => set("routes", { ...v.routes, contact: on ? { ...emptyContact, ...p.routeGuess.contact } : null })} />
            {v.routes.contact && (
              <RouteFields slots={["name", "email", "phone", "company", "message"] as const} route={v.routes.contact} choices={p.routeChoices.contact} s={s}
                onChange={contact => set("routes", { ...v.routes, contact })} />
            )}
            {v.routes.contact && p.routeChoices.contact.email.length + p.routeChoices.contact.phone.length === 0 && <p className="notice">{s.noQuestions}</p>}
            <Switch label={s.requestSwitch} hint={p.installed.request ? s.requestHint : s.requestMissing} checked={v.routes.request !== null} disabled={ro || (!p.installed.request && v.routes.request === null)}
              onChange={on => set("routes", { ...v.routes, request: on ? { ...emptyRequest, ...p.routeGuess.request } : null })} />
            {v.routes.request && (
              <RouteFields slots={v.audience === "team" ? (["subject", "details"] as const) : (["subject", "details", "email", "name"] as const)} route={v.routes.request} choices={p.routeChoices.request} s={s}
                special={{ subject: s.routeTitle }} member={v.audience === "team" ? s.routeMember : null}
                onChange={request => set("routes", { ...v.routes, request })} />
            )}
            {(v.routes.contact || v.routes.request) && <p className="hint">{s.routeLinked}</p>}
            <Switch label={s.toolsSwitch} hint={s.toolsHint} checked={v.shareEvents} onChange={on => set("shareEvents", on)} />
          </>
        )}
      </fieldset>

      {p.hooks}

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

      <section className="panel quiet-panel" aria-labelledby="form-actions">
        <h2 id="form-actions">{s.danger}</h2>
        <div className="row-actions">
          <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => { const r = await duplicateForm(p.formId); if (r && !r.ok) toast({ id: "duplicate", text: words(r.error, r.values), tone: "error" }); })}>{b.duplicateForm}</button>
          {/* Deleting asks nothing: the form waits 30 days in Deleted
              forms, and the home page's toast offers Undo. */}
          {p.canDelete && <button type="button" className="button quiet danger" disabled={pending} onClick={() => run(() => deleteGo())}>{b.deleteForm}</button>}
        </div>
      </section>
    </form>
  );

  async function deleteGo() {
    const r = await deleteForm(p.formId);
    if (r.ok) router.push(`/chest?deleted=${p.formId}`);
    return r;
  }
}

// Which question gives each piece: one select per piece, its questions
// only (an email from an email question…). special: a choice that is not a
// question ("The form's title" for a ticket's subject); member: who asks
// on a team form (said, not chosen).
function RouteFields<K extends string>({ slots, route, choices, s, special = {}, member = null, onChange }: {
  slots: readonly K[];
  route: Record<K, string | null>;
  choices: Record<K, { id: string; title: string }[]>;
  s: Catalogue["settings"];
  special?: Partial<Record<K, string>>;
  member?: string | null;
  onChange: (route: Record<K, string | null>) => void;
}) {
  const base = useId();
  const words = s.routeSlots as Record<string, string>;
  return (
    <div className="route-fields">
      {slots.map(key => (
        <label key={key} className="mini" htmlFor={`${base}-${key}`}>
          <span className="mini-label">{words[key]}</span>
          <select id={`${base}-${key}`} className="field" value={route[key] ?? ""} onChange={e => onChange({ ...route, [key]: e.target.value || null })}>
            <option value="">{special[key] ?? s.routeNone}</option>
            {choices[key].map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </label>
      ))}
      {member && <p className="hint route-member">{words["email"]}{" — "}{member}</p>}
    </div>
  );
}

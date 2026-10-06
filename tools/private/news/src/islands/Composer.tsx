import { Checkbox, DateField, PeoplePicker, Tabs, TimeSelect } from "@argentic/chest-ui/components";
import { localSearch, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clip, Clock, Cross, Globe, Group, Person, Picture, Play, Plus, kindIcons } from "../components/icons.tsx";
import { call, navigate, refresh, toast } from "@argentic/chest-app/client";
import type { ErrorCode } from "@argentic/chest-app";
import type { Catalogue } from "../i18n/index.ts";
import { coverTypes, inAudience, kinds, limits, videoTypes, type Kind, type Version } from "../shared/model.ts";
import { TextEditor } from "./TextEditor.tsx";
import { upload as send, type FileInfo, type UploadRole } from "./upload.ts";
import { fill, plural } from "@argentic/chest-app/client";

// Writing a post: what it is, its headline and text (in one language or
// two), what the kind needs (days and a place, a colleague), who it is for,
// pictures and files, then one button that says what will happen —
// "Publish", "Publish for 6 people", "Publish and tell 6 people". A new Important post can be taken back for 10 seconds (the kit
// toast's Undo) before anything is sent; once it has gone out, the same
// toast says "Sent." and offers no Undo. A new post's draft is kept in this browser until
// it is published: a closed tab loses nothing.
export type ComposerDraft = {
  author: string;
  kind: Kind; title: string; body: string; locale: string; versions: Version[]; important: boolean; pinned: boolean; pinnedUntil: string | null; scheduled: boolean;
  publishAt: { day: string; time: string } | null;
  event: { day: string; lastDay: string; start: string; end: string; place: string; seats: string } | null;
  welcome: string | null; cover: FileInfo | null; attachments: FileInfo[]; gallery: FileInfo[];
  // The groups and the people it is kept to; none: everyone.
  groups: string[]; people: string[];
};
type Words = { composer: Catalogue["composer"]; kinds: Catalogue["kinds"]; errors: Catalogue["errors"]; date: DateWords; peoplePicker: PeoplePickerWords };
type Someone = { id: string; name: string; groups: string[] };

const draftKey = "news.draft";
// Times are kept as "09:30" in the draft; the kit's TimeSelect speaks in
// minutes since midnight (24-hour steps of 15 minutes, never AM/PM).
const minutes = (hhmm: string): number | null => (/^\d{2}:\d{2}$/u.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null);
const hhmm = (m: number | null): string => (m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

// people: everyone who has News (the welcome, the audience, the count);
// groups: the Chest's groups; author: who wrote it (never counted);
// languages: the store's languages.
export function Composer({ postId, initial, author, people, groups, languages, defaults, locale, t }: {
  postId: string | null; initial: ComposerDraft; author: string; people: Someone[]; groups: { id: string; name: string }[];
  languages: { code: string; name: string; said: string }[]; defaults: { day: string; time: string; today: string }; locale: string; t: Words;
}) {
  const w = t.composer;
  const [d, setD] = useState<ComposerDraft>(initial);
  const [later, setLater] = useState(initial.publishAt !== null);
  const [kept, setKept] = useState(initial.groups.length > 0 || initial.people.length > 0);
  const [tab, setTab] = useState<string>(initial.locale);
  const [reconfirm, setReconfirm] = useState(false);
  const [error, setError] = useState<{ text: string; field: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const title = useRef<HTMLInputElement>(null);
  // A day the field refuses as typed (before its first day, unreadable):
  // the field says why, and saving waits until it holds a day again —
  // never the previous day sent in place of what was typed (kit 0.2.4).
  // A field no longer shown (or shown afresh) has no problem: the page
  // itself tells, by the field's aria-invalid.
  const dateProblems = useRef(new Map<string, string>());
  const dateProblem = (id: string) => (problem: string | null) => {
    if (problem) dateProblems.current.set(id, problem);
    else {
      dateProblems.current.delete(id);
      setError(e => (e?.field === id ? null : e));
    }
  };
  const editable = postId === null || initial.scheduled;
  const say = (code: ErrorCode, values: Record<string, number | string> = {}) => fill(t.errors[code], values);
  const failed = (code: ErrorCode, values: Record<string, number | string> = {}) => ({ text: say(code, values), tone: "error" as const });
  const update = (patch: Partial<ComposerDraft>) => setD(current => ({ ...current, ...patch }));
  const nameOf = (code: string) => languages.find(l => l.code === code)?.name ?? code;
  const said = (code: string) => languages.find(l => l.code === code)?.said ?? code;

  // A new post's draft comes back after a closed tab (or after "Undo"),
  // and is kept as it is typed. Files come back only after "Undo": they
  // are still the author's; an older draft's may be gone.
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (postId !== null || restoredOnce.current) return;
    restoredOnce.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const back = JSON.parse(saved) as { d: ComposerDraft; later: boolean; kept?: boolean; files?: boolean };
      if (!back?.d || !(back.d.title || back.d.body)) return;
      const known = (back.d.groups ?? []).filter(g => groups.some(x => x.id === g));
      const who = (back.d.people ?? []).filter(p => people.some(x => x.id === p));
      setD({ ...initial, ...back.d, versions: back.d.versions ?? [], groups: known, people: who, ...(back.files ? {} : { cover: null, attachments: [], gallery: [] }) });
      setLater(back.later === true);
      setKept(known.length > 0 || who.length > 0);
      setTab(back.d.locale ?? initial.locale);
      setEditorKey(k => k + 1);
      setRestored(true);
    } catch {
      // A draft that cannot be read is left behind.
    }
  }, [postId, initial, groups, people]);
  useEffect(() => {
    if (postId !== null) return;
    try {
      if (d.title || d.body) localStorage.setItem(draftKey, JSON.stringify({ d: { ...d, cover: null, attachments: [], gallery: [] }, later }));
    } catch {
      // Private browsing: no draft, nothing else changes.
    }
  }, [d, later, postId]);

  // Running in the browser, its draft read: what it shows can be acted on.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  function forget() {
    try { localStorage.removeItem(draftKey); } catch { /* nothing kept */ }
  }

  // Who will see it, and how many will be told (never its author).
  const audience = { groups: kept ? d.groups : [], people: kept ? d.people : [] };
  const nobodyYet = kept && audience.groups.length === 0 && audience.people.length === 0;
  const reach = nobodyYet ? 0 : people.filter(p => p.id !== author && inAudience(p, audience)).length;

  // Files go from the browser to the Chest itself: News authorises one
  // upload, the browser sends it, News checks it arrived and records it
  // (./upload.ts).
  async function upload(file: File, role: UploadRole): Promise<FileInfo | null> {
    const picture = (coverTypes as readonly string[]).includes(file.type);
    const video = (videoTypes as readonly string[]).includes(file.type);
    const max = role === "attachment" || video ? limits.attachmentSize : limits.coverSize;
    if (file.size > max) { toast(failed("file_too_large")); return null; }
    if ((role === "cover" || role === "inline") && !picture) { toast(failed("not_image")); return null; }
    if (role === "image" && !picture && !video) { toast(failed("not_image")); return null; }
    setSending(file.name);
    try {
      return await send(file, role, t.errors);
    } finally {
      setSending(null);
    }
  }

  // The text of the tab shown: the post's own language, or a version.
  const shown: Version = tab === d.locale ? { locale: d.locale, title: d.title, body: d.body } : d.versions.find(v => v.locale === tab) ?? { locale: tab, title: "", body: "" };
  function write(patch: Partial<Pick<Version, "title" | "body">>) {
    if (tab === d.locale) return update(patch);
    setD(current => ({ ...current, versions: current.versions.map(v => (v.locale === tab ? { ...v, ...patch } : v)) }));
  }
  const others = languages.filter(l => l.code !== d.locale && !d.versions.some(v => v.locale === l.code));
  const textChanged = postId !== null && (d.title !== initial.title || d.body !== initial.body || JSON.stringify(d.versions) !== JSON.stringify(initial.versions));

  async function save() {
    if (saving) return;
    const refused = [...dateProblems.current].find(([id]) => document.getElementById(id)?.getAttribute("aria-invalid") === "true");
    if (refused) {
      const [id, problem] = refused;
      setError({ text: problem, field: id });
      requestAnimationFrame(() => document.getElementById(id)?.focus());
      return;
    }
    if (!d.title.trim()) {
      setTab(d.locale);
      setError({ text: say("empty"), field: "title" });
      requestAnimationFrame(() => title.current?.focus());
      return;
    }
    const halfVersion = d.versions.find(v => !v.title.trim() && v.body.trim());
    if (halfVersion) {
      setTab(halfVersion.locale);
      setError({ text: say("empty"), field: "title" });
      requestAnimationFrame(() => title.current?.focus());
      return;
    }
    if (kept && d.groups.length === 0 && d.people.length === 0) {
      setError({ text: say("no_group"), field: "audience" });
      return;
    }
    setError(null);
    setSaving(true);
    const result = await call("savePost", { postId, input: {
      kind: d.kind,
      title: d.title,
      body: d.body,
      locale: d.locale,
      versions: d.versions,
      important: d.important,
      pinned: d.pinned,
      pinnedUntil: d.pinned ? d.pinnedUntil : null,
      publishAt: editable && later && d.publishAt ? d.publishAt : null,
      event: d.kind === "event" ? d.event : null,
      welcome: d.kind === "welcome" || d.kind === "shoutout" ? d.welcome : null,
      groups: audience.groups,
      people: audience.people,
      cover: d.cover?.id ?? null,
      attachments: d.attachments.map(a => a.id),
      gallery: d.gallery.map(a => a.id),
      reconfirm: textChanged && reconfirm,
    } }, { refresh: false, quiet: true });
    setSaving(false);
    if (!result.ok) {
      setError({ text: result.message, field: null });
      return;
    }
    const { id, undoUntil } = result.value;
    if (undoUntil) {
      // Nothing has left yet: Undo brings the post back here, files and
      // all. The toast (in the members' layout) outlives this page: it
      // follows the author to the article.
      try { localStorage.setItem(draftKey, JSON.stringify({ d, later: false, files: true })); } catch { /* no draft */ }
      const ms = Math.max(1000, new Date(undoUntil).getTime() - Date.now());
      const toastId = `send-${id}`;
      let undone = false;
      toast({
        id: toastId,
        text: plural(locale, w.sendingToast, reach),
        duration: ms,
        undo: async () => {
          undone = true;
          const back = await call("recallPost", { postId: id }, { refresh: false, quiet: true });
          // Too late (it went out meanwhile): the toast says so.
          if (!back.ok) { undone = false; return back.message; }
          await navigate("/chest/new");
          return true;
        },
      });
      // Once the Undo seconds are over, it goes out: the same toast then
      // says it was sent, and offers no Undo (the kit's "sent" state) —
      // even if it was held open meanwhile.
      setTimeout(() => {
        if (undone) return;
        forget();
        void call("release", {}, { refresh: false }).then(() => {
          if (undone) return;
          toast({ id: toastId, text: w.sent, sent: true });
          void refresh();
        });
      }, ms + 300);
      await navigate(`/chest/posts/${id}`);
      return;
    }
    forget();
    toast({ id: `save-${id}`, text: postId !== null ? w.saved : result.value.published ? w.published : w.scheduledToast });
    await navigate(`/chest/posts/${id}`);
  }

  // What the main button says: what will happen.
  const tells = d.important && (postId === null || !initial.important || (textChanged && reconfirm) || audienceChanged(initial, audience));
  const action = saving ? w.saving
    : postId !== null ? (tells && !initial.scheduled ? plural(locale, w.saveTell, reach) : w.save)
    : later ? w.schedule
    : d.important ? plural(locale, w.publishTell, reach)
    : kept ? plural(locale, w.publishFor, reach)
    : w.publish;

  const kindName = (k: Kind) => t.kinds[k];
  // Colleagues found by name (the kit's search rule: accents and case
  // aside, the start of any word of the name).
  const colleagues = useMemo(() => people.filter(p => p.id !== author).map(p => ({ kind: "member" as const, id: p.id, name: p.name })), [people, author]);
  const findColleague = useMemo(() => localSearch(colleagues), [colleagues]);
  const findAnyone = useMemo(() => localSearch(people.map(p => ({ kind: "member" as const, id: p.id, name: p.name }))), [people]);
  const byId = new Map(people.map(p => [p.id, p]));
  const chosenPeople = d.people.map(id => ({ kind: "member" as const, id, name: byId.get(id)?.name ?? "…" }));
  const welcomed = d.welcome ? [{ kind: "member" as const, id: d.welcome, name: byId.get(d.welcome)?.name ?? "…" }] : [];
  const eventDraft = d.event ?? { day: defaults.day, lastDay: "", start: "", end: "", place: "", seats: "" };
  const setEvent = (patch: Partial<typeof eventDraft>) => update({ event: { ...eventDraft, ...patch } });
  // What the post is about besides its words — who is welcomed, when and
  // where the event is — right under the headline: an event is never
  // published without its date because the fields were below the text.
  const facts = (
    <>
          {(d.kind === "welcome" || d.kind === "shoutout") && (
            <div className="field-group">
              <PeoplePicker id="welcome" label={d.kind === "shoutout" ? w.thanks : w.welcome} hint={w.welcomeHint} search={d.kind === "shoutout" ? findColleague : findAnyone} value={welcomed} onChange={list => update({ welcome: list[0]?.id ?? null })} labels={{ ...t.peoplePicker, placeholder: w.welcomePick }} lang={locale} />
            </div>
          )}

          {d.kind === "event" && (
            <div className="event-fields">
              <div className="field-group">
                <DateField id="event-day" label={w.eventDay} value={eventDraft.day || null} onChange={day => setEvent({ day: day ?? "", ...(day && eventDraft.lastDay && eventDraft.lastDay < day ? { lastDay: "" } : {}) })} onProblem={dateProblem("event-day")} today={defaults.today} labels={t.date} />
              </div>
              <div className="field-group">
                <DateField id="event-last" label={w.eventLastDay} hint={w.lastDayHint} value={eventDraft.lastDay || null} min={eventDraft.day || null} chips={false} onChange={day => setEvent({ lastDay: day ?? "" })} onProblem={dateProblem("event-last")} today={defaults.today} labels={t.date} />
              </div>
              <div className="field-group">
                <label htmlFor="event-seats">{w.seats}</label>
                <input id="event-seats" type="number" inputMode="numeric" min={1} max={limits.seats} className="field" value={eventDraft.seats} onChange={e => setEvent({ seats: e.target.value })} aria-describedby="seats-hint" />
              </div>
              <div className="field-group">
                <label htmlFor="event-start">{w.eventStart}</label>
                <TimeSelect id="event-start" empty={w.allDay} value={minutes(eventDraft.start)} onChange={m => setEvent({ start: hhmm(m), ...(m === null ? { end: "" } : {}) })} describedBy="time-hint" />
              </div>
              <div className="field-group">
                <label htmlFor="event-end">{w.eventEnd}</label>
                <TimeSelect id="event-end" empty="—" end value={minutes(eventDraft.end)} disabled={!eventDraft.start} onChange={m => setEvent({ end: hhmm(m) })} />
              </div>
              <p className="hint wide"><span id="time-hint">{w.timeHint}</span> <span id="seats-hint">{w.seatsHint}</span></p>
              <div className="field-group wide">
                <label htmlFor="event-place">{w.place}</label>
                <input id="event-place" className="field" value={eventDraft.place} maxLength={limits.place} placeholder={w.placePlaceholder} onChange={e => setEvent({ place: e.target.value })} />
              </div>
            </div>
          )}
    </>
  );
  // The headline and the text of the language shown.
  const textPanel = (
            <div id="text-panel" className="text-panel">
              {tab !== d.locale && <p className="hint">{fill(w.versionHint, { language: said(tab) })}</p>}
              <div className="field-group">
                <label htmlFor="title">{w.title}</label>
                <input
                  id="title"
                  ref={title}
                  className="field headline-field"
                  value={shown.title}
                  maxLength={limits.title}
                  placeholder={w.titlePlaceholder}
                  lang={tab}
                  aria-invalid={error?.field === "title" ? true : undefined}
                  aria-describedby={error?.field === "title" ? "form-error" : undefined}
                  onChange={e => write({ title: e.target.value })}
                />
              </div>

              {facts}

              <div className="field-group">
                <span className="label" id="body-label">{w.body}</span>
                <TextEditor
                  key={editorKey + ":" + tab}
                  id="body"
                  value={shown.body}
                  onChange={body => write({ body })}
                  onPicture={async f => { const saved = await upload(f, "inline"); return saved ? { id: saved.id, name: saved.fileName } : null; }}
                  placeholder={w.bodyPlaceholder}
                  t={w}
                />
              </div>
            </div>
  );
  return (
    <form className="composer" data-ready={ready ? "" : undefined} onSubmit={e => { e.preventDefault(); void save(); }} onKeyDown={e => {
      // Ctrl+Enter sends once the field it was pressed in has read what was
      // typed (a day, or its refusal): the next turn's submit sees it.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const form = e.currentTarget; setTimeout(() => form.requestSubmit(), 0); }
    }} noValidate>
      <div className="composer-head">
        <h1>{postId === null ? w.newTitle : w.editTitle}</h1>
        {restored && (
          <p className="notice">{w.draftRestored} <button type="button" className="link-button" onClick={() => { forget(); setD(initial); setLater(false); setKept(initial.groups.length > 0 || initial.people.length > 0); setTab(initial.locale); setEditorKey(k => k + 1); setRestored(false); }}>{w.discard}</button></p>
        )}
      </div>

      <div className="composer-grid">
        <div className="composer-main">
          <fieldset className="kinds">
            <legend>{w.kind}</legend>
            {kinds.map(k => {
              const Icon = kindIcons[k];
              return (
                <label key={k} className={"kind-choice" + (d.kind === k ? " on" : "")}>
                  <input type="radio" name="kind" value={k} checked={d.kind === k} onChange={() => update({ kind: k, ...(k === "event" && !d.event ? { event: eventDraft } : {}) })} />
                  <Icon />
                  <span><strong>{kindName(k)}</strong><small>{w.kindHints[k]}</small></span>
                </label>
              );
            })}
          </fieldset>

          <div>
            {d.versions.length === 0 && (
              <label className="language-pick"><Globe /><span>{w.writtenIn}</span>
                <select className="field" value={d.locale} onChange={e => { update({ locale: e.target.value }); setTab(e.target.value); }}>
                  {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </label>
            )}
            {others.map(l => (
              <button key={l.code} type="button" className="link-button" onClick={() => { update({ versions: [...d.versions, { locale: l.code, title: "", body: "" }] }); setTab(l.code); }}><Plus />{fill(w.addVersion, { language: l.said })}</button>
            ))}
            {tab !== d.locale && (
              <button type="button" className="link-button" onClick={() => { update({ versions: d.versions.filter(v => v.locale !== tab) }); setTab(d.locale); }}><Cross />{fill(w.removeVersion, { language: said(tab) })}</button>
            )}
          </div>

          {/* The text in each language: the kit's tabs (arrow keys move) once
              there is a second version. */}
          {d.versions.length > 0 ? (
            <Tabs items={[d.locale, ...d.versions.map(v => v.locale)].map(code => ({ id: code, label: nameOf(code) }))} current={tab} onChange={setTab} label={w.language}>
              {textPanel}
            </Tabs>
          ) : textPanel}

        </div>

        <div className="composer-side">
          <fieldset className="side-card audience" aria-describedby={error?.field === "audience" ? "form-error audience-count" : "audience-count"}>
            <legend>{w.audience}</legend>
            <label className="check">
              <input type="radio" name="audience" checked={!kept} onChange={() => setKept(false)} />
              <span><strong>{w.everyone}</strong><small>{w.everyoneHint}</small></span>
            </label>
            <label className="check">
              <input type="radio" name="audience" checked={kept} onChange={() => setKept(true)} />
              <span><strong>{w.some}</strong><small>{w.someHint}</small></span>
            </label>
            {kept && (
              <div className="audience-groups">
                {groups.length === 0 && <p className="hint">{w.noGroups}</p>}
                {groups.map(g => (
                  <label key={g.id} className="check">
                    <input type="checkbox" checked={d.groups.includes(g.id)} onChange={e => update({ groups: e.target.checked ? [...d.groups, g.id] : d.groups.filter(x => x !== g.id) })} />
                    <span><strong><Group /> {g.name}</strong></span>
                  </label>
                ))}
                <div className="people-picker">
                  <PeoplePicker id="people-search" label={w.addPeople} multiple search={findColleague} value={chosenPeople} onChange={list => update({ people: list.map(p => p.id) })} labels={t.peoplePicker} lang={locale} />
                </div>
              </div>
            )}
            <p id="audience-count" className="count" aria-live="polite"><Person />{plural(locale, w.audienceCount, reach)}</p>
          </fieldset>

          <section className="side-card">
            <h2>{w.options}</h2>
            {/* On/off choices that wait for Publish: the kit's Checkbox. */}
            <Checkbox label={<strong>{w.important}</strong>} hint={w.importantHint} checked={d.important} onChange={on => update({ important: on })} />
            {postId !== null && initial.important && d.important && textChanged && !initial.scheduled && (
              <Checkbox className="indent" label={<strong>{w.reconfirm}</strong>} hint={w.reconfirmHint} checked={reconfirm} onChange={setReconfirm} />
            )}
            <Checkbox label={<strong>{w.pinned}</strong>} hint={w.pinnedHint} checked={d.pinned} onChange={on => update({ pinned: on })} />
            {d.pinned && (
              <div className="field-group indent">
                <DateField id="pinned-until" label={w.pinnedUntil} value={d.pinnedUntil} min={defaults.today} chips={false} onChange={day => update({ pinnedUntil: day })} onProblem={dateProblem("pinned-until")} today={defaults.today} labels={t.date} />
              </div>
            )}
          </section>

          <section className="side-card">
            <h2>{w.cover}</h2>
            {d.cover ? (
              <div className="cover-preview">
                <img src={`/chest/files/${d.cover.id}?size=256`} alt="" />
                <button type="button" className="button quiet small" onClick={() => update({ cover: null })}><Cross />{w.removeCover}</button>
              </div>
            ) : (
              <label className="button quiet small file-input">
                <Picture />{w.addCover}
                <input type="file" accept={coverTypes.join(",")} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const saved = await upload(f, "cover"); if (saved) update({ cover: saved }); } }} />
              </label>
            )}
            <p className="hint">{w.coverHint}</p>
          </section>

          <section className="side-card">
            <h2>{w.gallery}</h2>
            {d.gallery.length > 0 && (
              <ul className="gallery-edit">
                {d.gallery.map(g => (
                  <li key={g.id}>
                    {g.type.startsWith("video/") ? <span className="video-thumb"><Play /></span> : <img src={`/chest/files/${g.id}?size=256`} alt="" />}
                    <button type="button" className="icon-button" onClick={() => update({ gallery: d.gallery.filter(x => x.id !== g.id) })}><Cross /><span className="visually-hidden">{fill(w.removeFile, { name: g.fileName })}</span></button>
                  </li>
                ))}
              </ul>
            )}
            {d.gallery.length < limits.imagesPerPost && (
              <label className="button quiet small file-input">
                <Picture />{w.addPictures}
                <input type="file" multiple accept={[...coverTypes, ...videoTypes].join(",")} onChange={async e => {
                  const list = [...(e.target.files ?? [])].slice(0, limits.imagesPerPost - d.gallery.length);
                  e.target.value = "";
                  for (const f of list) { const saved = await upload(f, "image"); if (saved) setD(current => ({ ...current, gallery: [...current.gallery, saved] })); }
                }} />
              </label>
            )}
            <p className="hint">{w.galleryHint}</p>
          </section>

          <section className="side-card">
            <h2>{w.attachments}</h2>
            {d.attachments.length > 0 && (
              <ul className="file-list">
                {d.attachments.map(a => (
                  <li key={a.id}>
                    <Clip /><span>{a.fileName}</span>
                    <button type="button" className="icon-button" onClick={() => update({ attachments: d.attachments.filter(x => x.id !== a.id) })}><Cross /><span className="visually-hidden">{fill(w.removeFile, { name: a.fileName })}</span></button>
                  </li>
                ))}
              </ul>
            )}
            {d.attachments.length < limits.attachmentsPerPost && (
              <label className="button quiet small file-input">
                <Clip />{w.addFile}
                <input type="file" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const saved = await upload(f, "attachment"); if (saved) setD(current => ({ ...current, attachments: [...current.attachments, saved] })); } }} />
              </label>
            )}
            {sending && <p className="hint" role="status">{fill(w.uploading, { name: sending })}</p>}
          </section>
        </div>
      </div>

      <div className="composer-bar">
        {error && <p id="form-error" className="error" role="alert">{error.text}</p>}
        {editable && later && (
          <div className="when-fields" role="group" aria-label={w.when}>
            <Clock />
            <DateField id="later-day" label={w.laterDay} value={d.publishAt?.day ?? defaults.day} min={defaults.today} onChange={day => update({ publishAt: { day: day ?? defaults.day, time: d.publishAt?.time ?? defaults.time } })} onProblem={dateProblem("later-day")} today={defaults.today} labels={t.date} />
            <div className="field-group">
              <label htmlFor="later-time">{w.laterTime}</label>
              <TimeSelect id="later-time" value={minutes(d.publishAt?.time ?? defaults.time) ?? 540} onChange={m => update({ publishAt: { day: d.publishAt?.day ?? defaults.day, time: hhmm(m) } })} />
            </div>
          </div>
        )}
        <a className="button quiet" href={postId ? `/chest/posts/${postId}` : "/chest"}>{w.cancel}</a>
        {editable && (
          <button type="button" className="button quiet" aria-pressed={later} onClick={() => { const next = !later; setLater(next); if (next && !d.publishAt) update({ publishAt: { day: defaults.day, time: defaults.time } }); }}>
            <Clock />{later ? w.publishNowInstead : w.later}
          </button>
        )}
        <button type="submit" className="button" disabled={saving || sending !== null}>{action}</button>
      </div>
    </form>
  );
}

function audienceChanged(initial: ComposerDraft, now: { groups: string[]; people: string[] }): boolean {
  return [...initial.groups].sort().join() !== [...now.groups].sort().join() || [...initial.people].sort().join() !== [...now.people].sort().join();
}

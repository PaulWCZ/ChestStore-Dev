"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clip, Clock, Cross, Globe, Group, Person, Picture, Play, Plus, kindIcons } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import type { ErrorCode } from "../../lib/app-error.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { coverTypes, inAudience, kinds, limits, videoTypes, type Kind, type Version } from "../../lib/model.ts";
import { recallPost, release, savePost } from "./actions.ts";
import { TextEditor } from "./text-editor.tsx";

// Writing a post: what it is, its headline and text (in one language or
// two), what the kind needs (days and a place, a colleague), who it is for,
// pictures and files, then one button that says what will happen —
// "Publish", "Publish for 6 people", "Publish and tell 6 people by bell and
// email". A new Important post can be taken back for 10 seconds ("Undo")
// before anything is sent. A new post's draft is kept in this browser until
// it is published: a closed tab loses nothing.
type FileInfo = { id: string; fileName: string; type: string; size: number };
export type ComposerDraft = {
  author: string;
  kind: Kind; title: string; body: string; locale: string; versions: Version[]; important: boolean; pinned: boolean; pinnedUntil: string | null; scheduled: boolean;
  publishAt: { day: string; time: string } | null;
  event: { day: string; lastDay: string; start: string; end: string; place: string; seats: string } | null;
  welcome: string | null; cover: FileInfo | null; attachments: FileInfo[]; gallery: FileInfo[];
  // The groups and the people it is kept to; none: everyone.
  groups: string[]; people: string[];
};
type Words = { composer: Catalogue["composer"]; kinds: Catalogue["kinds"]; errors: Catalogue["errors"] };
type Someone = { id: string; name: string; groups: string[] };

const draftKey = "news.draft";
const hours = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// people: everyone who has News (the welcome, the audience, the count);
// groups: the Chest's groups; author: who wrote it (never counted); mail:
// what News knows of the Chest's email; languages: the store's languages.
export function Composer({ postId, initial, author, people, groups, languages, mail, defaults, locale, t }: {
  postId: string | null; initial: ComposerDraft; author: string; people: Someone[]; groups: { id: string; name: string }[];
  languages: { code: string; name: string; said: string }[]; mail: "on" | "off" | "unknown"; defaults: { day: string; time: string; today: string }; locale: string; t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
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
  const editable = postId === null || initial.scheduled;
  const say = (code: ErrorCode, values: Record<string, number | string> = {}) => format(t.errors[code], values);
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
  // upload, the browser sends it, News checks it arrived and records it.
  async function upload(file: File, role: "cover" | "attachment" | "image" | "inline"): Promise<FileInfo | null> {
    const picture = (coverTypes as readonly string[]).includes(file.type);
    const video = (videoTypes as readonly string[]).includes(file.type);
    const max = role === "attachment" || video ? limits.attachmentSize : limits.coverSize;
    if (file.size > max) { toast(say("file_too_large")); return null; }
    if ((role === "cover" || role === "inline") && !picture) { toast(say("not_image")); return null; }
    if (role === "image" && !picture && !video) { toast(say("not_image")); return null; }
    setSending(file.name);
    try {
      const type = file.type || "application/octet-stream";
      const grant = await fetch("/chest/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, size: file.size, type }) });
      const up = await grant.json() as { url?: string; error?: ErrorCode };
      if (!grant.ok || !up.url) { toast(say(up.error ?? "unknown")); return null; }
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
      if (!put.ok) { toast(say(put.status === 413 ? "file_too_large" : put.status === 415 ? "not_image" : "file_missing")); return null; }
      const { name } = await put.json() as { name: string };
      const confirm = await fetch("/chest/api/uploads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, fileName: file.name, role }) });
      const saved = await confirm.json() as FileInfo & { error?: ErrorCode };
      if (!confirm.ok) { toast(say(saved.error ?? "file_missing")); return null; }
      return saved;
    } catch {
      toast(say("unavailable"));
      return null;
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
    const result = await savePost(postId, {
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
      welcome: d.kind === "welcome" ? d.welcome : null,
      groups: audience.groups,
      people: audience.people,
      cover: d.cover?.id ?? null,
      attachments: d.attachments.map(a => a.id),
      gallery: d.gallery.map(a => a.id),
      reconfirm: textChanged && reconfirm,
    });
    setSaving(false);
    if (!result.ok) {
      setError({ text: say(result.error, result.values), field: null });
      return;
    }
    const { id, undoUntil } = result.value;
    if (undoUntil) {
      // Nothing has left yet: "Undo" brings the post back here, files and all.
      try { localStorage.setItem(draftKey, JSON.stringify({ d, later: false, files: true })); } catch { /* no draft */ }
      const ms = Math.max(1000, new Date(undoUntil).getTime() - Date.now());
      toast(plural(w.sendingToast, reach, locale), {
        label: w.undo,
        run: async () => {
          const back = await recallPost(id);
          if (!back.ok) return toast(say(back.error));
          toast(w.recalled);
          router.push("/chest/new");
        },
      }, {
        ms,
        onExpire: async () => {
          forget();
          await release();
          toast(w.sent);
          router.refresh();
        },
      });
      router.push(`/chest/posts/${id}`);
      return;
    }
    forget();
    toast(postId !== null ? w.saved : result.value.published ? w.published : w.scheduledToast);
    router.push(`/chest/posts/${id}`);
  }

  // What the main button says: what will happen.
  const tells = d.important && (postId === null || !initial.important || (textChanged && reconfirm) || audienceChanged(initial, audience));
  const action = saving ? w.saving
    : postId !== null ? (tells && !initial.scheduled ? plural(w.saveTell, reach, locale) : w.save)
    : later ? w.schedule
    : d.important ? plural(mail === "off" ? w.publishTellBell : w.publishTell, reach, locale)
    : kept ? plural(w.publishFor, reach, locale)
    : w.publish;

  const kindName = (k: Kind) => t.kinds[k];
  const eventDraft = d.event ?? { day: defaults.day, lastDay: "", start: "", end: "", place: "", seats: "" };
  const setEvent = (patch: Partial<typeof eventDraft>) => update({ event: { ...eventDraft, ...patch } });
  return (
    <form className="composer" data-ready={ready ? "" : undefined} onSubmit={e => { e.preventDefault(); void save(); }} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }} noValidate>
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

          <div className="languages-bar">
            {d.versions.length > 0 ? (
              <div className="tabs" role="tablist" aria-label={w.language}>
                {[d.locale, ...d.versions.map(v => v.locale)].map(code => (
                  <button key={code} type="button" role="tab" id={`tab-${code}`} aria-selected={tab === code} aria-controls="text-panel" onClick={() => setTab(code)}><Globe />{nameOf(code)}</button>
                ))}
              </div>
            ) : (
              <label className="language-pick"><Globe /><span>{w.writtenIn}</span>
                <select className="field" value={d.locale} onChange={e => { update({ locale: e.target.value }); setTab(e.target.value); }}>
                  {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </label>
            )}
            {others.map(l => (
              <button key={l.code} type="button" className="link-button" onClick={() => { update({ versions: [...d.versions, { locale: l.code, title: "", body: "" }] }); setTab(l.code); }}><Plus />{format(w.addVersion, { language: l.said })}</button>
            ))}
            {tab !== d.locale && (
              <button type="button" className="link-button" onClick={() => { update({ versions: d.versions.filter(v => v.locale !== tab) }); setTab(d.locale); }}><Cross />{format(w.removeVersion, { language: said(tab) })}</button>
            )}
          </div>

          <div id="text-panel" className="text-panel" {...(d.versions.length > 0 ? { role: "tabpanel", "aria-labelledby": `tab-${tab}` } : {})}>
            {tab !== d.locale && <p className="hint">{format(w.versionHint, { language: said(tab) })}</p>}
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

          {d.kind === "welcome" && (
            <div className="field-group">
              <label htmlFor="welcome">{w.welcome}</label>
              <select id="welcome" className="field" value={d.welcome ?? ""} onChange={e => update({ welcome: e.target.value || null })} aria-describedby="welcome-hint">
                <option value="">{w.welcomePick}</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p id="welcome-hint" className="hint">{w.welcomeHint}</p>
            </div>
          )}

          {d.kind === "event" && (
            <div className="event-fields">
              <div className="field-group">
                <label htmlFor="event-day">{w.eventDay}</label>
                <input id="event-day" type="date" className="field" value={eventDraft.day} onChange={e => setEvent({ day: e.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="event-last">{w.eventLastDay}</label>
                <input id="event-last" type="date" className="field" value={eventDraft.lastDay} min={eventDraft.day} onChange={e => setEvent({ lastDay: e.target.value })} aria-describedby="last-hint" />
              </div>
              <div className="field-group">
                <label htmlFor="event-seats">{w.seats}</label>
                <input id="event-seats" type="number" inputMode="numeric" min={1} max={limits.seats} className="field" value={eventDraft.seats} onChange={e => setEvent({ seats: e.target.value })} aria-describedby="seats-hint" />
              </div>
              <div className="field-group">
                <label htmlFor="event-start">{w.eventStart}</label>
                <select id="event-start" className="field" value={eventDraft.start} onChange={e => setEvent({ start: e.target.value, ...(e.target.value ? {} : { end: "" }) })} aria-describedby="time-hint">
                  <option value="">{w.allDay}</option>
                  {hours.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="event-end">{w.eventEnd}</label>
                <select id="event-end" className="field" value={eventDraft.end} disabled={!eventDraft.start} onChange={e => setEvent({ end: e.target.value })}>
                  <option value="">—</option>
                  {hours.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <p className="hint wide"><span id="time-hint">{w.timeHint}</span> <span id="last-hint">{w.lastDayHint}</span> <span id="seats-hint">{w.seatsHint}</span></p>
              <div className="field-group wide">
                <label htmlFor="event-place">{w.place}</label>
                <input id="event-place" className="field" value={eventDraft.place} maxLength={limits.place} placeholder={w.placePlaceholder} onChange={e => setEvent({ place: e.target.value })} />
              </div>
            </div>
          )}
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
                <PeoplePicker chosen={d.people} people={people.filter(p => p.id !== author)} onChange={list => update({ people: list })} w={w} />
              </div>
            )}
            <p id="audience-count" className="count" aria-live="polite"><Person />{plural(w.audienceCount, reach, locale)}</p>
          </fieldset>

          <section className="side-card">
            <h2>{w.options}</h2>
            <label className="check">
              <input type="checkbox" checked={d.important} onChange={e => update({ important: e.target.checked })} />
              <span><strong>{w.important}</strong><small>{mail === "off" ? w.importantHintBell : w.importantHint}</small></span>
            </label>
            {postId !== null && initial.important && d.important && textChanged && !initial.scheduled && (
              <label className="check indent">
                <input type="checkbox" checked={reconfirm} onChange={e => setReconfirm(e.target.checked)} />
                <span><strong>{w.reconfirm}</strong><small>{w.reconfirmHint}</small></span>
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={d.pinned} onChange={e => update({ pinned: e.target.checked })} />
              <span><strong>{w.pinned}</strong><small>{w.pinnedHint}</small></span>
            </label>
            {d.pinned && (
              <div className="field-group indent">
                <label htmlFor="pinned-until">{w.pinnedUntil}</label>
                <input id="pinned-until" type="date" className="field" value={d.pinnedUntil ?? ""} min={defaults.today} onChange={e => update({ pinnedUntil: e.target.value || null })} />
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
                    <button type="button" className="icon-button" onClick={() => update({ gallery: d.gallery.filter(x => x.id !== g.id) })}><Cross /><span className="visually-hidden">{format(w.removeFile, { name: g.fileName })}</span></button>
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
                    <button type="button" className="icon-button" onClick={() => update({ attachments: d.attachments.filter(x => x.id !== a.id) })}><Cross /><span className="visually-hidden">{format(w.removeFile, { name: a.fileName })}</span></button>
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
            {sending && <p className="hint" role="status">{format(w.uploading, { name: sending })}</p>}
          </section>
        </div>
      </div>

      <div className="composer-bar">
        {error && <p id="form-error" className="error" role="alert">{error.text}</p>}
        {editable && later && (
          <div className="when-fields" role="group" aria-label={w.when}>
            <Clock />
            <label className="visually-hidden" htmlFor="later-day">{w.laterDay}</label>
            <input id="later-day" type="date" className="field" value={d.publishAt?.day ?? defaults.day} min={defaults.today} onChange={e => update({ publishAt: { day: e.target.value, time: d.publishAt?.time ?? defaults.time } })} />
            <label className="visually-hidden" htmlFor="later-time">{w.laterTime}</label>
            <select id="later-time" className="field" value={d.publishAt?.time ?? defaults.time} onChange={e => update({ publishAt: { day: d.publishAt?.day ?? defaults.day, time: e.target.value } })}>
              {hours.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
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

// People picked by name: type the start of a name, choose; each chosen one
// is a chip that removes itself.
function PeoplePicker({ chosen, people, onChange, w }: { chosen: string[]; people: Someone[]; onChange: (list: string[]) => void; w: Catalogue["composer"] }) {
  const [q, setQ] = useState("");
  const found = q.trim()
    ? people.filter(p => !chosen.includes(p.id) && fold(p.name).split(/\s+/u).concat(fold(p.name)).some(part => part.startsWith(fold(q.trim())))).slice(0, 6)
    : [];
  const byId = new Map(people.map(p => [p.id, p]));
  return (
    <div className="people-picker">
      {chosen.length > 0 && (
        <ul className="chips">
          {chosen.map(id => (
            <li key={id}>
              <Person />{byId.get(id)?.name ?? "…"}
              <button type="button" className="chip-remove" onClick={() => onChange(chosen.filter(x => x !== id))}><Cross /><span className="visually-hidden">{format(w.removePerson, { name: byId.get(id)?.name ?? "" })}</span></button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="people-search" className="label-small">{w.addPeople}</label>
      <input id="people-search" type="search" className="field" value={q} onChange={e => setQ(e.target.value)} placeholder={w.peoplePlaceholder} autoComplete="off" aria-describedby="people-found" />
      <div id="people-found" aria-live="polite">
        {found.length > 0 && (
          <ul className="suggestions">
            {found.map(p => (
              <li key={p.id}><button type="button" onClick={() => { onChange([...chosen, p.id]); setQ(""); }}><Plus />{p.name}</button></li>
            ))}
          </ul>
        )}
        {q.trim() && found.length === 0 && <p className="hint">{w.nobodyFound}</p>}
      </div>
    </div>
  );
}

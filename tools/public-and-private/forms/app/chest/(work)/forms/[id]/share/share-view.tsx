"use client";

import { Avatar, DateField, PeoplePicker, useToast } from "@argentic/chest-ui/components";
import type { Choice } from "@argentic/chest-ui/components/logic";
import { useId, useMemo, useState, useTransition } from "react";
import { CopyButton } from "../../../../../../components/copy-button.tsx";
import { Close, Globe, Link as LinkIcon } from "../../../../../../components/icons.tsx";
import type { ErrorCode } from "../../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { format } from "../../../../../../lib/i18n/format.ts";
import type { Kind } from "../../../../../../lib/model.ts";
import { findPeople, saveEmbedSites, shareForm } from "../../../../actions.ts";

type Person = { id: string; name: string; photo: string | null };
type Props = {
  formId: string;
  link: string | null;
  open: boolean;
  audience: "public" | "team";
  questions: { id: string; key: string | null; title: string; kind: Kind; options: string[] }[];
  owner: Person;
  shared: (Person & { level: "editor" | "viewer"; manager: boolean })[];
  taken: string[];
  canManage: boolean;
  embed: { sites: string[]; canEdit: boolean; title: string; colour: { fill: string; ink: string } } | null;
  // Today on the Chest's clock (a date question's prefilled value).
  today: string;
  locale: string;
  t: { share: Catalogue["share"]; levels: Catalogue["levels"]; errors: Catalogue["errors"]; yes: string; no: string; date: Catalogue["date"]; peoplePicker: Catalogue["peoplePicker"] };
};

// The code a website pastes: the form in a frame that takes the form's
// height (the form tells it, components/runner.tsx), or a button that
// opens the form. Attribute values are quoted and escaped.
const quoted = (s: string) => '"' + s.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;") + '"';
const frameCode = (url: string, title: string) =>
  `<iframe src=${quoted(url)} title=${quoted(title)} style="width:100%;min-height:640px;border:0" loading="lazy" data-chest-form></iframe>\n` +
  `<script>addEventListener("message",function(e){if(e.origin!==${JSON.stringify(new URL(url).origin)}||!e.data||e.data.type!=="chest-forms:height")return;document.querySelectorAll("iframe[data-chest-form]").forEach(function(f){if(f.contentWindow===e.source)f.style.height=e.data.height+"px"})})</script>`;
// The button wears the form's colour as the page shows it (light).
const buttonCode = (url: string, label: string, colour: { fill: string; ink: string }) => `<a href=${quoted(url)} target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${colour.fill};color:${colour.ink};font:600 16px system-ui;text-decoration:none">${label.replace(/</gu, "&lt;")}</a>`;

export function ShareView(p: Props) {
  const { share: s, levels } = p.t;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState(p.questions[0]?.id ?? "");
  const [value, setValue] = useState("");
  // A day the date field refuses as typed: it says why, `value` still
  // holds the day before, and no link is offered for that day in place of
  // what was typed (kit 0.2.4).
  const [dayRefused, setDayRefused] = useState(false);
  const q = p.questions.find(x => x.id === question);
  const prefilled = useMemo(() => (p.link && q && value.trim() && !(q.kind === "date" && dayRefused) ? `${p.link}?${new URLSearchParams({ [q.key ?? q.id]: value.trim() }).toString()}` : null), [p.link, q, value, dayRefused]);
  const say = (code: ErrorCode, values?: Record<string, string | number>) => format(p.t.errors[code] ?? p.t.errors.unknown, values ?? {});

  // Taking someone off can be undone: they are given their level back.
  const act = (memberId: string, lvl: "editor" | "viewer" | null, done: string, before?: "editor" | "viewer") => start(async () => {
    const r = await shareForm(p.formId, memberId, lvl);
    if (!r.ok) return void toast({ id: `share-${memberId}`, text: say(r.error, r.values), tone: "error" });
    toast({
      id: `share-${memberId}`,
      text: done,
      ...(before ? { undo: async () => { const back = await shareForm(p.formId, memberId, before); return back.ok || say(back.error, back.values); } } : {}),
    });
  });

  return (
    <div className="panel-page">
      <section className="panel" aria-labelledby="share-link">
        <h2 id="share-link">{p.audience === "public" ? s.publicLink : s.teamLink}</h2>
        {p.link ? (
          <>
            <div className="link-box big"><LinkIcon /><code>{p.link}</code></div>
            <div className="row-actions">
              <CopyButton text={p.link} label={s.copy} done={s.copied} failed={s.copyFailed} className="button" />
              <a className="button quiet" href={p.link} target="_blank" rel="noreferrer">{s.open}</a>
            </div>
            {!p.open && <p className="notice">{s.closedNote}</p>}
          </>
        ) : <p className="notice">{s.notLive}</p>}
      </section>

      {p.link && p.questions.length > 0 && (
        <section className="panel" aria-labelledby="share-prefill">
          <h2 id="share-prefill">{s.prefill}</h2>
          <p className="hint">{s.prefillHint}</p>
          <div className="prefill">
            <label className="mini">
              <span className="mini-label">{s.prefillQuestion}</span>
              <select className="field" value={question} onChange={e => { setQuestion(e.target.value); setValue(""); setDayRefused(false); }}>
                {p.questions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </label>
            <label className="mini grow">
              <span className="mini-label">{s.prefillValue}</span>
              {q && q.options.length > 0 ? (
                <select className="field" value={value} onChange={e => setValue(e.target.value)}>
                  <option value="">—</option>
                  {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : q?.kind === "yesno" ? (
                <select className="field" value={value} onChange={e => setValue(e.target.value)}>
                  <option value="">—</option>
                  <option value="yes">{p.t.yes}</option>
                  <option value="no">{p.t.no}</option>
                </select>
              ) : q?.kind !== "date" ? (
                <input className="field" value={value} onChange={e => setValue(e.target.value)} />
              ) : null}
            </label>
            {q?.kind === "date" && (
              <div className="mini grow">
                <DateField key={question} label={s.prefillValue} value={value || null} onChange={d => setValue(d ?? "")} onProblem={problem => setDayRefused(problem !== null)} today={p.today} labels={p.t.date} />
              </div>
            )}
          </div>
          {q && !q.key && <p className="hint">{s.prefillKeyHint}</p>}
          {prefilled && (
            <>
              <p className="mini-label">{s.prefillLink}</p>
              <div className="link-box"><code>{prefilled}</code></div>
              <CopyButton text={prefilled} label={s.copy} done={s.copied} failed={s.copyFailed} />
            </>
          )}
        </section>
      )}

      {p.link && p.embed && <Embed link={p.link} embed={p.embed} s={s} say={say} />}

      <section className="panel" aria-labelledby="share-people">
        <h2 id="share-people">{s.people}</h2>
        <p className="hint">{s.peopleHint}</p>
        <ul className="people-list">
          <li><Avatar name={p.owner.name} photo={p.owner.photo} size="s" /><span className="person-name">{p.owner.name}</span><span className="level">{levels.owner}</span></li>
          {p.shared.map(x => (
            <li key={x.id}>
              <Avatar name={x.name} photo={x.photo} size="s" />
              <span className="person-name">{x.name}</span>
              {x.manager ? <span className="level">{levels.manager}</span> : p.canManage ? (
                <>
                  <label className="visually-hidden" htmlFor={`lvl-${x.id}`}>{format(s.levelOf, { name: x.name })}</label>
                  <select id={`lvl-${x.id}`} className="field compact" value={x.level} disabled={pending} onChange={e => act(x.id, e.target.value as "editor" | "viewer", format(s.added, { name: x.name }))}>
                    <option value="editor">{levels.editor}</option>
                    <option value="viewer">{levels.viewer}</option>
                  </select>
                </>
              ) : <span className="level">{levels[x.level]}</span>}
              {p.canManage && <button type="button" className="icon-button" disabled={pending} onClick={() => act(x.id, null, format(s.removed, { name: x.name }), x.level)}><Close /><span className="visually-hidden">{format(s.removeOne, { name: x.name })}</span></button>}
            </li>
          ))}
        </ul>
        {p.shared.length === 0 && <p className="hint">{s.nobody}</p>}
        {p.canManage && <AddPerson taken={p.taken} s={s} levels={levels} pending={pending} words={p.t.peoplePicker} locale={p.locale} onAdd={(id, name, level) => act(id, level, format(s.added, { name }))} />}
        {!p.canManage && <p className="hint">{s.ownerNote}</p>}
      </section>
    </div>
  );
}

// Someone to share with: the kit's people picker (type a few letters of a
// name, the Chest finds them; arrows choose, Enter picks), then their
// level, then Add.
function AddPerson({ taken, s, levels, pending, words, locale, onAdd }: { taken: string[]; s: Catalogue["share"]; levels: Catalogue["levels"]; pending: boolean; words: Catalogue["peoplePicker"]; locale: string; onAdd: (id: string, name: string, level: "editor" | "viewer") => void }) {
  const [picked, setPicked] = useState<Choice[]>([]);
  const [level, setLevel] = useState<"editor" | "viewer">("viewer");
  const levelId = useId();
  const search = async (query: string): Promise<Choice[]> => {
    const r = await findPeople(query);
    if (!r.ok) throw new Error(r.error);
    return r.value.filter(x => !taken.includes(x.id)).map(x => ({ kind: "member" as const, id: x.id, name: x.name, photo: x.photo }));
  };
  const person = picked[0];
  return (
    <form className="add-person" onSubmit={e => { e.preventDefault(); if (person) { onAdd(person.id, person.name, level); setPicked([]); } }}>
      <div className="mini grow">
        <PeoplePicker label={s.addPerson} value={picked} onChange={setPicked} search={search} labels={words} lang={locale} />
      </div>
      <div className="mini">
        <label className="mini-label" htmlFor={levelId}>{s.levelLabel}</label>
        <select id={levelId} className="field" value={level} onChange={e => setLevel(e.target.value as "editor" | "viewer")}>
          <option value="viewer">{levels.viewer}</option>
          <option value="editor">{levels.editor}</option>
        </select>
      </div>
      <button type="submit" className="button" disabled={!person || pending}>{s.add}</button>
    </form>
  );
}

// On the company's website: the websites allowed (managers), the frame's
// code and a button's code. Said plainly: the frame waits for the Chest.
function Embed({ link, embed, s, say }: { link: string; embed: { sites: string[]; canEdit: boolean; title: string; colour: { fill: string; ink: string } }; s: Catalogue["share"]; say: (c: ErrorCode, v?: Record<string, string | number>) => string }) {
  const [sites, setSites] = useState(embed.sites.join("\n"));
  const [pending, start] = useTransition();
  const toast = useToast();
  const id = useId();
  return (
    <section className="panel" aria-labelledby="share-embed">
      <h2 id="share-embed"><Globe /> {s.embed}</h2>
      <p className="hint">{s.embedHint}</p>
      <label className="mini-label" htmlFor={`${id}-sites`}>{s.embedSites}</label>
      <textarea id={`${id}-sites`} className="field" rows={2} value={sites} readOnly={!embed.canEdit} placeholder={s.embedPlaceholder} onChange={e => setSites(e.target.value)} />
      {embed.canEdit ? (
        <div><button type="button" className="button quiet small" disabled={pending} onClick={() => start(async () => { const r = await saveEmbedSites(sites); if (r.ok) { setSites(r.value.sites.join("\n")); toast({ id: "embed", text: s.embedSaved }); } else toast({ id: "embed", text: say(r.error, r.values), tone: "error" }); })}>{s.embedSave}</button></div>
      ) : <p className="hint">{s.embedManagers}</p>}
      <label className="mini-label" htmlFor={`${id}-frame`}>{s.embedCode}</label>
      <textarea id={`${id}-frame`} className="field embed-code" readOnly rows={4} value={frameCode(link, embed.title)} />
      <div><CopyButton text={frameCode(link, embed.title)} label={s.embedCopy} done={s.embedCopied} failed={s.copyFailed} /></div>
      <label className="mini-label" htmlFor={`${id}-button`}>{s.embedButton}</label>
      <textarea id={`${id}-button`} className="field embed-code" readOnly rows={2} value={buttonCode(link, s.embedButtonText, embed.colour)} />
      <div><CopyButton text={buttonCode(link, s.embedButtonText, embed.colour)} label={s.embedCopy} done={s.embedCopied} failed={s.copyFailed} /></div>
      <p className="notice">{s.embedNote}</p>
    </section>
  );
}

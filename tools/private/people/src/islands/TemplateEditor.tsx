import { call, navigate, plural, refresh, toast } from "@argentic/chest-app/client";
import { useId, useState, type FormEvent } from "react";
import { Archive, Plus, Trash } from "../components/icons.tsx";
import { KindBadge } from "../components/kind.tsx";
import { limits, offsets, type ItemRole, type Kind } from "../shared/model.ts";

// A template and its steps as the page gives them (lib/journeys.ts, the
// steps' words already in the reader's language).
export type TemplateItem = { id: string; text: string; phrase: string | null; role: ItemRole; memberId: string | null; offset: number };
export type Template = { id: string; kind: Kind; name: string; phrase: Kind | null; archived: boolean; items: TemplateItem[] };

type Words = {
  template: {
    name: string; kind: string; steps: string; step: string; who: string; when: string; remove: string; removed: string; add: string; addPlaceholder: string; addButton: string;
    saved: string; archive: string; archived: string; restore: string; archivedBanner: string; empty: string; start: string;
    roles: { person: Record<Kind, string>; manager: string; hr: string; someone: string };
    offsets: Record<string, string>;
    daysBefore: { one: string; other: string }; daysAfter: { one: string; other: string };
  };
  kinds: Record<Kind, string>;
};

// "Who" is a role or a member: one picker holds both ("member:<id>").
const whoValue = (i: { role: ItemRole; memberId: string | null }) => (i.role === "member" ? "member:" + i.memberId : i.role);
function readWho(value: string): { role: ItemRole; memberId: string | null } {
  return value.startsWith("member:") ? { role: "member", memberId: value.slice(7) } : { role: value as ItemRole, memberId: null };
}

// Each change is saved as it is made, and kept on screen here (the page is
// not read again after it: what HR types stays as typed).
export function TemplateEditor({ template, people, locale, t }: { template: Template; people: { id: string; name: string }[]; locale: string; t: Words }) {
  const uid = useId();
  const [name, setName] = useState(template.name);
  const [items, setItems] = useState<TemplateItem[]>(template.items);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => a.offset - b.offset);
  const when = (n: number) => t.template.offsets[String(n)] ?? plural(locale, n < 0 ? t.template.daysBefore : t.template.daysAfter, Math.abs(n));
  const whenChoices = [...new Set([...offsets, ...items.map(i => i.offset)])].sort((a, b) => a - b);
  // Each call is quiet and keeps the page as it is: a refusal is said here.
  const quiet = { refresh: false, quiet: true } as const;
  const fail = (r: { message: string }) => void toast({ text: r.message, tone: "error" });

  const saveName = () => {
    if (name.trim() === template.name) return;
    void (async () => {
      const r = await call("renameTemplate", { id: template.id, name }, quiet);
      if (!r.ok) {
        fail(r);
        setName(template.name);
      } else toast({ id: `template-${template.id}`, text: t.template.saved });
    })();
  };
  const change = (item: TemplateItem, patch: Partial<TemplateItem>) => {
    const next = { ...item, ...patch };
    if (next.text.trim() === "") return;
    setItems(list => list.map(i => (i.id === item.id ? next : i)));
    void (async () => {
      const r = await call("updateTemplateItem", { id: item.id, text: next.text, role: next.role, memberId: next.memberId, offset: next.offset }, quiet);
      if (!r.ok) {
        fail(r);
        setItems(list => list.map(i => (i.id === item.id ? item : i)));
      }
    })();
  };
  const remove = (item: TemplateItem) => {
    setItems(list => list.filter(i => i.id !== item.id));
    void (async () => {
      const r = await call("removeTemplateItem", { id: item.id }, quiet);
      if (!r.ok) {
        fail(r);
        setItems(list => [...list, item]);
        return;
      }
      toast({
        id: `step-${item.id}`,
        text: t.template.removed,
        undo: async () => {
          const back = await call("addTemplateItem", { id: template.id, text: item.text, role: item.role, memberId: item.memberId, offset: item.offset }, quiet);
          if (!back.ok) return back.message;
          setItems(list => [...list, { ...back.value, text: item.text }]);
          return true;
        },
      });
    })();
  };
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const who = readWho(String(data.get("who")));
    setError(null);
    void (async () => {
      const r = await call("addTemplateItem", { id: template.id, text: String(data.get("text") ?? ""), ...who, offset: Number(data.get("when")) }, quiet);
      if (!r.ok) setError(r.message);
      else {
        setItems(list => [...list, r.value]);
        (form.elements.namedItem("text") as HTMLInputElement).value = "";
        (form.elements.namedItem("text") as HTMLInputElement).focus();
      }
    })();
  };
  const archive = async (archived: boolean) => {
    const r = await call("archiveTemplate", { id: template.id, archived }, quiet);
    if (!r.ok) return fail(r);
    if (archived) {
      toast({
        id: `archive-${template.id}`,
        text: t.template.archived,
        undo: async () => {
          const back = await call("archiveTemplate", { id: template.id, archived: false }, { quiet: true });
          return back.ok || back.message;
        },
      });
      await navigate("/chest/checklists");
    } else await refresh();
  };

  const whoOptions = (
    <>
      <option value="person">{t.template.roles.person[template.kind]}</option>
      <option value="manager">{t.template.roles.manager}</option>
      <option value="hr">{t.template.roles.hr}</option>
      <optgroup label={t.template.roles.someone}>
        {people.map(p => <option key={p.id} value={"member:" + p.id}>{p.name}</option>)}
      </optgroup>
    </>
  );
  const whenOptions = whenChoices.map(n => <option key={n} value={n}>{when(n)}</option>);

  return (
    <div className="template">
      {template.archived && (
        <div className="banner warn">
          <span>{t.template.archivedBanner}</span>
          <button type="button" className="button small" onClick={() => void archive(false)}>{t.template.restore}</button>
        </div>
      )}
      <div className="template-head">
        <KindBadge kind={template.kind} label={t.kinds[template.kind]} />
        <label className="title-edit">
          <span className="visually-hidden">{t.template.name}</span>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()} maxLength={limits.templateName} />
        </label>
      </div>
      <h2 className="eyebrow">{t.template.steps}</h2>
      {sorted.length === 0 ? <p className="muted">{t.template.empty}</p> : (
        <ol className="template-steps">
          {sorted.map(item => (
            <li key={item.id} className="template-step">
              <label className="grow">
                <span className="visually-hidden">{t.template.step}</span>
                <input className="field" defaultValue={item.text} maxLength={limits.itemText} onBlur={e => e.target.value.trim() !== item.text && change(item, { text: e.target.value.trim() })} />
              </label>
              <label>
                <span className="label small">{t.template.who}</span>
                <select className="select" value={whoValue(item)} onChange={e => change(item, readWho(e.target.value))}>{whoOptions}</select>
              </label>
              <label>
                <span className="label small">{t.template.when}</span>
                <select className="select" value={item.offset} onChange={e => change(item, { offset: Number(e.target.value) })}>{whenOptions}</select>
              </label>
              <button type="button" className="icon-button" onClick={() => remove(item)} aria-label={t.template.remove + " · " + item.text}><Trash /></button>
            </li>
          ))}
        </ol>
      )}
      <form className="add-step" onSubmit={add}>
        <h2 className="eyebrow">{t.template.add}</h2>
        <div className="add-row">
          <label className="grow">
            <span className="visually-hidden">{t.template.step}</span>
            <input name="text" className="field" placeholder={t.template.addPlaceholder} maxLength={limits.itemText} required />
          </label>
          <label>
            <span className="visually-hidden">{t.template.who}</span>
            <select name="who" className="select" defaultValue="hr" id={uid + "who"}>{whoOptions}</select>
          </label>
          <label>
            <span className="visually-hidden">{t.template.when}</span>
            <select name="when" className="select" defaultValue="0">{whenOptions}</select>
          </label>
          <button type="submit" className="button"><Plus />{t.template.addButton}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      <div className="row between">
        {!template.archived && items.length > 0 && <a className="button quiet" href={`/chest/checklists/new?template=${template.id}&kind=${template.kind}`}>{t.template.start}</a>}
        {!template.archived && <button type="button" className="button quiet small" onClick={() => void archive(true)}><Archive />{t.template.archive}</button>}
      </div>
    </div>
  );
}

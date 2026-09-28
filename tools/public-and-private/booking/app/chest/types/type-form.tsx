"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Bin, kindIcon } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { colors, durations, locationKinds, slugify, type Color, type LocationKind } from "../../../lib/model.ts";
import { createType, removeType, updateType } from "../actions.ts";

export type TypeValues = {
  title: string; slug: string; description: string; duration: number; interval: number; locationKind: LocationKind; location: string;
  bufferBefore: number; bufferAfter: number; noticeMinutes: number; windowDays: number; color: Color; active: boolean;
};

type Words = Pick<Catalogue, "types" | "kinds" | "colors" | "minutes" | "errors">;
const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const buffers = [0, 5, 10, 15, 30, 45, 60];

// Creating or editing a booking type: the name, how long, where — the rest
// behind "More options", with sensible defaults.
export function TypeForm({ id, initial, base, locale, t }: { id: string | null; initial: TypeValues; base: string; locale: string; t: Words }) {
  const [v, setV] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const f = t.types.form;
  const set = <K extends keyof TypeValues>(key: K, value: TypeValues[K]) => setV(old => ({ ...old, [key]: value }));
  const minutes = (n: number) => plural(t.minutes, n, locale);
  const durationChoices = [...new Set([...durations, v.duration])].sort((a, b) => a - b);

  const submit = () => start(async () => {
    const input = { ...v, noticeMinutes: v.noticeMinutes };
    const r = id ? await updateType(id, input) : await createType(input);
    if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
    setError(null);
    toast(f.saved);
    router.push("/chest/types");
    router.refresh();
  });

  return (
    <form className="card stack" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
      <div>
        <label className="label" htmlFor="title">{f.name}</label>
        <input id="title" className="field" maxLength={80} required placeholder={f.namePlaceholder} value={v.title} onChange={e => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} autoFocus={id === null} />
      </div>
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{f.duration}</legend>
        <div className="pills">
          {durationChoices.map(n => (
            <label key={n} className="choice"><input type="radio" name="duration" checked={v.duration === n} onChange={() => setV(old => ({ ...old, duration: n, interval: old.interval === old.duration ? n : old.interval }))} /><span>{minutes(n)}</span></label>
          ))}
        </div>
      </fieldset>
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{f.where}</legend>
        <div className="choices">
          {locationKinds.map(k => {
            const Icon = kindIcon[k];
            return <label key={k} className="choice"><input type="radio" name="kind" checked={v.locationKind === k} onChange={() => set("locationKind", k)} /><span><Icon />{t.kinds[k]}</span></label>;
          })}
        </div>
        {v.locationKind === "place" && <div><label className="label" htmlFor="location">{f.place}</label><input id="location" className="field" maxLength={300} placeholder={f.placePlaceholder} value={v.location} onChange={e => set("location", e.target.value)} /></div>}
        {v.locationKind === "video" && <div><label className="label" htmlFor="location">{f.video}</label><input id="location" className="field" type="url" inputMode="url" maxLength={300} value={v.location} onChange={e => set("location", e.target.value)} aria-describedby="video-hint" /><p id="video-hint" className="hint">{f.videoHint}</p></div>}
        {v.locationKind === "phone" && <p className="hint">{f.phoneHint}</p>}
        {v.locationKind === "other" && <div><label className="label" htmlFor="location">{f.other}</label><input id="location" className="field" maxLength={300} value={v.location} onChange={e => set("location", e.target.value)} /></div>}
      </fieldset>
      <div>
        <label className="label" htmlFor="description">{f.description}</label>
        <textarea id="description" className="field" rows={3} maxLength={1000} placeholder={f.descriptionPlaceholder} value={v.description} onChange={e => set("description", e.target.value)} />
      </div>
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{f.color}</legend>
        <div className="swatches">
          {colors.map(c => <label key={c} title={t.colors[c]}><input type="radio" name="color" checked={v.color === c} onChange={() => set("color", c)} aria-label={t.colors[c]} /><span style={{ "--sw": `var(--c-${c})` } as React.CSSProperties} /></label>)}
        </div>
      </fieldset>
      <details className="more">
        <summary>{f.more}</summary>
        <div className="stack">
          <div>
            <label className="label" htmlFor="slug">{f.address}</label>
            <div className="inline"><span className="muted">{base}/</span><input id="slug" className="field" style={{ maxWidth: 260 }} maxLength={40} value={v.slug} onChange={e => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></div>
          </div>
          <div className="grid-2">
            <Select id="interval" label={f.interval} value={v.interval} options={steps} show={minutes} onChange={n => set("interval", n)} />
            <Select id="before" label={f.bufferBefore} value={v.bufferBefore} options={buffers} show={minutes} onChange={n => set("bufferBefore", n)} />
            <Select id="after" label={f.bufferAfter} value={v.bufferAfter} options={buffers} show={minutes} onChange={n => set("bufferAfter", n)} />
            <div>
              <label className="label" htmlFor="notice">{f.notice}</label>
              <div className="inline"><input id="notice" className="field short" type="number" min={0} max={336} value={Math.round(v.noticeMinutes / 60)} onChange={e => set("noticeMinutes", Math.max(0, Math.min(336, Number(e.target.value) || 0)) * 60)} /><span className="muted">{f.noticeUnit}</span></div>
            </div>
            <div>
              <label className="label" htmlFor="window">{f.window}</label>
              <div className="inline"><input id="window" className="field short" type="number" min={1} max={365} value={v.windowDays} onChange={e => set("windowDays", Math.max(1, Math.min(365, Number(e.target.value) || 1)))} /><span className="muted">{f.windowUnit}</span></div>
            </div>
          </div>
          <label className="switch"><input type="checkbox" checked={v.active} onChange={e => set("active", e.target.checked)} />{f.active}</label>
        </div>
      </details>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="spread">
        <button type="submit" className="button" disabled={pending}>{id ? f.save : f.create}</button>
        {id && (
          <button type="button" className="link-button danger" disabled={pending} onClick={() => {
            if (!window.confirm(f.removeConfirm)) return;
            start(async () => {
              const r = await removeType(id);
              if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
              router.push("/chest/types");
              router.refresh();
            });
          }}><Bin />{f.remove}</button>
        )}
      </div>
    </form>
  );
}

function Select({ id, label, value, options, show, onChange }: { id: string; label: string; value: number; options: number[]; show: (n: number) => string; onChange: (n: number) => void }) {
  const all = [...new Set([...options, value])].sort((a, b) => a - b);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value} onChange={e => onChange(Number(e.target.value))}>
        {all.map(n => <option key={n} value={n}>{show(n)}</option>)}
      </select>
    </div>
  );
}

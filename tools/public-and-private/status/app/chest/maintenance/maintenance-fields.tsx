"use client";

import { ComponentChecks, type PickerGroup } from "../../../components/component-picker.tsx";
import { TimeSelect } from "../../../components/time-select.tsx";

// The fields of a maintenance window: what, when (in the Chest's time
// zone, 24-hour selects), which components, automatic posts.
export type WindowValue = { title: string; start: { day: string; minutes: number }; end: { day: string; minutes: number }; components: string[]; autoPosts: boolean };
type Words = { maintenance: Record<string, string>; compose: Record<string, string> };

export function MaintenanceFields({ value, onChange, groups, zoneNote, missing = null, t }: { value: WindowValue; onChange: (next: WindowValue) => void; groups: PickerGroup[]; zoneNote: string; missing?: string | null; t: Words }) {
  const w = t.maintenance;
  const set = (patch: Partial<WindowValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div>
        <label className="label" htmlFor="m-title">{w.title}</label>
        <input id="m-title" className="field big" maxLength={160} placeholder={w.titlePlaceholder} value={value.title} onChange={e => set({ title: e.target.value })} aria-invalid={missing ? true : undefined} aria-describedby={missing ? "m-title-missing" : undefined} />
        {missing && <p id="m-title-missing" className="error" role="alert">{missing}</p>}
      </div>
      <fieldset className="when-fields">
        <div className="when-row">
          <label className="label" htmlFor="m-start-day">{w.startDay}</label>
          <input id="m-start-day" type="date" className="field" required value={value.start.day} onChange={e => set({ start: { ...value.start, day: e.target.value }, ...(value.end.day < e.target.value ? { end: { ...value.end, day: e.target.value } } : {}) })} />
          <span className="label">{w.startTime}</span>
          <TimeSelect id="m-start-time" value={value.start.minutes} onChange={m => set({ start: { ...value.start, minutes: m } })} hourLabel={`${w.startDay} — ${t.compose.hour}`} minuteLabel={`${w.startDay} — ${t.compose.minute}`} />
        </div>
        <div className="when-row">
          <label className="label" htmlFor="m-end-day">{w.endDay}</label>
          <input id="m-end-day" type="date" className="field" required value={value.end.day} min={value.start.day} onChange={e => set({ end: { ...value.end, day: e.target.value } })} />
          <span className="label">{w.endTime}</span>
          <TimeSelect id="m-end-time" value={value.end.minutes} onChange={m => set({ end: { ...value.end, minutes: m } })} hourLabel={`${w.endDay} — ${t.compose.hour}`} minuteLabel={`${w.endDay} — ${t.compose.minute}`} />
        </div>
        <p className="hint">{zoneNote}</p>
      </fieldset>
      <ComponentChecks groups={groups} value={value.components} onChange={components => set({ components })} legend={w.components!} />
      <label className="check toggle">
        <input type="checkbox" checked={value.autoPosts} onChange={e => set({ autoPosts: e.target.checked })} aria-describedby="auto-help" />
        <span>{w.auto}</span>
      </label>
      <p id="auto-help" className="hint">{w.autoHelp}</p>
    </>
  );
}

"use client";

import { DateField, TimeSelect } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { ComponentChecks, type PickerGroup } from "../../../components/component-picker.tsx";
import { moveWindow, type WallTime } from "../../../lib/zone.ts";

// The fields of a maintenance window: what, when (in the Chest's time
// zone: the kit's DateField, typed in the editor's language or chosen on a
// calendar, and a 24-hour TimeSelect — never the browser's own fields,
// which follow the computer's locale), which components, automatic posts.
// Moving the start moves the end with it: the window keeps its length.
export type WindowValue = { title: string; start: WallTime; end: WallTime; components: string[]; autoPosts: boolean };
type Words = { maintenance: Record<string, string>; date: DateWords };

export function MaintenanceFields({ value, onChange, groups, zoneNote, today, missing = null, t }: { value: WindowValue; onChange: (next: WindowValue) => void; groups: PickerGroup[]; zoneNote: string; today: string; missing?: string | null; t: Words }) {
  const w = t.maintenance;
  const set = (patch: Partial<WindowValue>) => onChange({ ...value, ...patch });
  const start = (next: WallTime) => set(moveWindow(value.start, value.end, next));
  return (
    <>
      <div>
        <label className="label" htmlFor="m-title">{w.title}</label>
        <input id="m-title" className="field big" maxLength={160} placeholder={w.titlePlaceholder} value={value.title} onChange={e => set({ title: e.target.value })} aria-invalid={missing ? true : undefined} aria-describedby={missing ? "m-title-missing" : undefined} />
        {missing && <p id="m-title-missing" className="error" role="alert">{missing}</p>}
      </div>
      <fieldset className="when-fields">
        <div className="when-row">
          <DateField id="m-start-day" label={w.startDay!} value={value.start.day || null} onChange={day => day ? start({ ...value.start, day }) : set({ start: { ...value.start, day: "" } })} today={today} required labels={t.date} />
          <div className="time-field">
            <label className="label" htmlFor="m-start-time">{w.startTime}</label>
            <TimeSelect id="m-start-time" step={5} value={value.start.minutes} onChange={minutes => start({ ...value.start, minutes })} />
          </div>
        </div>
        <div className="when-row">
          <DateField id="m-end-day" label={w.endDay!} value={value.end.day || null} onChange={day => set({ end: { ...value.end, day: day ?? "" } })} today={today} min={value.start.day || null} required labels={t.date} />
          <div className="time-field">
            <label className="label" htmlFor="m-end-time">{w.endTime}</label>
            <TimeSelect id="m-end-time" step={5} value={value.end.minutes} onChange={minutes => set({ end: { ...value.end, minutes } })} />
          </div>
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

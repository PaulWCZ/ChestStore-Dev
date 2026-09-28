"use client";

import type { ChangeEvent } from "react";
import { format } from "../lib/i18n/format.ts";
import { readWork } from "../lib/work.ts";

// One select for what time is spent on: the projects open to the person,
// grouped by client, each alone and with each of its tasks ("Website ·
// Design"). Its value is "projectId" or "projectId:taskId".
export type PickerProject = { id: string; name: string; clientName: string | null; color: string; billable: boolean; tasks: { id: string; name: string }[] };

type Words = { label: string; choose: string; noClient: string; task: string };

export function WorkPicker({ projects, value, onChange, id, t, className = "field", disabled, hideLabel = true }: { projects: PickerProject[]; value: string; onChange: (value: string) => void; id: string; t: Words; className?: string; disabled?: boolean; hideLabel?: boolean }) {
  const groups = new Map<string, PickerProject[]>();
  for (const p of projects) {
    const key = p.clientName ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const known = value === "" || projects.some(p => p.id === readWork(value)?.projectId);
  return (
    <>
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "label"}>{t.label}</label>
      <select id={id} className={className} value={known ? value : ""} disabled={disabled} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
        <option value="" disabled>{t.choose}</option>
        {[...groups].map(([client, list]) => (
          <optgroup key={client} label={client || t.noClient}>
            {list.map(p => [
              <option key={p.id} value={p.id}>{p.name}</option>,
              ...p.tasks.map(k => <option key={p.id + ":" + k.id} value={`${p.id}:${k.id}`}>{format(t.task, { project: p.name, task: k.name })}</option>),
            ])}
          </optgroup>
        ))}
      </select>
    </>
  );
}

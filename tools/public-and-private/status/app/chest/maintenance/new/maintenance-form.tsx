"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PickerGroup } from "../../../../components/component-picker.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { planMaintenance } from "../../actions.ts";
import { MaintenanceFields, type WindowValue } from "../maintenance-fields.tsx";

// Plan a maintenance in one screen: what, when, what goes down, what
// customers read. It appears on the page at once as "planned".
export function MaintenanceForm({ groups, start, end, zoneNote, t }: { groups: PickerGroup[]; start: WindowValue["start"]; end: WindowValue["end"]; zoneNote: string; t: { maintenance: Record<string, string>; compose: Record<string, string>; errors: Record<ErrorCode, string> } }) {
  const w = t.maintenance;
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  const [value, setValue] = useState<WindowValue>({ title: "", start, end, components: [], autoPosts: true });
  const [body, setBody] = useState("");
  return (
    <form className="stack-l form" onSubmit={async e => {
      e.preventDefault();
      await run(() => planMaintenance({ ...value, body }), result => { toast(w.planned!); router.push(`/chest/incidents/${result.id}`); });
    }}>
      <MaintenanceFields value={value} onChange={setValue} groups={groups} zoneNote={zoneNote} t={t} />
      <div>
        <label className="label" htmlFor="m-text">{w.body}</label>
        <textarea id="m-text" className="field" required rows={4} maxLength={5000} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-describedby="m-hint" />
        <p id="m-hint" className="hint">{t.compose.bodyHint}</p>
      </div>
      <div className="submit-row">
        <button type="submit" className="button" disabled={pending}>{w.submit}</button>
        <a className="button link" href="/chest">{t.compose.cancel}</a>
      </div>
    </form>
  );
}

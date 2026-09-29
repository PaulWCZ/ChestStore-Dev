"use client";

import { useToast } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PickerGroup } from "../../../../components/component-picker.tsx";
import { LanguagePick, SecondField, SecondToggle, secondOf, type Languages } from "../../../../components/second-field.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { planMaintenance } from "../../actions.ts";
import { MaintenanceFields, type WindowValue } from "../maintenance-fields.tsx";

// Plan a maintenance in one screen: what, when, what goes down, what
// customers read (and, ticked, the same in the other language). It
// appears on the page at once as "planned".
export function MaintenanceForm({ groups, start, end, today, zoneNote, languages, t }: { groups: PickerGroup[]; start: WindowValue["start"]; end: WindowValue["end"]; today: string; zoneNote: string; languages: Languages; t: { maintenance: Record<string, string>; compose: Record<string, string>; errors: Record<ErrorCode, string>; date: DateWords } }) {
  const w = t.maintenance;
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  const [value, setValue] = useState<WindowValue>({ title: "", start, end, components: [], autoPosts: true });
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState(languages.main);
  const second = secondOf(language, languages.options);
  const [withSecond, setWithSecond] = useState(false);
  const [titleSecond, setTitleSecond] = useState("");
  const [bodySecond, setBodySecond] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const empty = !value.title.trim() ? "m-title" : !body.trim() ? "m-text" : null;
    setMissing(empty);
    if (empty) {
      document.getElementById(empty)?.focus();
      return;
    }
    await run(() => planMaintenance({ ...value, body, language, ...(withSecond ? { second: { title: titleSecond, body: bodySecond } } : {}) }), result => { toast(w.planned!); router.push(`/chest/incidents/${result.id}`); });
  };
  return (
    <form className="stack-l form" noValidate onSubmit={submit}>
      <MaintenanceFields value={value} onChange={setValue} groups={groups} zoneNote={zoneNote} today={today} missing={missing === "m-title" ? t.errors.required : null} t={t} />
      <div>
        <label className="label" htmlFor="m-text">{w.body}</label>
        <textarea id="m-text" className="field" rows={4} maxLength={5000} lang={language} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-describedby={missing === "m-text" ? "m-text-missing m-hint" : "m-hint"} aria-invalid={missing === "m-text" || undefined} />
        {missing === "m-text" && <p id="m-text-missing" className="error" role="alert">{t.errors.required}</p>}
        <p id="m-hint" className="hint">{t.compose.bodyHint}</p>
      </div>
      <div className="languages-row">
        <LanguagePick id="m-language" label={t.compose.writtenIn!} value={language} onChange={setLanguage} options={languages.options} />
        <SecondToggle checked={withSecond} onChange={setWithSecond} label={format(t.compose.alsoIn!, { language: second.name })} />
      </div>
      {withSecond && (
        <>
          <SecondField id="m-title-second" label={format(t.compose.titleIn!, { language: second.name })} value={titleSecond} onChange={setTitleSecond} lang={second.code} multiline={false} max={160} />
          <SecondField id="m-text-second" label={format(t.compose.bodyIn!, { language: second.name })} value={bodySecond} onChange={setBodySecond} lang={second.code} rows={4} />
        </>
      )}
      <div className="submit-row">
        <button type="submit" className="button" disabled={pending}>{w.submit}</button>
        <a className="button link" href="/chest">{t.compose.cancel}</a>
      </div>
    </form>
  );
}

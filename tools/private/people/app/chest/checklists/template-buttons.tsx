"use client";

import { Segmented, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Plus, Sparkle } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { limits } from "../../../lib/model.ts";
import { addExampleTemplates, createTemplate } from "../actions.ts";

type Words = {
  newTemplate: string; examples: string; scratch: string;
  template: { newName: string; newKind: string; create: string; creating: string; cancel: string };
  kinds: { onboarding: string; offboarding: string };
  errors: Record<ErrorCode, string>;
};

// One click gives two real templates to start from, in HR's language.
export function ExamplesButton({ t }: { t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
      const result = await addExampleTemplates();
      if (!result.ok) toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
      else router.refresh();
    })}><Sparkle />{t.examples}</button>
  );
}

// A new template: its name and whether it is for arrivals or departures;
// its steps are written on its own page.
export function NewTemplate({ t, label, quiet = false }: { t: Words; label: string; quiet?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"onboarding" | "offboarding">("onboarding");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className={quiet ? "button quiet small" : "button"} onClick={() => setOpen(true)}><Plus />{label}</button>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      const result = await createTemplate({ kind, name: String(data.get("name") ?? "") });
      if (!result.ok) setError(format(t.errors[result.error], result.values ?? {}));
      else router.push(`/chest/checklists/templates/${result.value.id}`);
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor={uid + "name"} className="label">{t.template.newName}</label>
        <input id={uid + "name"} name="name" className="field" maxLength={limits.templateName} required autoFocus />
      </div>
      <Segmented label={t.template.newKind} hideLabel={false} value={kind} onChange={setKind} options={[{ value: "onboarding", label: t.kinds.onboarding }, { value: "offboarding", label: t.kinds.offboarding }]} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="button" disabled={pending}>{pending ? t.template.creating : t.template.create}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.template.cancel}</button>
      </div>
    </form>
  );
}

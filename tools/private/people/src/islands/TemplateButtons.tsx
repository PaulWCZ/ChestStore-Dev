import { Segmented } from "@argentic/chest-ui/components";
import { call, navigate } from "@argentic/chest-app/client";
import { useId, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { Plus, Sparkle } from "../components/icons.tsx";
import { limits } from "../shared/model.ts";

type Words = {
  template: { newName: string; newKind: string; create: string; creating: string; cancel: string };
  kinds: { onboarding: string; offboarding: string };
};

// One click gives two real templates to start from, in HR's language.
export function ExamplesButton({ label }: { label: string }) {
  const [pending, run] = useBusy();
  return <button type="button" className="button" disabled={pending} onClick={() => void run(() => call("addExampleTemplates", {}))}><Sparkle />{label}</button>;
}

// A new template: its name and whether it is for arrivals or departures;
// its steps are written on its own page.
export function NewTemplate({ t, label, quiet = false }: { t: Words; label: string; quiet?: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"onboarding" | "offboarding">("onboarding");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  if (!open) return <button type="button" className={quiet ? "button quiet small" : "button"} onClick={() => setOpen(true)}><Plus />{label}</button>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const result = await call("createTemplate", { kind, name: String(data.get("name") ?? "") }, { refresh: false, quiet: true });
      if (!result.ok) setError(result.message);
      else await navigate(`/chest/checklists/templates/${result.value.id}`);
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

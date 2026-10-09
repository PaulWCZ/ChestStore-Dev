import { call, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import { Check } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// The accountant's first visit: what to check once before the team starts,
// each a link to its place in Settings → Company. "It's done" hides it for
// good (the settings stay where they are).
export function SetupBanner({ t }: { t: Catalogue["home"]["setup"] }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const steps: [string, string][] = [["categories", t.categories], ["approvers", t.approvers], ["scale", t.scale], ["bank", t.bank]];
  return (
    <section className="paper flat setup" aria-labelledby="setup-title">
      <h2 id="setup-title">{t.title}</h2>
      <p className="hint">{t.body}</p>
      <ol className="setup-steps">
        {steps.map(([anchor, words]) => <li key={anchor}><a href={`/chest/settings/company#${anchor}`}>{words}</a></li>)}
      </ol>
      <div className="actions-bar">
        <a className="button" href="/chest/settings/company">{t.open}</a>
        <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
          const result = await call("updateCompany", { input: { setupDone: true } });
          if (!result.ok) return;
          setGone(true);
          toast(t.hidden);
        })}><Check />{t.done}</button>
      </div>
    </section>
  );
}

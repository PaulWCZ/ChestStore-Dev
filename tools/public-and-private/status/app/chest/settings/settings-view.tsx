"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import type { Result } from "../../../lib/errors.ts";
import { format } from "../../../lib/i18n/format.ts";
import { removeTemplate, savePage } from "../actions.ts";

type Words = { settings: Record<string, string>; errors: Record<ErrorCode, string>; widget: string };
type ImportResult = { incidents: number; maintenances: number; components: number; already: number; open: number; skipped: number };

// A piece of code to paste elsewhere, with a Copy button.
function Snippet({ id, label, code, t }: { id: string; label: string; code: string; t: Words }) {
  const toast = useToast();
  return (
    <div className="snippet">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="snippet-row">
        <input id={id} className="field mono" readOnly value={code} onFocus={e => e.target.select()} />
        <button type="button" className="button quiet small" onClick={() => void navigator.clipboard?.writeText(code).then(() => toast(t.settings.copied!), () => {})}>{t.settings.copy}</button>
      </div>
    </div>
  );
}

export function SettingsView({ origin, settings, branded, templates, t }: { origin: string; settings: { website: string; support: string; embedSites: string }; branded: boolean; templates: { id: string; name: string; title: string }[]; t: Words }) {
  const w = t.settings;
  const toast = useToast();
  const router = useRouter();
  const { run, pending } = useRun(t.errors);
  const [website, setWebsite] = useState(settings.website);
  const [support, setSupport] = useState(settings.support);
  const [sites, setSites] = useState(settings.embedSites);
  const [importing, setImporting] = useState(false);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => savePage({ website, support, embedSites: sites }), w.saved);
  };
  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const files = (form.elements.namedItem("file") as HTMLInputElement).files;
    if (!files || files.length === 0) {
      toast(t.errors.required);
      return;
    }
    setImporting(true);
    try {
      // Several files are read as one list of Statuspage's answers.
      const texts = await Promise.all([...files].map(f => f.text()));
      const body = new FormData();
      body.set("text", texts.length === 1 ? texts[0]! : `[${texts.join(",")}]`);
      const answer = await fetch("/chest/import", { method: "POST", body });
      const result = (await answer.json()) as Result<ImportResult>;
      if (!result.ok) toast(format(t.errors[result.error] ?? t.errors.unknown, result.values ?? {}));
      else {
        const r = result.value;
        toast(format(w.imported!, { incidents: r.incidents, maintenances: r.maintenances, components: r.components }) + (r.open + r.already + r.skipped > 0 ? " " + format(w.importSkipped!, { open: r.open, already: r.already, skipped: r.skipped }) : ""));
        form.reset();
        router.refresh();
      }
    } catch {
      toast(t.errors.unavailable);
    } finally {
      setImporting(false);
    }
  };
  const badge = `<a href="${origin}/"><img src="${origin}/badge.svg" alt="${w.badgeAlt}" height="20"></a>`;
  const frame = `<iframe src="${origin}/embed" title="${t.widget}" height="64" style="width:100%;max-width:480px;border:0"></iframe>`;
  return (
    <>
      <section className="card pad stack" aria-labelledby="links-title">
        <h2 id="links-title">{w.linksTitle}</h2>
        <form className="stack" onSubmit={save}>
          <div>
            <label className="label" htmlFor="website">{w.website}</label>
            <input id="website" className="field" type="url" inputMode="url" maxLength={300} placeholder={w.websitePlaceholder} value={website} onChange={e => setWebsite(e.target.value)} aria-describedby="website-hint" />
            <p id="website-hint" className="hint">{w.websiteHint}</p>
          </div>
          <div>
            <label className="label" htmlFor="support">{w.support}</label>
            <input id="support" className="field" maxLength={300} placeholder={w.supportPlaceholder} value={support} onChange={e => setSupport(e.target.value)} aria-describedby="support-hint" />
            <p id="support-hint" className="hint">{w.supportHint}</p>
          </div>
          <p className="note">{branded ? w.brandOn : w.brandOff}</p>
          <p className="note">{w.domain}</p>
          <div><button type="submit" className="button" disabled={pending}>{w.save}</button></div>
        </form>
      </section>

      <section className="card pad stack" aria-labelledby="share-title">
        <h2 id="share-title">{w.shareTitle}</h2>
        <h3>{w.badgeTitle}</h3>
        <p className="hint">{w.badgeHint}</p>
        <p><img src="/badge.svg" alt={w.badgeAlt} height={20} /></p>
        <Snippet id="badge-code" label={w.badgeTitle!} code={badge} t={t} />
        <h3>{w.widgetTitle}</h3>
        <p className="hint">{w.widgetHint}</p>
        <Snippet id="widget-code" label={w.widgetTitle!} code={frame} t={t} />
        <form className="stack" onSubmit={save}>
          <div>
            <label className="label" htmlFor="embed-sites">{w.embedSites}</label>
            <textarea id="embed-sites" className="field mono" rows={3} value={sites} onChange={e => setSites(e.target.value)} aria-describedby="embed-hint" />
            <p id="embed-hint" className="hint">{w.embedSitesHint}</p>
          </div>
          <div><button type="submit" className="button quiet" disabled={pending}>{w.save}</button></div>
        </form>
        <h3>{w.apiTitle}</h3>
        <p className="hint">{w.apiHint}</p>
        <Snippet id="api-code" label={w.apiTitle!} code={`${origin}/api/v2/summary.json`} t={t} />
      </section>

      <section className="card pad stack" aria-labelledby="templates-title">
        <h2 id="templates-title">{w.templatesTitle}</h2>
        <p className="hint">{w.templatesHint}</p>
        {templates.length === 0 ? <p className="muted">{w.templatesEmpty}</p> : (
          <ul className="plain-list">
            {templates.map(x => (
              <li key={x.id} className="plain-row">
                <span><strong>{x.name}</strong>{x.name !== x.title && <span className="muted"> · {x.title}</span>}</span>
                <button type="button" className="icon-button" disabled={pending} aria-label={format(w.templateRemove!, { name: x.name })} onClick={() => void run(() => removeTemplate(x.id), w.templateRemoved)}><Trash /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card pad stack" aria-labelledby="import-title">
        <h2 id="import-title">{w.importTitle}</h2>
        <p className="hint">{w.importHint}</p>
        <form className="stack" onSubmit={upload}>
          <div>
            <label className="label" htmlFor="import-file">{w.importFile}</label>
            <input id="import-file" name="file" type="file" className="field" accept="application/json,.json" multiple />
          </div>
          <div><button type="submit" className="button quiet" disabled={importing}>{importing ? w.importing : w.importButton}</button></div>
        </form>
      </section>

      <section className="card pad stack" aria-labelledby="export-title">
        <h2 id="export-title">{w.exportTitle}</h2>
        <p className="hint">{w.exportHint}</p>
        <div className="actions">
          <a className="button quiet" href="/chest/export" download>{w.exportJson}</a>
          <a className="button quiet" href="/chest/export/subscribers.csv" download>{w.exportCsv}</a>
        </div>
      </section>
    </>
  );
}

"use client";

import { useZones } from "../../../components/use-zones.ts";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CopyButton } from "../../../components/copy-button.tsx";
import { Alert, Calendar, Download, Gear, Link, Person } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Result } from "../../../lib/errors.ts";
import { eraseGuest, newFeed, savePage, saveSettings, stopFeed } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };

function useRun(t: Words) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const run = <T,>(step: () => Promise<Result<T>>, done?: (value: T) => string | null) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      setError(null);
      const text = done?.(r.value);
      if (text) toast(text);
      router.refresh();
    });
  return { pending, error, run };
}

function Box({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="card stack"><h2>{icon}{title}</h2>{children}</section>;
}

export function PageSettings({ host, origin, t }: { host: { slug: string; welcome: string; listed: boolean; hasFeed: boolean }; origin: string; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  const [feed, setFeed] = useState<string | null>(null);
  return (
    <>
      <Box title={s.page} icon={<Person />}>
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          run(() => savePage({ slug: String(d.get("slug") ?? ""), welcome: String(d.get("welcome") ?? ""), listed: d.get("listed") === "on" }), () => s.saved);
        }}>
          <div>
            <label className="label" htmlFor="slug">{s.address}</label>
            <div className="inline"><span className="muted">{origin}/</span><input id="slug" name="slug" className="field" style={{ maxWidth: 260 }} maxLength={40} defaultValue={host.slug} required /></div>
          </div>
          <div><label className="label" htmlFor="welcome">{s.welcome}</label><textarea id="welcome" name="welcome" className="field" rows={2} maxLength={300} placeholder={s.welcomePlaceholder} defaultValue={host.welcome} /></div>
          <label className="switch"><input type="checkbox" name="listed" defaultChecked={host.listed} />{s.listed}</label>
          {error && <p className="error" role="alert"><Alert />{error}</p>}
          <div><button type="submit" className="button" disabled={pending}>{s.save}</button></div>
        </form>
      </Box>
      <Box title={s.feed} icon={<Calendar />}>
        <p className="hint">{s.feedHint}</p>
        {feed ? (
          <div className="stack-s">
            <p className="notice calm"><Link />{s.feedShown}</p>
            <code>{feed}</code>
            <div><CopyButton text={feed} label={s.feedCopy} done={s.feedCopied} /></div>
          </div>
        ) : host.hasFeed ? <p className="tag free" style={{ alignSelf: "flex-start" }}>{s.feedOn}</p> : null}
        <div className="row">
          <button type="button" className="button soft" disabled={pending} onClick={() => run(() => newFeed(), url => { setFeed(url); return null; })}>{host.hasFeed || feed ? s.feedAgain : s.feedNew}</button>
          {(host.hasFeed || feed) && <button type="button" className="link-button danger" disabled={pending} onClick={() => run(() => stopFeed(), () => { setFeed(null); return null; })}>{s.feedStop}</button>}
        </div>
      </Box>
    </>
  );
}

export function CompanySettings({ admin, settings, locale, t }: { admin: boolean; settings: { companyName: string; retentionMonths: number; defaultZone: string }; locale: string; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  const zones = useZones(settings.defaultZone);
  return (
    <Box title={s.company} icon={<Gear />}>
      {!admin && <p className="hint">{s.readOnly}</p>}
      <form className="stack" onSubmit={e => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        run(() => saveSettings({ companyName: String(d.get("company") ?? ""), retentionMonths: Number(d.get("retention") ?? 24), defaultZone: String(d.get("zone") ?? "") }), () => s.saved);
      }}>
        <fieldset disabled={!admin} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <div><label className="label" htmlFor="company">{s.companyName}</label><input id="company" name="company" className="field" maxLength={120} defaultValue={settings.companyName} /></div>
          <div>
            <label className="label" htmlFor="zone">{s.defaultZone}</label>
            <select id="zone" name="zone" className="field" style={{ maxWidth: 360 }} defaultValue={settings.defaultZone}>
              {zones.map(z => <option key={z} value={z}>{z.replace(/_/gu, " ")}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="retention">{s.retention}</label><input id="retention" name="retention" type="number" min={0} max={120} className="field short" defaultValue={settings.retentionMonths} /></div>
          {admin && <div><button type="submit" className="button" disabled={pending}>{s.save}</button></div>}
        </fieldset>
      </form>
      {admin && (
        <>
          <form className="stack-s" onSubmit={e => {
            e.preventDefault();
            const form = e.currentTarget;
            const address = String(new FormData(form).get("email") ?? "");
            run(() => eraseGuest(address), n => { form.reset(); return plural(s.erased, n, locale); });
          }}>
            <h3>{s.erase}</h3>
            <p className="hint">{s.eraseHint}</p>
            <div className="inline">
              <label className="visually-hidden" htmlFor="erase">{s.erase}</label>
              <input id="erase" name="email" type="email" className="field" style={{ maxWidth: 320 }} required autoComplete="off" />
              <button type="submit" className="button quiet" disabled={pending}>{s.eraseButton}</button>
            </div>
          </form>
          <div><a className="button quiet" href="/chest/export?who=all"><Download />{s.export}</a></div>
        </>
      )}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </Box>
  );
}

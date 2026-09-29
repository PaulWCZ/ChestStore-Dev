"use client";

import { Confirm, FilePicker, Switch, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CopyButton } from "../../../components/copy-button.tsx";
import { Alert, Arrow, Calendar, Download, Gear, Globe, Link, Moved, Person } from "../../../components/icons.tsx";
import { ZoneSelect } from "../../../components/zone-select.tsx";
import { format, intl, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Result } from "../../../lib/errors.ts";
import type { ZoneGroup } from "../../../lib/zones.ts";
import { eraseGuest, importCalendly, saveSites, newFeed, savePage, savePrefs, saveSettings, stopFeed } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; files: Catalogue["files"] };

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

// chestCalendar: the Chest's page of the member's calendar feed, where
// every booking goes (null: this Chest has no calendar bridge yet — the
// tool's own feed is then the way).
export function PageSettings({ host, chestCalendar, origin, t }: { host: { slug: string; welcome: string; listed: boolean; hasFeed: boolean; emailMe: boolean; dailyMax: number }; chestCalendar: string | null; origin: string; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  const [feed, setFeed] = useState<string | null>(null);
  const [emailMe, setEmailMe] = useState(host.emailMe);
  const own = (
    <>
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
    </>
  );
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
        {chestCalendar ? (
          <>
            <p>{s.chestCalendar}</p>
            <div><a className="button soft" href={chestCalendar}><Arrow />{s.chestCalendarOpen}</a></div>
          </>
        ) : <p className="hint">{s.feedHint}</p>}
        {/* Takes effect at once: the kit's Switch. */}
        <Switch label={s.emailMe} checked={emailMe} disabled={pending} onChange={on => { setEmailMe(on); run(() => savePrefs({ dailyMax: host.dailyMax, emailMe: on }), () => s.saved); }} />
        <p className="hint">{s.calendarDelay}</p>
        {chestCalendar ? (
          <details className="more">
            <summary>{s.feedOwn}</summary>
            <div className="stack">
              <p className="hint">{s.feedHint}</p>
              {own}
            </div>
          </details>
        ) : own}
      </Box>
    </>
  );
}

// Moving from Calendly: its "Scheduled events" export.
export function ImportCalendly({ zone, zones, locale, t }: { zone: string; zones: ZoneGroup[]; locale: string; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  const [conflicts, setConflicts] = useState<string | null>(null);
  // The file stays in the browser (no upload): its text is sent to the
  // import, which reads it on the server.
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [missing, setMissing] = useState(false);
  return (
    <Box title={s.importTitle} icon={<Moved />}>
      <p className="hint">{s.importHint}</p>
      <form className="stack-s" onSubmit={e => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const file = files.find(f => f.file)?.file;
        const fileZone = String(d.get("zone") ?? zone);
        if (!file) return setMissing(true);
        setMissing(false);
        void file.text().then(text => run(() => importCalendly(text, fileZone), r => {
          setConflicts(r.conflicts.length > 0 ? format(s.importConflicts, { list: r.conflicts.map(c => `${c.name} (${new Intl.DateTimeFormat(intl(locale), { timeZone: fileZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(c.start))})`).join(", ") }) : null);
          setFiles([]);
          return plural(s.importDone, r.imported, locale);
        }));
      }}>
        <FilePicker label={s.importFile} files={files} onChange={list => { setFiles(list); setMissing(false); }} maxFiles={1} maxSize={1 << 20} accept={[".csv", "text/csv"]} labels={t.files} />
        {missing && <p className="error" role="alert"><Alert />{s.importMissing}</p>}
        <div><label className="label" htmlFor="import-zone">{s.importZone}</label><ZoneSelect id="import-zone" name="zone" className="field wide-select" value={zone} groups={zones} /></div>
        <div><button type="submit" className="button soft" disabled={pending}>{s.importButton}</button></div>
      </form>
      {conflicts && <p className="notice" role="status"><Alert />{conflicts}</p>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </Box>
  );
}

// The code a website pastes: the booking pages in a frame (once the Chest
// lets them be framed), or a plain button that opens them.
const quoted = (text: string) => `"${text.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;")}"`;
const frameCode = (url: string, title: string) => `<iframe src=${quoted(url)} title=${quoted(title)} style="width:100%;min-height:760px;border:0" loading="lazy"></iframe>`;
// The button wears the page's look (the company's brand, when it gave one):
// its main colour and the text colour measured on it.
const buttonCode = (url: string, text: string, colors: { accent: string; ink: string }) => `<a href=${quoted(url)} target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${colors.accent};color:${colors.ink};font:600 16px sans-serif;text-decoration:none">${text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;")}</a>`;

export function CompanySettings({ admin, settings, zones, locale, t }: { admin: boolean; settings: { companyName: string; retentionMonths: number; defaultZone: string }; zones: ZoneGroup[]; locale: string; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  // Erasing a guest's data is for good (GDPR): asked first, in the page.
  const [erasing, setErasing] = useState<{ address: string; form: HTMLFormElement } | null>(null);
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
            <ZoneSelect id="zone" name="zone" className="field wide-select" value={settings.defaultZone} groups={zones} />
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
            const address = String(new FormData(form).get("email") ?? "").trim();
            if (address) setErasing({ address, form });
          }}>
            <h3>{s.erase}</h3>
            <p className="hint">{s.eraseHint}</p>
            <div className="inline">
              <label className="visually-hidden" htmlFor="erase">{s.erase}</label>
              <input id="erase" name="email" type="email" className="field" style={{ maxWidth: 320 }} required autoComplete="off" />
              <button type="submit" className="button quiet" disabled={pending}>{s.eraseButton}</button>
            </div>
          </form>
          <Confirm open={erasing !== null} title={s.eraseTitle} body={format(s.eraseConfirm, { email: erasing?.address ?? "" })} confirmLabel={s.eraseButton} cancelLabel={s.cancel} busy={pending}
            onCancel={() => setErasing(null)}
            onConfirm={() => {
              if (!erasing) return;
              const { address, form } = erasing;
              setErasing(null);
              run(() => eraseGuest(address), n => { form.reset(); return plural(s.erased, n, locale); });
            }} />
          <div><a className="button quiet" href="/chest/export?who=all"><Download />{s.export}</a></div>
        </>
      )}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </Box>
  );
}

// The company's website: which sites may show the booking pages, and the
// code to paste there.
export function EmbedSettings({ sites, origin, colors, t }: { sites: string[]; origin: string; colors: { accent: string; ink: string }; t: Words }) {
  const s = t.settings;
  const { pending, error, run } = useRun(t);
  return (
    <Box title={s.embed} icon={<Globe />}>
      <p className="hint">{s.embedHint}</p>
      <form className="stack-s" onSubmit={e => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("sites") ?? "");
        run(() => saveSites(value), () => s.saved);
      }}>
        <label className="label" htmlFor="sites">{s.embedSites}</label>
        <textarea id="sites" name="sites" className="field" rows={2} placeholder={s.embedPlaceholder} defaultValue={sites.join("\n")} />
        <div><button type="submit" className="button" disabled={pending}>{s.save}</button></div>
      </form>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="stack-s">
        <label className="label" htmlFor="frame-code">{s.embedCode}</label>
        <textarea id="frame-code" className="field embed-code" readOnly value={frameCode(`${origin}/`, s.buttonText)} />
        <div><CopyButton text={frameCode(`${origin}/`, s.buttonText)} label={s.embedCopy} done={s.embedCopied} /></div>
        <label className="label" htmlFor="button-code">{s.embedButtonCode}</label>
        <textarea id="button-code" className="field embed-code" readOnly value={buttonCode(`${origin}/`, s.buttonText, colors)} />
        <div><CopyButton text={buttonCode(`${origin}/`, s.buttonText, colors)} label={s.embedCopy} done={s.embedCopied} /></div>
        <p className="hint">{s.embedNote}</p>
      </div>
    </Box>
  );
}

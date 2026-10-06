import { call, fill, toast } from "@argentic/chest-app/client";
import { Box } from "../components/box.tsx";
import { Globe, Mail } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Settings: the public form — its address, whether customers are emailed
// (and where their email replies land: the company's inbox, never Support),
// open or closed, the company's name, a sentence above it per language
// (English shows where one is left empty), the help centre's address, how
// long closed tickets are kept. Administrators change it; the others read.
export function FormBox({ settings, publicAddress, mail, canSettings, languages, t }: { settings: { companyName: string; formOpen: boolean; intros: Record<string, string>; retentionMonths: number; helpUrl: string }; publicAddress: string; mail: { ok: boolean; reason: string | null; replyTo: string | null }; canSettings: boolean; languages: { code: string; label: string }[]; t: Catalogue["settings"] }) {
  async function save(d: FormData) {
    const intros = Object.fromEntries(languages.map(({ code }) => [code, String(d.get(`intro-${code}`) ?? "")]));
    const r = await call("saveSettings", { input: { companyName: String(d.get("company") ?? ""), intros, helpUrl: String(d.get("help") ?? ""), formOpen: d.get("open") === "on", retentionMonths: Number(d.get("retention") ?? 24) } });
    if (r.ok) toast(t.saved);
  }
  return (
    <Box title={t.form} icon={<Globe />}>
      <p className="copy-line"><span className="muted">{t.address}</span><code>{publicAddress}</code></p>
      {mail.ok
        ? <p className="notice"><Mail /><span>{t.mailOk} {mail.replyTo ? fill(t.mailReplies, { address: mail.replyTo }) : t.mailRepliesSender}</span></p>
        : mail.reason === "unknown" ? null
        : <p className="notice warm"><Mail /><span>{mail.reason === "not_connected" ? t.mailNotConnected : mail.reason === "suspended" || mail.reason === "quota" ? t.mailPaused : t.noMail}</span></p>}
      {!canSettings && <p className="hint">{t.readOnly}</p>}
      <form className="stack" onSubmit={e => { e.preventDefault(); void save(new FormData(e.currentTarget)); }}>
        <fieldset disabled={!canSettings} className="stack bare">
          <label className="switch"><input type="checkbox" name="open" defaultChecked={settings.formOpen} />{t.formOpen}</label>
          <div><label className="label" htmlFor="company">{t.company}</label><input id="company" name="company" className="field" maxLength={80} defaultValue={settings.companyName} /></div>
          {languages.map(({ code, label }) => (
            <div key={code}>
              <label className="label" htmlFor={`intro-${code}`}>{fill(t.introIn, { language: label })}</label>
              <textarea id={`intro-${code}`} name={`intro-${code}`} lang={code} className="field" rows={2} maxLength={500} defaultValue={settings.intros[code] ?? ""} aria-describedby={code === "en" ? undefined : `intro-${code}-hint`} />
              {code !== "en" && <p id={`intro-${code}-hint`} className="hint">{t.introFallback}</p>}
            </div>
          ))}
          <div>
            <label className="label" htmlFor="help">{t.helpUrl}</label>
            <input id="help" name="help" type="url" className="field" maxLength={300} defaultValue={settings.helpUrl} placeholder={t.helpPlaceholder} aria-describedby="help-hint" />
            <p id="help-hint" className="hint">{t.helpHint}</p>
          </div>
          <div><label className="label" htmlFor="retention">{t.retention}</label><input id="retention" name="retention" type="number" min={0} max={120} className="field narrow" defaultValue={settings.retentionMonths} /></div>
          {canSettings && <div><button type="submit" className="button">{t.save}</button></div>}
        </fieldset>
      </form>
    </Box>
  );
}

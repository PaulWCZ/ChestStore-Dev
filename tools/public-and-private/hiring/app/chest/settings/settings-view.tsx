"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "../../../components/copy-button.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { limits, retentionChoices } from "../../../lib/model.ts";
import { saveSettings } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; retention: Catalogue["retention"]; errors: Catalogue["errors"]; common: Catalogue["common"]; careers: Catalogue["careers"] };

export function SettingsView({ settings, fallbackName, address, t }: { settings: { companyName: string; intro: string; careersOpen: boolean; retentionMonths: number }; fallbackName: string; address: string; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const w = t.settings;
  const words: Record<number, string> = { 6: t.retention.m6, 12: t.retention.m12, 24: t.retention.m24 };
  return (
    <form className="job-form" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      setError(null);
      start(async () => {
        const r = await saveSettings({ companyName: String(data.get("companyName") ?? ""), intro: String(data.get("intro") ?? ""), careersOpen: data.get("careersOpen") === "on", retentionMonths: Number(data.get("retentionMonths")) });
        if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
        toast(w.saved);
      });
    }}>
      <div className="panel address">
        <span className="label">{w.address}</span>
        <a href={address} target="_blank" rel="noopener">{address}</a>
        <CopyButton text={address} label={w.copy} done={t.common.copied} />
      </div>
      <div className="field-block">
        <label className="label" htmlFor="companyName">{w.company}</label>
        <input id="companyName" name="companyName" className="field" maxLength={limits.companyName} defaultValue={settings.companyName} placeholder={fallbackName} aria-describedby="company-hint" />
        <p className="hint" id="company-hint">{w.companyHint}</p>
      </div>
      <div className="field-block">
        <label className="label" htmlFor="intro">{w.intro}</label>
        <textarea id="intro" name="intro" className="field" rows={3} maxLength={limits.intro} defaultValue={settings.intro} placeholder={t.careers.intro} aria-describedby="intro-hint" />
        <p className="hint" id="intro-hint">{w.introHint}</p>
      </div>
      <label className="check">
        <input type="checkbox" name="careersOpen" defaultChecked={settings.careersOpen} aria-describedby="open-hint" />
        <span>{w.open}</span>
      </label>
      <p className="hint tight" id="open-hint">{w.openHint}</p>
      <div className="field-block">
        <label className="label" htmlFor="retentionMonths">{w.retention}</label>
        <select id="retentionMonths" name="retentionMonths" className="field short" defaultValue={settings.retentionMonths} aria-describedby="retention-hint">
          {retentionChoices.map(m => <option key={m} value={m}>{words[m]}</option>)}
        </select>
        <p className="hint" id="retention-hint">{w.retentionHint}</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" className="button" disabled={pending}>{w.save}</button></div>
    </form>
  );
}

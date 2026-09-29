"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Globe } from "../../../components/icons.tsx";
import { format, languageNames } from "../../../lib/i18n/format.ts";
import { locales, type Catalogue } from "../../../lib/i18n/index.ts";
import { saveSettings } from "../actions.ts";
import { Box } from "./settings-view.tsx";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; embedTitle: string };

// The form inside the company's own website: the websites allowed to show
// it (the page's frame-ancestors policy lists only them; every other site
// is refused), and a code to paste — a plain frame, no script: nothing of
// the company's website runs here, nothing of Support runs there.
export function EmbedBox({ origins, publicAddress, canSettings, t }: { origins: string[]; publicAddress: string; canSettings: boolean; t: Words }) {
  const s = t.settings;
  const [lang, setLang] = useState<string>(locales[0]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const base = publicAddress.replace(/\/$/u, "");
  const title = t.embedTitle.replace(/["<>&]/gu, "");
  const code = `<iframe src="${base}/?embed=1&amp;lang=${lang}" ` + `title="${title}" style="width:100%;height:1100px;border:0" loading="lazy"></iframe>`;
  return (
    <Box title={s.embed} icon={<Globe />}>
      <p className="hint">{s.embedHint}</p>
      <form className="stack" onSubmit={e => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("origins") ?? "");
        start(async () => {
          const r = await saveSettings({ frameOrigins: value });
          toast(r.ok ? { id: "embed", text: s.saved } : { text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
        });
      }}>
        <fieldset disabled={!canSettings} className="stack bare">
          <div>
            <label className="label" htmlFor="origins">{s.frameOrigins}</label>
            <textarea id="origins" name="origins" className="field" rows={2} defaultValue={origins.join("\n")} placeholder={s.originPlaceholder} spellCheck={false} />
          </div>
          {canSettings && <div><button type="submit" className="button quiet" disabled={pending}>{s.save}</button></div>}
        </fieldset>
      </form>
      {origins.length > 0 && (
        <div className="stack">
          <label className="label" htmlFor="embed-lang">{s.embedLanguage}</label>
          <select id="embed-lang" className="select medium" value={lang} onChange={e => setLang(e.target.value)}>
            {locales.map(code => <option key={code} value={code}>{languageNames[code]}</option>)}
          </select>
          <label className="label" htmlFor="embed-code">{s.embedCode}</label>
          <textarea id="embed-code" className="field code" rows={3} readOnly value={code} onFocus={e => e.currentTarget.select()} />
        </div>
      )}
    </Box>
  );
}

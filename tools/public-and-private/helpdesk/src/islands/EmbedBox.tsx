import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Box } from "../components/box.tsx";
import { Globe } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Settings: the form inside the company's own website — the websites
// allowed to show it (the page's frame-ancestors lists only them; every
// other site is refused), and a code to paste: a plain frame, no script —
// nothing of the company's website runs here, nothing of Support runs
// there. (A Chest of contract 0.4 refuses every frame of a public page
// today: the box says so; README, "Needs from the SDK".)
export function EmbedBox({ origins, publicAddress, canSettings, languages, t }: { origins: string[]; publicAddress: string; canSettings: boolean; languages: { code: string; name: string }[]; t: { settings: Catalogue["settings"]; embedTitle: string } }) {
  const s = t.settings;
  const [lang, setLang] = useState(languages[0]?.code ?? "en");
  const [pending, setPending] = useState(false);
  const base = publicAddress.replace(/\/$/u, "");
  const title = t.embedTitle.replace(/["<>&]/gu, "");
  // The frame's height, written in the pasted code (the company's page,
  // not ours: its own policy decides).
  const code = `<iframe src="${base}/?embed=1&amp;lang=${lang}" ` + `title="${title}" style="width:100%;height:1100px;border:0" loading="lazy"></iframe>`;
  async function save(value: string) {
    setPending(true);
    const r = await call("saveSettings", { input: { frameOrigins: value } });
    setPending(false);
    if (r.ok) toast({ id: "embed", text: s.saved });
  }
  return (
    <Box title={s.embed} icon={<Globe />}>
      <p className="hint">{s.embedHint}</p>
      <p className="notice warm small">{s.embedNotYet}</p>
      <form className="stack" onSubmit={e => { e.preventDefault(); void save(String(new FormData(e.currentTarget).get("origins") ?? "")); }}>
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
            {languages.map(({ code: c, name }) => <option key={c} value={c}>{name}</option>)}
          </select>
          <label className="label" htmlFor="embed-code">{s.embedCode}</label>
          <textarea id="embed-code" className="field code" rows={3} readOnly value={code} onFocus={e => e.currentTarget.select()} />
        </div>
      )}
    </Box>
  );
}

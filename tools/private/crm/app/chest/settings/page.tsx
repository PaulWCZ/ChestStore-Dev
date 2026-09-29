import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { stageWords } from "../../../lib/page-data.ts";
import { viewer } from "../../../lib/session.ts";
import { StagesEditor } from "./stages-editor.tsx";
import { SettingsTabs } from "./tabs.tsx";

// The stages of the pipeline, for managers: names, order, chance to win.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const sql = db();
  const { stages, names } = await stageWords(sql, t);
  const counts = new Map((await sql<{ stage_id: string; n: number }[]>`select stage_id, count(*)::int as n from deals group by stage_id`).map(r => [String(r.stage_id), r.n]));
  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1>{t.settings.title}</h1>
          <p className="lede">{t.settings.intro}</p>
        </div>
        <SettingsTabs current="stages" t={t} />
      </div>
      {can(member, "stages") ? (
        <StagesEditor stages={stages.map(s => ({ id: s.id, kind: s.kind, name: s.name ?? "", shown: names[s.id]!, standard: s.key ? t.stages[s.key] : null, probability: s.probability, deals: counts.get(s.id) ?? 0 }))} locale={v.locale} t={t} />
      ) : <p className="notice">{t.settings.readOnly}</p>}
    </main>
  );
}

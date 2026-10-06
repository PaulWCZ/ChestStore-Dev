import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, Tabs } from "@argentic/chest-ui/components";
import { formatDate, type Catalogue, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { fieldsByObject } from "../lib/fields.ts";
import { formLinesToCheck } from "../lib/leads.ts";
import { answerLink, stageWords } from "../lib/page-data.ts";
import { words } from "./words.ts";

// The parts of the settings (managers): the stages of the pipeline, the
// team's own fields and the form answers to check — the kit's link tabs
// (the address keeps the part).
function SettingsTabs({ current, t }: { current: "stages" | "fields" | "forms"; t: Catalogue }) {
  return (
    <Tabs label={t.settings.tabs} current={current} items={[
      { id: "stages", label: t.settings.stagesTab, href: "/chest/settings" },
      { id: "fields", label: t.settings.fieldsTab, href: "/chest/settings/fields" },
      { id: "forms", label: t.check.tab, href: "/chest/settings/forms" },
    ]} />
  );
}

// The stages of the pipeline, for managers: names, order, chance to win.
export async function settingsPage({ member, locale: lang, t }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const sql = db();
  const { stages, names } = await stageWords(sql, t);
  const counts = new Map((await sql<{ stage_id: string; n: number }[]>`select stage_id, count(*)::int as n from deals group by stage_id`).map(r => [String(r.stage_id), r.n]));
  return {
    title: t.settings.title,
    body: (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>{t.settings.title}</h1>
            <p className="lede">{t.settings.intro}</p>
          </div>
          <SettingsTabs current="stages" t={t} />
        </div>
        {can(member, "stages") ? (
          <Island name="StagesEditor" props={{ stages: stages.map(s => ({ id: s.id, kind: s.kind, name: s.name ?? "", shown: names[s.id]!, standard: s.key ? t.stages[s.key] : null, probability: s.probability, deals: counts.get(s.id) ?? 0 })), locale, t: words.settings(t) }} />
        ) : <p className="notice">{t.settings.readOnly}</p>}
      </div>
    ),
  };
}

// The team's own fields, for managers: on companies, contacts and deals.
export async function fieldsPage({ member, t }: PageContext): Promise<View> {
  const fields = await fieldsByObject(db(), t);
  return {
    title: t.settings.fields.title,
    body: (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>{t.settings.fields.title}</h1>
            <p className="lede">{t.settings.fields.intro}</p>
          </div>
          <SettingsTabs current="fields" t={t} />
        </div>
        {can(member, "fields") ? <Island name="FieldsEditor" props={{ fields, t: words.settings(t) }} /> : <p className="notice">{t.settings.fields.readOnly}</p>}
      </div>
    ),
  };
}

// The form answers a manager checks (lib/leads.ts): lines that may sit in
// the wrong person's file — the form gave another email, or the line was
// filed before Clients kept who filled the form in. Open the answer in
// Forms, then "Right person" or move it.
export async function formsCheckPage({ member, locale: lang, t }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const manager = can(member, "records.delete.any");
  const list = manager ? await formLinesToCheck(db(), member) : { rows: [], total: 0 };
  return {
    title: t.check.tab,
    body: (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>{t.check.tab}</h1>
            <p className="lede">{t.check.intro}</p>
          </div>
          <SettingsTabs current="forms" t={t} />
        </div>
        {!manager ? <p className="notice">{t.check.readOnly}</p>
          : list.rows.length === 0 ? <div className="empty-box"><EmptyState title={t.check.empty} /></div>
          : <Island name="CheckList" props={{ rows: list.rows.map(r => ({ id: r.id, when: formatDate(r.at, locale, { dateStyle: "medium", timeStyle: "short", timeZone: member.timeZone }), form: r.form, body: r.body, who: r.who, why: r.why, contact: r.contact, link: answerLink({ kind: "form", data: r.data as Record<string, string | number | null> }) })), t: words.check(t) }} />}
      </div>
    ),
  };
}

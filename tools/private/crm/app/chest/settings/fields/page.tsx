import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { fieldsByObject } from "../../../../lib/fields.ts";
import { viewer } from "../../../../lib/session.ts";
import { SettingsTabs } from "../tabs.tsx";
import { FieldsEditor } from "./fields-editor.tsx";

// The team's own fields, for managers: on companies, contacts and deals.
export default async function FieldsSettings() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const fields = await fieldsByObject(db());
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>{t.settings.fields.title}</h1>
          <p className="lede">{t.settings.fields.intro}</p>
        </div>
        <SettingsTabs current="fields" t={t} />
      </div>
      {can(member, "fields") ? <FieldsEditor fields={fields} t={t} /> : <p className="notice">{t.settings.fields.readOnly}</p>}
    </div>
  );
}

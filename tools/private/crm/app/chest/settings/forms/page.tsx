import { EmptyState } from "@argentic/chest-ui/components";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { formatDate } from "../../../../lib/i18n/index.ts";
import { formLinesToCheck } from "../../../../lib/leads.ts";
import { answerLink } from "../../../../lib/page-data.ts";
import { viewer } from "../../../../lib/session.ts";
import { SettingsTabs } from "../tabs.tsx";
import { CheckList } from "./check-list.tsx";

// The form answers a manager checks (lib/leads.ts): lines that may sit in
// the wrong person's file — the form gave another email, or the line was
// filed before Clients kept who filled the form in. Open the answer in
// Forms, then "Right person" or move it.
export default async function FormsCheck() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const manager = can(member, "records.delete.any");
  const list = manager ? await formLinesToCheck(db(), member) : { rows: [], total: 0 };
  return (
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
        : <CheckList rows={list.rows.map(r => ({ id: r.id, when: formatDate(r.at, locale, { dateStyle: "medium", timeStyle: "short" }), form: r.form, body: r.body, who: r.who, why: r.why, contact: r.contact, link: answerLink({ kind: "form", data: r.data as Record<string, string | number | null> }) }))} t={t} />}
    </div>
  );
}

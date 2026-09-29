"use client";

import { PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useState, useTransition } from "react";
import { Flag } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { limits, priorities, type Priority } from "../../../lib/model.ts";
import { removeRule, restoreRule, saveRule } from "../actions.ts";
import { Box } from "./settings-view.tsx";

type Rule = { id: string; field: "text" | "from"; value: string; tag: string | null; priority: Priority | null; assignee: string | null; assigneeName: string | null };
type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; priority: Catalogue["priority"]; peoplePicker: PeoplePickerWords };

// Rules on arrival, in one sentence each: "Contains 'invoice' → tag
// Invoice, to Sofia". Written by an administrator in a short form: when,
// then what.
export function RulesBox({ rules, team, tags, canSettings, t }: { rules: Rule[]; team: { id: string; name: string }[]; tags: string[]; canSettings: boolean; t: Words }) {
  const s = t.settings;
  const [field, setField] = useState<"text" | "from">("text");
  const [assignee, setAssignee] = useState<{ id: string; name: string }[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const said = (r: Rule) => [
    r.field === "text" ? format(s.ruleText, { value: r.value }) : format(s.ruleFrom, { value: r.value }),
    [r.tag && format(s.ruleSetTag, { tag: r.tag }), r.priority && format(s.ruleSetPriority, { priority: t.priority[r.priority] }), r.assigneeName && format(s.ruleSetAssignee, { name: r.assigneeName })].filter(Boolean).join(", "),
  ].join(" → ");
  return (
    <Box title={s.rules} icon={<Flag />}>
      <p className="hint">{rules.length === 0 ? s.noRules : s.rulesHint}</p>
      {rules.length > 0 && (
        <ol className="list-rows rules">
          {rules.map(r => (
            <li key={r.id}>
              <span className="spacer">{said(r)}</span>
              {canSettings && <button type="button" className="link-button danger" disabled={pending} onClick={() => start(async () => {
                const x = await removeRule(r.id);
                if (!x.ok) return void toast({ text: format(t.errors[x.error], {}), tone: "error" });
                toast({ id: `rule-${r.id}`, text: s.ruleDeleted, undo: async () => { const back = await restoreRule(x.value); return back.ok || t.errors[back.error]; } });
              })}>{s.deleteRule}</button>}
            </li>
          ))}
        </ol>
      )}
      {canSettings && (
        <form className="stack rule-form" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          start(async () => {
            const r = await saveRule({ field, value: String(d.get("value") ?? ""), tag: String(d.get("tag") ?? ""), priority: String(d.get("priority") ?? ""), assignee: String(d.get("assignee") ?? "") });
            if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? { max: limits.tag }), tone: "error" });
            form.reset();
            setAssignee([]);
            toast({ id: "rule", text: s.saved });
          });
        }}>
          <div className="two">
            <div>
              <label className="label" htmlFor="rule-field">{s.ruleWhen}</label>
              <select id="rule-field" className="select" value={field} onChange={e => setField(e.target.value as "text" | "from")}>
                <option value="text">{s.ruleFields.text}</option>
                <option value="from">{s.ruleFields.from}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rule-value">{s.ruleValue}</label>
              <input id="rule-value" name="value" className="field" required maxLength={100} placeholder={field === "from" ? "client.fr" : ""} />
            </div>
          </div>
          <div className="three">
            <div>
              <label className="label" htmlFor="rule-tag">{s.ruleTag}</label>
              <input id="rule-tag" name="tag" className="field" list="rule-tags" maxLength={limits.tag} />
              <datalist id="rule-tags">{tags.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <div>
              <label className="label" htmlFor="rule-priority">{s.rulePriority}</label>
              <select id="rule-priority" name="priority" className="select" defaultValue="">
                <option value="">{s.ruleNothing}</option>
                {[...priorities].reverse().map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
              </select>
            </div>
            <div>
              <PeoplePicker id="rule-assignee" name="assignee" label={s.ruleAssignee} value={assignee} onChange={setAssignee} search={localSearch(team)} suggestions={team.slice(0, 8)} suggestionsLabel={s.team} labels={{ ...t.peoplePicker, placeholder: s.ruleNobody }} />
              {/* The kit's single picker cannot be emptied: "nobody" is a button. */}
              {assignee.length > 0 && <button type="button" className="link-button" onClick={() => setAssignee([])}>{s.ruleClear}</button>}
            </div>
          </div>
          <div><button type="submit" className="button soft" disabled={pending}>{s.addRule}</button></div>
        </form>
      )}
    </Box>
  );
}

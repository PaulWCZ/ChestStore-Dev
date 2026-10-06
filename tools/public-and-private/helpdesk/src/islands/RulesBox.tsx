import { call, fill, toast } from "@argentic/chest-app/client";
import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { Box } from "../components/box.tsx";
import { Flag } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { limits, priorities, type Priority } from "../shared/model.ts";

type Rule = { id: string; field: "text" | "from"; value: string; tag: string | null; priority: Priority | null; assignee: string | null; assigneeName: string | null };
type Words = { settings: Catalogue["settings"]; priority: Catalogue["priority"]; peoplePicker: PeoplePickerWords };

// Settings: rules on arrival, in one sentence each: "Contains 'invoice' →
// tag Invoice, to Sofia". Written by an administrator in a short form:
// when, then what. Deleted with Undo (a rule keeps its place in the order).
export function RulesBox({ rules, team, tags, canSettings, t }: { rules: Rule[]; team: { id: string; name: string }[]; tags: string[]; canSettings: boolean; t: Words }) {
  const s = t.settings;
  const [field, setField] = useState<"text" | "from">("text");
  const [assignee, setAssignee] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState(false);
  const said = (r: Rule) => [
    r.field === "text" ? fill(s.ruleText, { value: r.value }) : fill(s.ruleFrom, { value: r.value }),
    [r.tag && fill(s.ruleSetTag, { tag: r.tag }), r.priority && fill(s.ruleSetPriority, { priority: t.priority[r.priority] }), r.assigneeName && fill(s.ruleSetAssignee, { name: r.assigneeName })].filter(Boolean).join(", "),
  ].join(" → ");
  async function remove(r: Rule) {
    setPending(true);
    const x = await call("removeRule", { id: r.id });
    setPending(false);
    if (!x.ok) return;
    const gone = x.value;
    toast({ id: `rule-${r.id}`, text: s.ruleDeleted, undo: async () => { const back = await call("restoreRule", { rule: gone }, { quiet: true }); return back.ok || back.message; } });
  }
  async function add(form: HTMLFormElement) {
    const d = new FormData(form);
    setPending(true);
    const r = await call("saveRule", { rule: { field, value: String(d.get("value") ?? ""), tag: String(d.get("tag") ?? ""), priority: String(d.get("priority") ?? ""), assignee: String(d.get("assignee") ?? "") } });
    setPending(false);
    if (!r.ok) return;
    form.reset();
    setAssignee([]);
    toast({ id: "rule", text: s.saved });
  }
  return (
    <Box title={s.rules} icon={<Flag />}>
      <p className="hint">{rules.length === 0 ? s.noRules : s.rulesHint}</p>
      {rules.length > 0 && (
        <ol className="list-rows rules">
          {rules.map(r => (
            <li key={r.id}>
              <span className="spacer">{said(r)}</span>
              {canSettings && <button type="button" className="link-button danger" disabled={pending} onClick={() => void remove(r)}>{s.deleteRule}</button>}
            </li>
          ))}
        </ol>
      )}
      {canSettings && (
        <form className="stack rule-form" onSubmit={e => { e.preventDefault(); void add(e.currentTarget); }}>
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
              <PeoplePicker id="rule-assignee" name="assignee" label={s.ruleAssignee} value={assignee} onChange={setAssignee} search={localSearch(team)} suggestions={team.slice(0, 8)} suggestionsLabel={s.team} clearable labels={{ ...t.peoplePicker, placeholder: s.ruleNobody }} />
            </div>
          </div>
          <div><button type="submit" className="button soft" disabled={pending}>{s.addRule}</button></div>
        </form>
      )}
    </Box>
  );
}
